import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { trace } from '@opentelemetry/api';

/**
 * 中间件：将 OTel traceId 同步到 HTTP 响应头
 *
 * 功能：
 *   1. 从 OTel active span 提取 W3C 标准 traceId (32 位 hex)
 *   2. 写入 x-request-id 和 x-trace-id 响应头
 *   3. 兼容已有的 x-request-id 机制（向后兼容）
 *
 * 使用方式：
 *   import { TraceSyncMiddleware } from '@rare0619/nestjs-tracing';
 *
 *   // 在 AppModule 中注册
 *   export class AppModule implements NestModule {
 *     configure(consumer: MiddlewareConsumer) {
 *       consumer.apply(TraceSyncMiddleware).forRoutes('*');
 *     }
 *   }
 */
@Injectable()
export class TraceSyncMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction): void {
        const activeSpan = trace.getActiveSpan();
        if (activeSpan) {
            const traceId = activeSpan.spanContext().traceId;
            // 向后兼容旧 x-request-id + 新标准 x-trace-id
            res.header('x-request-id', traceId);
            res.header('x-trace-id', traceId);
        }
        next();
    }
}
