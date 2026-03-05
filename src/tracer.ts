/**
 * @rare0619/nestjs-tracing — OTel SDK 自动初始化
 *
 * ⚠️ 必须在 main.ts 第一行 import（在任何 NestJS/Express 导入之前）
 *
 * 使用方式：
 *   import '@rare0619/nestjs-tracing/tracer';
 *   import { NestFactory } from '@nestjs/core';
 *
 * 环境变量（均为可选，有智能默认值）：
 *   OTEL_SERVICE_NAME              服务名（不设则从入口路径自动推断）
 *   OTEL_EXPORTER_OTLP_ENDPOINT    APM Server 地址（默认 http://localhost:4318/v1/traces）
 *   OTEL_TRACES_SAMPLER            采样器（默认 parentbased_traceidratio）
 *   OTEL_TRACES_SAMPLER_ARG        采样率（开发 1.0 / 生产 0.1）
 *   OTEL_SDK_DISABLED              设为 'true' 禁用 SDK（无 APM 时使用）
 *   NODE_ENV                       环境标识
 */

// ============ 可导出的纯函数（供单元测试使用）============

// 在 SDK 初始化之前先加载 .env
// （因为 tracer 在 main.ts 第一行执行，NestJS 的 dotenv 尚未加载）
// 使用 fs 手动解析，避免 webpack 打包对 require('dotenv') 的干扰
try {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        for (const line of envContent.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) continue;
            const key = trimmed.slice(0, eqIdx).trim();
            const value = trimmed.slice(eqIdx + 1).trim();
            // 不覆盖已有的系统环境变量
            if (!process.env[key]) {
                process.env[key] = value;
            }
        }
    }
} catch {
    // 静默忽略：靠系统环境变量即可
}

// ============ 可导出的纯函数（供单元测试使用）============

/**
 * 智能推断服务名
 *
 * 优先级：
 *   1. OTEL_SERVICE_NAME 环境变量（显式指定）
 *   2. SERVICE_NAME 环境变量（Docker/K8s 注入）
 *   3. 从入口路径自动推断（NestJS monorepo: dist/apps/{service-name}/main.js）
 *   4. 'unknown-service' 兜底
 */
export function detectServiceName(): string {
    if (process.env.OTEL_SERVICE_NAME) return process.env.OTEL_SERVICE_NAME;
    if (process.env.SERVICE_NAME) return process.env.SERVICE_NAME;

    const entryFile = process.argv[1] || '';
    const match = entryFile.match(/dist[\/\\]apps[\/\\]([^\/\\]+)/);
    if (match) return match[1];

    return 'unknown-service';
}

/**
 * 构建 OTLP Traces 完整 URL
 * OTLPTraceExporter 的 `url` 参数不会自动追加 /v1/traces，需手动处理
 */
export function buildTracesUrl(endpoint?: string): string {
    const rawEndpoint = endpoint || 'http://localhost:4318';
    return rawEndpoint.endsWith('/v1/traces')
        ? rawEndpoint
        : `${rawEndpoint.replace(/\/+$/, '')}/v1/traces`;
}

/** 判断 incoming 请求是否应被忽略（health check 等高频低价值请求） */
export function shouldIgnoreIncoming(url: string): boolean {
    return url.includes('/health') || url.includes('/readiness');
}

/** ES / APM 等基础设施的端口，用于过滤 outgoing 噪音 span */
export function getInfraPorts(): Set<number> {
    return new Set([
        parseInt(process.env.ELASTICSEARCH_PORT || '9200', 10),
        parseInt(process.env.APM_PORT || '8200', 10),
        4317,
        4318,
    ]);
}

/** ES 内部 API 路径前缀 */
export const ES_PATH_PREFIXES = ['/_cluster/', '/_bulk', '/_template/', '/_index_template/', '/_data_stream/'];

/** 判断 outgoing 请求是否应被忽略（ES/APM/OTLP 基础设施请求） */
export function shouldIgnoreOutgoing(opts: { port?: number | string; path?: string; href?: string; hostname?: string }): boolean {
    const port = Number(opts.port);
    if (port && getInfraPorts().has(port)) return true;
    const reqPath = opts.path || '';
    if (ES_PATH_PREFIXES.some((prefix: string) => reqPath.startsWith(prefix))) return true;
    const href = opts.href || opts.hostname || '';
    if (typeof href === 'string' && (href.includes(':9200') || href.includes(':8200'))) return true;
    return false;
}

// ============ SDK 初始化（仅在未禁用时执行）============

if (process.env.OTEL_SDK_DISABLED !== 'true') {
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-proto');
    const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
    const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
    const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');
    const { IORedisInstrumentation } = require('@opentelemetry/instrumentation-ioredis');
    const { Resource } = require('@opentelemetry/resources');
    const {
        SEMRESATTRS_SERVICE_NAME,
        SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
    } = require('@opentelemetry/semantic-conventions');
    const { W3CTraceContextPropagator } = require('@opentelemetry/core');

    const serviceName = detectServiceName();
    const tracesUrl = buildTracesUrl(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
    const sdk = new NodeSDK({
        resource: new Resource({
            [SEMRESATTRS_SERVICE_NAME]: serviceName,
            [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
        }),
        traceExporter: new OTLPTraceExporter({
            url: tracesUrl,
            timeoutMillis: 10000,
        }),
        textMapPropagator: new W3CTraceContextPropagator(),
        instrumentations: [
            // ——— HTTP & Express ———
            new HttpInstrumentation({
                ignoreIncomingRequestHook: (req: any) => shouldIgnoreIncoming(req.url || ''),
                ignoreOutgoingRequestHook: (opts: any) => shouldIgnoreOutgoing(opts),
                // 重命名 incoming server span：NestJS + Express 默认只有 METHOD，改为 METHOD /path
                applyCustomAttributesOnSpan: (span: any, request: any, _response: any) => {
                    // IncomingMessage（server span）有 httpVersion 属性，ClientRequest（client span）没有
                    if (request?.httpVersion && request.method && request.url) {
                        const path = (request.url || '').split('?')[0];
                        span.updateName(`${request.method} ${path}`);
                    }
                },
            }),
            new ExpressInstrumentation(),
            // ——— 数据库 ———
            new PgInstrumentation(),             // PostgreSQL（TypeORM 底层驱动 pg）
            new IORedisInstrumentation(),         // Redis (ioredis)
            // NetInstrumentation 产生大量 tcp.connect 噪音，不启用
            // Doris 使用 MySQL 协议 — 项目中暂未安装 mysql/mysql2 驱动
            // 如需启用：npm install @opentelemetry/instrumentation-mysql2
        ],
    });

    sdk.start();
    console.log(
        `[@rare0619/tracing] initialized: service=${serviceName}, endpoint=${tracesUrl}`,
    );

    // 优雅关机：确保缓冲区中的 Span 被冲刷到网络
    const shutdown = async () => {
        await sdk.shutdown();
        console.log('[@rare0619/tracing] shutdown complete');
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // @ts-ignore — 导出供外部访问（可选）
    module.exports = { sdk };
}
