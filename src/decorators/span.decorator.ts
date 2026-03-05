import { trace, SpanStatusCode } from '@opentelemetry/api';

/**
 * 方法装饰器：自动为方法创建 OTel Span
 *
 * 功能：
 *   - 方法调用时自动创建 active span
 *   - 异常自动 recordException + 标记 ERROR 状态
 *   - 方法结束时自动 end span
 *   - 同步方法不会被强制异步化（避免不必要的事件循环延迟）
 *
 * 使用方式：
 *   import { Span } from '@rare0619/nestjs-tracing';
 *
 *   @Span('create-order')
 *   async createOrder(dto: CreateOrderDto) {
 *     // 自动创建名为 'create-order' 的 Span
 *     // 异常自动捕获
 *   }
 *
 *   @Span()  // 默认使用 类名.方法名
 *   async getUser(id: string) { ... }
 */
export function Span(name?: string): MethodDecorator {
    return (
        target: any,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor,
    ) => {
        const originalMethod = descriptor.value;
        const spanName =
            name || `${target.constructor.name}.${String(propertyKey)}`;

        descriptor.value = function (this: any, ...args: any[]) {
            const tracer = trace.getTracer('@rare0619/nestjs-tracing');

            return tracer.startActiveSpan(spanName, (span) => {
                try {
                    const result = originalMethod.apply(this, args);

                    // 异步方法：返回 Promise
                    if (result instanceof Promise) {
                        return result.then(
                            (val) => {
                                span.end();
                                return val;
                            },
                            (err) => {
                                span.recordException(err);
                                span.setStatus({
                                    code: SpanStatusCode.ERROR,
                                    message: err?.message || 'Unknown error',
                                });
                                span.end();
                                throw err;
                            },
                        );
                    }

                    // 同步方法：直接结束（不引入 async 开销）
                    span.end();
                    return result;
                } catch (err: any) {
                    // 同步方法抛出异常
                    span.recordException(err);
                    span.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: err?.message || 'Unknown error',
                    });
                    span.end();
                    throw err;
                }
            });
        };

        return descriptor;
    };
}
