import * as winston from 'winston';
import { trace, context } from '@opentelemetry/api';

/**
 * Winston format：自动注入 OTel trace.id / span.id 到每条日志
 *
 * 注入字段（符合 Elastic Common Schema）：
 *   trace.id    — 32 位 hex，全局唯一链路 ID
 *   span.id     — 16 位 hex，当前操作 Span ID
 *   trace.flags — 采样标记（1=已采样, 0=未采样）
 *
 * 使用方式：
 *   import { otelLogFormat } from '@rare0619/nestjs-tracing';
 *
 *   const format = winston.format.combine(
 *     otelLogFormat(),         // ← 加入 format 链即可
 *     winston.format.json(),
 *   );
 *
 * 输出效果：
 *   {
 *     "message": "GET /api/user 200",
 *     "trace.id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
 *     "span.id": "1234567890abcdef",
 *     "trace.flags": 1
 *   }
 *
 * Kibana APM 自动识别 trace.id → Transaction 详情页 "View Logs" 一键跳转
 */
export const otelLogFormat = winston.format((info) => {
    const activeSpan = trace.getSpan(context.active());
    if (activeSpan) {
        const spanCtx = activeSpan.spanContext();
        info['trace.id'] = spanCtx.traceId;
        info['span.id'] = spanCtx.spanId;
        info['trace.flags'] = spanCtx.traceFlags;
    }
    return info;
});
