import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { TraceSyncMiddleware } from './middleware/trace-sync.middleware';

/**
 * NestJS 追踪模块
 *
 * 导入此模块将自动注册 TraceSyncMiddleware（全局路由）
 *
 * 使用方式：
 *   import { TracingModule } from '@rare0619/nestjs-tracing';
 *
 *   @Module({
 *     imports: [TracingModule],
 *   })
 *   export class AppModule {}
 *
 * 注意：tracer.ts 的 import 必须在 main.ts 第一行单独完成，
 * 不能依赖 NestJS DI 容器（因为初始化必须早于所有模块加载）。
 */
@Module({
    providers: [TraceSyncMiddleware],
    exports: [TraceSyncMiddleware],
})
export class TracingModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(TraceSyncMiddleware).forRoutes('*');
    }
}
