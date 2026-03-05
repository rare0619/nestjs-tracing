/**
 * @rare0619/nestjs-tracing
 *
 * NestJS 全链路追踪插件（OpenTelemetry + Elastic APM）
 *
 * 快速开始：
 *   // main.ts 第一行（必须在所有 import 之前）
 *   import '@rare0619/nestjs-tracing/tracer';
 *
 *   // 日志关联（winston format 链）
 *   import { otelLogFormat } from '@rare0619/nestjs-tracing';
 *
 *   // 手动打点装饰器
 *   import { Span } from '@rare0619/nestjs-tracing';
 */

// 日志关联
export { otelLogFormat } from './winston/otel-log-format';

// 中间件
export { TraceSyncMiddleware } from './middleware/trace-sync.middleware';

// 装饰器
export { Span } from './decorators/span.decorator';

// NestJS Module
export { TracingModule } from './tracing.module';

// 注意：tracer.ts 不在此导出
// 必须通过 import '@rare0619/nestjs-tracing/tracer' 在 main.ts 第一行单独导入
