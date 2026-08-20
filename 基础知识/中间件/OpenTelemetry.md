# OpenTelemetry 深入（Collector 管道 / SDK 埋点 / 上下文传播 / 采样策略 / 落地实践）

> OpenTelemetry（OTel）是 **可观测性领域的事实标准**：一套 API/SDK/Collector 统一采集指标（Metrics）、日志（Logs）、链路（Traces）。本篇深入拆解：Collector 管道配置、SDK 埋点细节、上下文传播、采样策略、企业落地。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 埋点碎片化 | 每个服务用不同 SDK（Zipkin/Jaeger/StatsD...），无法统一 |
| 厂商锁定 | 接入一家 APM 后被绑定，迁移成本高 |
| 三支柱割裂 | 指标/日志/链路各自独立采集，无法关联 |
| 多语言多框架 | 每种语言/框架要分别接入可观测性 |
| 协议混乱 | OTLP/Zipkin/Jaeger/Prometheus 各有一套协议 |

> 核心认知：**OTel = 「可观测性的 USB-C 接口」**——采集端统一标准，后端随便换；埋一次点，处处可用。

---

## 二、整体架构

```
应用（Instrumentation 埋点）
  ├── OTel API（指标/日志/链路 API，标准接口）
  ├── OTel SDK（实现 + 采样 + 批处理 + 上下文传播）
  └── Auto-instrumentation（自动埋点：Java Agent/语言库）

OTel Collector（采集器，核心枢纽）
  ├── Receivers（接收：OTLP/Zipkin/Jaeger/Prometheus/Filelog）
  ├── Processors（处理：采样/过滤/脱敏/批处理/重命名）
  ├── Exporters（导出：Jaeger/Prometheus/Loki/云厂商/自建后端）
  └── Pipelines（链路：接收→处理→导出，metrics/logs/traces 三条）

后端：Jaeger / Prometheus+Grafana / Loki / SkyWalking / 云厂商
```

---

## 三、三支柱（Signals）统一

| Signal | 内容 | OTel 模型 |
|--------|------|-----------|
| Traces | 调用链（Span） | `Span/Trace`：traceID/spanID/parentSpanID |
| Metrics | 指标（计数/直方图/仪表） | `Meter`：Counter/Histogram/Gauge/UpDownCounter |
| Logs | 日志（结构化） | `LogRecord`：时间戳/级别/属性/链路关联 |

**核心价值**：三者统一**关联字段**（traceID 贯穿 logs/metrics）——日志、链路、指标同一条 ID 打通。

### 3.1 Metrics 类型

| 类型 | 语义 | 使用场景 |
|------|------|----------|
| Counter | 单调递增计数 | 请求数、错误数 |
| UpDownCounter | 可增减计数 | 队列长度、在线用户 |
| Histogram | 分布统计 | 延迟、请求大小 |
| Gauge | 当前值 | CPU、内存使用率 |

### 3.2 Span 结构

```
Span = 一次操作（调用/DB 查询/消息发送）

字段：
  traceID：整条链路 ID（32 位 hex）
  spanID：当前 Span ID（16 位 hex）
  parentSpanID：父 Span（关系构成树）
  name：操作名（如 "GET /api/orders"）
  kind：类型（Client/Server/Producer/Consumer/Internal）
  start/end：时间戳
  attributes：业务属性（订单号/用户 ID）
  status：状态（OK/ERROR/UNSET）
  events：事件（异常/关键节点）
```

---

## 四、Collector 管道配置（深入）

### 4.1 完整配置示例

```yaml
# otel-collector.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
  prometheus:
    config:
      scrape_configs:
      - job_name: 'my-app'
        scrape_interval: 15s
        static_configs:
        - targets: ['localhost:8080']
  filelog:
    include: [/var/log/app/*.log]
    start_at: end

processors:
  batch:
    timeout: 5s
    send_batch_size: 1024
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
    spike_limit_mib: 128
  tail_sampling:
    decision_wait: 10s
    num_traces: 100000
    policies:
    - name: error-policy
      type: status_code
      status_code: {status_codes: [ERROR]}
    - name: slow-policy
      type: latency
      latency: {threshold_ms: 1000}
  attributes:
    actions:
    - key: environment
      value: production
      action: upsert
  redaction:
    allow_all_keys: false
    blocked_values: [Bearer\s+\S+]

exporters:
  otlp/jaeger:
    endpoint: jaeger-collector:4317
    tls: {insecure: true}
  prometheus:
    endpoint: "0.0.0.0:8889"
    namespace: "myapp"
  loki:
    endpoint: http://loki:3100/loki/api/v1/push

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, tail_sampling, batch]
      exporters: [otlp/jaeger]
    metrics:
      receivers: [otlp, prometheus]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
    logs:
      receivers: [otlp, filelog]
      processors: [memory_limiter, attributes, redaction, batch]
      exporters: [loki]
```

### 4.2 常用 Processor

| Processor | 用途 |
|-----------|------|
| batch | 批量发送（吞吐提升） |
| memory_limiter | 内存保护（防 OOM） |
| tail_sampling | 尾部采样（保关键链路） |
| attributes | 添加/修改属性（环境/团队） |
| resource | 添加资源信息（主机/Pod） |
| redaction | 脱敏（手机号/Token） |
| filter | 过滤（丢弃无用数据） |
| transform | 字段转换（重命名/删除） |

### 4.3 部署模式

```
Agent 模式：每个 Pod/主机一个 Collector（采集 + 批处理 + 发送）
Gateway 模式：中心化 Collector 集群（聚合 + Tail 采样 + 脱敏）
组合：Agent 采集 → Gateway 处理 → 多后端导出（标准架构）
```

---

## 五、SDK 埋点（深入）

### 5.1 自动埋点（Java Agent）

```bash
# 零侵入：Java Agent 自动埋点
java -javaagent:opentelemetry-javaagent.jar \
     -Dotel.service.name=order-service \
     -Dotel.traces.exporter=otlp \
     -Dotel.exporter.otlp.endpoint=http://collector:4317 \
     -jar app.jar
```

自动覆盖：HTTP（Servlet/WebFlux）、JDBC、Redis、Kafka、gRPC、线程池等主流框架。

### 5.2 手动埋点（核心链路）

```java
// 获取 Tracer（服务启动时）
Tracer tracer = GlobalOpenTelemetry.getTracer("order-service");

// 手动创建 Span（关键业务逻辑）
Span span = tracer.spanBuilder("process_payment")
    .setAttribute("order_id", orderId)
    .setAttribute("payment_method", "wechat")
    .startSpan();

try (Scope scope = span.makeCurrent()) {
    // 业务逻辑...
} catch (Exception e) {
    span.recordException(e);
    span.setStatus(StatusCode.ERROR);
    throw e;
} finally {
    span.end();
}
```

### 5.3 指标埋点

```java
// Counter 示例
Meter meter = GlobalOpenTelemetry.getMeter("order-service");
LongCounter orderCreated = meter.counterBuilder("order.created")
    .setDescription("订单创建数")
    .build();

orderCreated.add(1, Attributes.of(
    AttributeKey.stringKey("channel"), "app"
));
```

---

## 六、上下文传播（W3C Trace Context）

```
traceparent: 00-{traceID}-{spanID}-{flags}
tracestate:  厂商自定义扩展

HTTP/gRPC/MQ 自动注入（SDK 拦截）→ 跨服务串联
```

| 传播载体 | 注入方式 |
|----------|----------|
| HTTP | `traceparent` Header |
| gRPC | Metadata（traceparent） |
| Kafka | 消息 Header |
| 线程 | Context 传递（手动） |
| 异步 | 传播器（Baggage） |

### 6.1 跨服务串联

```
Service A → 请求带 traceparent: 00-abc...-def...-01
  → Service B 收到 → SDK 解析 → 创建子 Span（parent=def...）
  → B 调 C → 生成新 traceparent（spanID 更新，traceID 不变）
  → 整条链路共享 traceID → 后端聚合为完整调用链
```

---

## 七、采样策略（深入）

### 7.1 三种采样

| 策略 | 说明 | 适用 |
|------|------|------|
| Head Sampling | 入口决定采样率（概率/规则），整链一致 | 高吞吐基础采样 |
| Tail Sampling | Collector 端二次采样（保留慢/错请求） | 排查慢请求 |
| Parent-based | 子 Span 跟随父采样决策 | 默认行为 |

### 7.2 生产采样组合

```
方案：Head（概率 10%）+ Tail（错误/慢 100% 保留）

效果：
  正常请求：10% 采样（成本可控）
  错误请求：100% 保留（排障不缺）
  慢请求：100% 保留（定位性能）

配置要点：
  Tail Sampling 需要缓冲（decision_wait）
  num_traces 限制内存
  规则优先级：error > slow > 其他
```

### 7.3 采样率调整

```
采样率参考：
  低流量：100%（成本可接受）
  中流量：10~50%
  高流量：1~10%
  关键业务（支付）：100%（业务强制）

动态调整：
  变更/大促期间临时提高
  按服务调整（核心服务高采样）
```

---

## 八、落地实践

### 8.1 落地路径

| 步骤 | 说明 |
|------|------|
| 1. 选后端 | Jaeger（链路）+ Prometheus/Grafana（指标）+ Loki（日志） |
| 2. 埋点 | Java Agent 自动埋点（零侵入起步）→ 核心链路手动埋点 |
| 3. 采集 | 每 Pod 一个 Collector Agent（DaemonSet） |
| 4. 汇聚 | Gateway 集群：Tail 采样 + 脱敏（手机号/Token） |
| 5. 关联 | 日志打 traceID → Loki ↔ Jaeger 一键跳转 |

### 8.2 常见坑

| 坑 | 说明 | 对策 |
|----|------|------|
| 采样过度 | 关键链路漏采 | 按业务采样规则 |
| Agent 版本漂移 | 版本不一致 | 统一版本基线 |
| Collector 单点 | Gateway 挂了 | 集群 + HA |
| 性能损耗 | Agent 开销 | 合理采样 + 关无用 exporter |
| 上下文丢失 | 异步/线程池断链 | 传播器 + 手动传递 |
| 指标基数爆炸 | 高基数标签 | 标签规范（禁止 request_id 当标签） |

---

## 九、OTel vs SkyWalking vs 传统 APM

| 维度 | OpenTelemetry | SkyWalking | 传统 APM（Datadog） |
|------|---------------|------------|---------------------|
| 定位 | 采集标准（SDK/协议） | APM 产品（端到端） | 商业 SaaS |
| 埋点 | 标准 API + 自动埋点 | 自家 Agent | 自家 Agent |
| 后端 | 任意（自带不强绑） | 自带（ES/H2） | 自家云 |
| 厂商锁定 | 无 | 中（可迁 OTel） | 强 |
| 适用 | 云原生/多后端标准 | Java 生态一体方案 | 有钱省事 |

**选型关注点**：
- 追求标准/云原生/多后端 → **OTel**；
- Java 团队要一体开箱 → **SkyWalking**；
- 商业支持 → 商业 APM（兼容 OTel 上报）。

---

## 十、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 云原生可观测性标准 | OpenTelemetry | — |
| Java 一键 APM | SkyWalking | OTel + Agent |
| 链路后端 | Jaeger | Zipkin |
| 指标后端 | Prometheus/Grafana | 云托管 Prom |
| 日志后端 | Loki | ELK |
| 商业托管 | 商业 APM（OTel 兼容） | 云可观测性套件 |

---

## 十一、与其他板块的关系

- 链路追踪见「[Jaeger 链路追踪](./Jaeger链路追踪.md)」与「[链路追踪 SkyWalking](./链路追踪SkyWalking.md)」；
- 监控指标见「[Prometheus 与 Grafana 监控](./Prometheus与Grafana监控.md)」；
- 日志体系见「[ELK 日志体系](./ELK日志体系.md)」与「[Loki](./Loki.md)」；
- SRE 视角见「[SRE与稳定性工程/02-可观测性与稳定性看护](../../SRE与稳定性工程/02-可观测性与稳定性看护.md)」。

> 一句话：**OTel = 采集标准（API/SDK/OTLP）+ 三支柱统一 + Collector 管道（接收→处理→导出）+ 上下文传播（W3C）+ 采样策略（Head+Tail）——埋一次点、后端随便换；落地四步：选后端 → 自动埋点 → Agent 采集 → Gateway 汇聚**。