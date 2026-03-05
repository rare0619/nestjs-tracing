# @rare0619/nestjs-tracing

NestJS 全链路追踪插件 — 基于 OpenTelemetry，兼容 Elastic APM / Jaeger / 任何 OTLP 后端。

## 特性

- **零配置启动**：`main.ts` 第一行 import 即可，自动推断服务名
- **白名单插桩**：仅启用项目实际使用的插桩库（HTTP、Express、PostgreSQL、Redis），避免冗余开销
- **NestJS 适配**：修复 NestJS + Express 场景下 transaction name 只显示 `GET`/`HEAD` 的问题，自动设为 `METHOD /path` 格式
- **噪音过滤**：自动过滤 health check（incoming）和 ES/APM/OTLP 基础设施请求（outgoing），保持 trace waterfall 干净
- **日志关联**：提供 `otelLogFormat()` winston format，自动注入 `trace.id` / `span.id`
- **手动打点**：`@Span()` 装饰器支持自定义 span
- **优雅关机**：SIGTERM/SIGINT 时自动 flush 缓冲区中的 span

## 快速开始

### 1. 安装

```bash
npm install @rare0619/nestjs-tracing
```

### 2. 初始化（main.ts 第一行）

```typescript
// ⚠️ 必须是第一行 import，在 @nestjs/core 之前
import '@rare0619/nestjs-tracing/tracer';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

> **为什么必须第一行**：OTel 通过 monkey-patch Node.js 的 `http`、`pg`、`ioredis` 等模块实现插桩。如果这些模块在 OTel 初始化之前被 `require()`，patch 将无效。

### 3. 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `OTEL_SERVICE_NAME` | 自动推断 | 服务名（优先级：此变量 > `SERVICE_NAME` > 从 `dist/apps/{name}/main.js` 路径推断） |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | APM Server / OTLP Collector 地址（自动追加 `/v1/traces`） |
| `OTEL_TRACES_SAMPLER_ARG` | `1.0` | 采样率（开发环境 `1.0` 100%，生产环境建议 `0.1` 10%） |
| `OTEL_SDK_DISABLED` | — | 设为 `true` 禁用 SDK（无 APM Server 时避免报错） |
| `NODE_ENV` | `development` | 部署环境标识（写入 `deployment.environment` resource attribute） |
| `ELASTICSEARCH_PORT` | `9200` | ES 端口（用于 outgoing 请求过滤） |
| `APM_PORT` | `8200` | APM Server 端口（用于 outgoing 请求过滤） |

tracer 会自动加载项目根目录的 `.env` 文件（无需 `dotenv` 依赖）。

## 插桩覆盖

采用**白名单模式**，仅启用项目实际使用的插桩库：

| 插桩库 | 覆盖组件 | 说明 |
|--------|---------|------|
| `HttpInstrumentation` | HTTP 请求（含 axios 出站） | 含 incoming/outgoing 过滤和 server span 重命名 |
| `ExpressInstrumentation` | Express 路由（NestJS 底层） | |
| `PgInstrumentation` | PostgreSQL（TypeORM 底层驱动 `pg`） | trace 中可见 `pg.query:SELECT` |
| `IORedisInstrumentation` | Redis（`ioredis`） | trace 中可见 `sismember`/`get` 等 |

> **关于 axios / typeorm**：无需单独插桩——`axios` 底层走 `http` 模块，`typeorm` 底层走 `pg` 驱动，已被自动追踪。

### 噪音过滤

#### Incoming 过滤（`ignoreIncomingRequestHook`）

自动忽略 K8s 健康检查等高频低价值请求：
- URL 包含 `/health` 或 `/readiness`

#### Outgoing 过滤（`ignoreOutgoingRequestHook`）

三重过滤策略，防止 ES/APM/OTLP 基础设施请求产生噪音 span：

1. **端口匹配**：ES（9200）、APM（8200）、OTLP（4317/4318）
2. **Path 匹配**：`/_cluster/`、`/_bulk`、`/_template/` 等 ES 内部 API
3. **URL 匹配**：href 中包含 `:9200` 或 `:8200`

#### NestJS Transaction Name 修复

NestJS + Express 场景下，`ExpressInstrumentation` 无法正确捕获路由 pattern，导致 transaction name 只显示 `GET` / `HEAD`。通过 `applyCustomAttributesOnSpan` 自动重命名为 `GET /user/v1/userinfo` 格式。

### 扩展插桩

如需添加更多插桩库，修改 `src/tracer.ts` 中的 `instrumentations` 数组：

```typescript
// MySQL / Doris（MySQL 协议兼容）
npm install @opentelemetry/instrumentation-mysql2
// 在 tracer.ts 中添加：
const { MySQL2Instrumentation } = require('@opentelemetry/instrumentation-mysql2');
// instrumentations: [..., new MySQL2Instrumentation()]

// RabbitMQ
npm install @opentelemetry/instrumentation-amqplib
// 在 tracer.ts 中添加：
const { AmqplibInstrumentation } = require('@opentelemetry/instrumentation-amqplib');
```

## 日志关联

将 Winston 日志与 Trace 关联，实现 Kibana APM Transaction → Logs 一键跳转：

```typescript
import { otelLogFormat } from '@rare0619/nestjs-tracing';

const logger = winston.createLogger({
  format: winston.format.combine(
    otelLogFormat(),          // ← 自动注入 trace.id / span.id
    winston.format.json(),
  ),
});
```

> **winston-elasticsearch 用户注意**：如果使用 `winston-elasticsearch` 直写 ES，需要额外处理：
> 1. 创建自定义 ES Client 并禁用 `diagnostic.removeAllListeners()`（防止 `bulk`/`cluster.health` 噪音 span）
> 2. 用 `api.context.with(ROOT_CONTEXT, ...)` 包裹 `origLog()` 调用（防止 BulkWriter 定时 flush 成为请求 span 的子 span）
>
> 详见 [kibana-apm-tracing-guide.md](../doc/kibana-apm-tracing-guide.md) 中问题 6 和问题 7。

### 生产环境：Filebeat 采集日志

生产环境推荐用 Filebeat 采集 JSON 日志文件（解耦应用与 ES，避免性能影响）：

```yaml
# filebeat.yml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /app/logs/gateway-*.log
      - /app/logs/user-service-*.log
      - /app/logs/social-service-*.log
    # JSON 解析：将日志字段提升到文档根级（trace.id 等字段需要在根级才能被 Kibana APM 关联）
    json.keys_under_root: true
    json.add_error_key: true
    json.overwrite_keys: true
    # 排除 error/exceptions 独立文件（避免重复采集）
    exclude_files: ['error-.*', 'exceptions-.*', 'rejections-.*']

  # 单独采集 error 日志
  - type: log
    enabled: true
    paths:
      - /app/logs/error-*.log
    json.keys_under_root: true
    json.add_error_key: true
    json.overwrite_keys: true
    fields:
      log.level: error
    fields_under_root: true

output.elasticsearch:
  hosts: ["${ELASTICSEARCH_HOSTS:localhost:9200}"]
  username: "${ELASTICSEARCH_USER:elastic}"
  password: "${ELASTICSEARCH_PASS:changeme}"
  index: "app-logs-%{+yyyy.MM.dd}"

setup.template.name: "app-logs"
setup.template.pattern: "app-logs-*"
setup.ilm.enabled: false

processors:
  - drop_fields:
      fields: ["agent", "ecs", "host", "input", "log.offset"]
      ignore_missing: true
```

> **关键点**：`json.keys_under_root: true` 会把 JSON 日志中的 `trace.id` 字段提升到文档根级，这样 Kibana APM 的 Logs 标签才能通过 `trace.id` 自动关联日志。

## 手动打点

```typescript
import { Span } from '@rare0619/nestjs-tracing';

export class OrderService {
  @Span('create-order')
  async createOrder(dto: CreateOrderDto) {
    // 自动创建 Span，异常自动记录
  }
}
```

## 中间件（可选）

自动将 OTel traceId 写入 `x-request-id` / `x-trace-id` 响应头：

```typescript
import { TracingModule } from '@rare0619/nestjs-tracing';

@Module({
  imports: [TracingModule],
})
export class AppModule {}
```

## 已知问题与注意事项

| 问题 | 说明 |
|------|------|
| `@elastic/elasticsearch` v8+ 噪音 | ES Client 内置 OTel diagnostic channel，会产生 `bulk`/`cluster.health` 噪音 span。需在创建 Client 时调用 `diagnostic.removeAllListeners()` |
| `NetInstrumentation` | 产生大量 `tcp.connect` 噪音 span，不建议启用 |
| `requestHook` vs `applyCustomAttributesOnSpan` | 前者只对 outgoing 请求生效，后者对 incoming/outgoing 都生效。NestJS 场景下 server span 重命名必须用后者 |
| webpack 打包兼容 | OTel 的 monkey-patch 在 webpack `target: 'node'` 下正常工作（NestJS CLI 默认配置） |

## License

Apache-2.0
