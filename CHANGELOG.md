# Changelog

## [1.2.3] - 2026-03-05

### Changed
- CI/CD: 切换到 npm Trusted Publishers (OIDC) 发布，无需 NPM_TOKEN
- 发布包自动附带 Sigstore provenance 签名（供应链安全）
- 修复 `repository.url` 格式警告

## [1.2.0] - 2026-03-05

### Added
- `PgInstrumentation` — PostgreSQL (TypeORM 底层) 自动插桩
- `IORedisInstrumentation` — Redis (ioredis) 自动插桩
- `applyCustomAttributesOnSpan` — NestJS 场景下 server span 自动重命名为 `METHOD /path`
- `ignoreOutgoingRequestHook` 三重过滤（端口/path/URL）过滤 ES/APM/OTLP 噪音
- 单元测试覆盖全部模块
- `.npmignore` 防止源码发布到 npm
- `CHANGELOG.md` 版本变更日志

### Changed
- tracer.ts 提取可测试纯函数（`detectServiceName`、filter hooks）
- 优化 `@Span()` 装饰器：同步/异步双路径，异常自动 recordException

### Removed
- `NetInstrumentation` — `tcp.connect` 产生大量噪音
- `@opentelemetry/exporter-trace-otlp-http` — 重复依赖（仅用 proto）
- `@opentelemetry/instrumentation-net` — 已从代码移除

## [1.1.0] - 2026-03-04

### Added
- 初始版本：HTTP/Express 插桩、`@Span` 装饰器、`otelLogFormat` winston format
- `TraceSyncMiddleware` 响应头注入
- `TracingModule` NestJS 模块
- 智能服务名推断（env → Docker → monorepo 路径）
- `.env` 手动解析（兼容 webpack）
