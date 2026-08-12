# Jaeger（分布式链路追踪 / 云原生追踪）

> Jaeger 是 CNCF 毕业的**分布式链路追踪系统**，源自 Uber 开源，以「分布式上下文传播 + 采样 + 存储 + 可视化」成为云原生追踪事实标准（OpenTelemetry 后端）。相比 Zipkin（轻量但功能少）、SkyWalking（APM 全栈但重），Jaeger 以**专注追踪 + OpenTelemetry 原生支持**独树一帜。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 调用链看不清 | 请求经过 10 个服务，哪个慢？哪个错？ |
| 上下文传播 | 跨进程/跨线程/跨 MQ 如何串联？ |
| 采样难题 | 全量追踪存储成本高，不采样找不到问题 |
| 与 OpenTelemetry 集成 | OTel 已成为事实标准，追踪后端需原生支持 |

> 核心认知：**Jaeger = OpenTelemetry 原生后端**——OTel 采集的 trace 直接写 Jaeger，无需额外转换。

---

## 二、Jaeger 核心原理

### 2.1 架构

```
应用（OpenTelemetry SDK 埋点）
  ├── OTLP（OpenTelemetry Protocol）
  ├── Jaeger Thrift（兼容旧版）
  └── Zipkin Thrift（兼容 Zipkin）

Jaeger Collector（收集器）
  ├── 接收 trace（gRPC/HTTP）
  ├── 预处理（校验/丰富/采样）
  └── 写入存储

Jaeger Query（查询服务）
  ├── 查询 trace（按 traceID/服务/操作/标签）
  └── UI（依赖图/时间线/对比）

存储后端
  ├── Cassandra（大规模）
  ├── Elasticsearch（推荐，与日志联动）
  ├── Kafka（缓冲，异步写入存储）
  └── 内存（开发测试）
```

### 2.2 核心概念

| 概念 | 说明 |
|------|------|
| Trace | 一次完整请求的调用链（由 Span 组成） |
| Span | 调用链中的一个工作单元（一次 RPC/一次 DB 查询） |
| Span Context | 上下文（traceID/spanID/父 spanID/采样标志） |
| Tag | Span 的标签（KV 对，用于查询） |
| Log | Span 的时间线日志（事件+时间戳） |
| Baggage | 跨 Span 的 KV 上下文（类似 HTTP Header 传播） |

### 2.3 上下文传播（W3C Trace Context）

```
请求方 → traceparent: 00-{traceID}-{spanID}-01
       → tracestate: 自定义状态

接收方 → 解析 traceparent → 提取 traceID
       → 创建新 span，parentSpanID = 上游 spanID
       → 生成新的 traceparent 传给下游
```

**选型关注点**：W3C Trace Context 是事实标准，保证跨语言/跨系统的上下文传播兼容。

### 2.4 采样策略

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| Head-based（头部采样） | 在入口决定采样，整条链一致 | 高吞吐（默认） |
| Tail-based（尾部采样） | 在尾部决定采样（先收再筛选） | 找慢请求/错误请求 |
| 概率采样 | 按比例（如 1%）随机采样 | 通用 |
| 限速采样 | 每秒最多 N 个 trace | 限流保护 |
| 属性采样 | 按属性（如错误=全部采样） | 错误优先 |

**选型关注点**：高吞吐场景 → Head-based 概率采样；想找慢请求/错误 → Tail-based（Jaeger 支持）。

---

## 三、Jaeger vs Zipkin vs SkyWalking

| 维度 | Jaeger | Zipkin | SkyWalking |
|------|--------|--------|------------|
| CNCF 状态 | 毕业项目 | 孵化中 | Apache 顶级 |
| 定位 | 专注追踪 | 轻量追踪 | APM 全栈（指标+日志+追踪） |
| 采集协议 | OTLP 原生 | Zipkin Thrift | 自有探针（字节码增强） |
| 语言支持 | 多语言（OTel SDK） | 多语言 | Java/.NET/Node/Go/PHP 等 |
| 存储 | ES/Cassandra/Kafka | ES/Cassandra/内存 | ES/H2/MySQL/TiDB |
| 性能损耗 | 低（OTel SDK） | 低 | 中（字节码增强） |
| 无侵入 | 需 SDK 埋点 | 需 SDK 埋点 | Java 字节码增强（无侵入） |
| 指标 | 无（需配 Prometheus） | 无 | 有（内置） |
| 日志 | 无（配 ELK/Loki） | 无 | 有 |
| 拓扑图 | 有 | 有 | 有 |
| 告警 | 无（需配 Alertmanager） | 无 | 有 |

**选型关注点**：
- 云原生 + OpenTelemetry → **Jaeger**（OTel 原生后端）
- 轻量 + 快速上手 → **Zipkin**
- Java 生态 + 无侵入 + 全栈 APM → **SkyWalking**
- 混合语言栈 → **Jaeger**（OTel 多语言 SDK 最全）

---

## 四、OpenTelemetry + Jaeger（事实标准组合）

```
应用代码（Java/Go/Python/Node...）
  ├── OpenTelemetry SDK（自动埋点：HTTP/gRPC/DB/MQ）
  ├── OpenTelemetry Collector（接收/处理/导出）
  │   ├── 接收：OTLP/Jaeger/Zipkin/Prometheus
  │   ├── 处理：采样/过滤/丰富/批量
  │   └── 导出：Jaeger/Prometheus/云厂商
  └── Jaeger（存储/查询/可视化）
```

**选型关注点**：OpenTelemetry 是可观测性的事实标准（采集层），Jaeger 是追踪后端之一。OTel Collector + Jaeger 是云原生追踪推荐组合。

---

## 五、Jaeger 生产部署

### 5.1 部署模式

| 模式 | 说明 |
|------|------|
| All-in-One | 二进制包含全部（开发测试） |
| 生产部署 | Collector + Query + ES/Cassandra |
| Kubernetes | Jaeger Operator（CRD 管理） |
| 托管服务 | AWS X-Ray / GCP Cloud Trace（非 Jaeger 但同功能） |

### 5.2 关键配置

| 配置 | 说明 |
|------|------|
| 采样率 | 生产通常 1%~10% |
| 存储 | ES 推荐（与日志联动查询） |
| 索引 | 按天滚动索引（便于清理） |
| 缓存 | Query 层缓存热点 trace |
| 安全 | TLS + 认证（生产必备） |

---

## 六、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 云原生追踪 | Jaeger + OTel | Zipkin |
| Java 无侵入 APM | SkyWalking | — |
| 轻量追踪 | Zipkin | Jaeger |
| 多云统一追踪 | Jaeger + OTel | Datadog APM |
| 与日志联动 | Jaeger + ELK | SkyWalking |
| 找慢请求 | Jaeger（Tail-based） | — |
| 错误追踪 | Jaeger + Alertmanager | — |

---

## 七、与其他板块的关系

- 链路追踪原理（SkyWalking）见「[链路追踪 SkyWalking](./链路追踪SkyWalking.md)」；
- 可观测性三支柱见「[云上可观测性体系](./云上可观测性体系.md)」；
- 云原生可观测性见「[云原生/可观测性](../../云原生/可观测性.md)」；
- 监控告警见「[Prometheus + Grafana](./Prometheus与Grafana监控.md)」。

> 一句话：**Jaeger = OpenTelemetry 原生后端 + W3C Trace Context 传播 + 灵活采样（Head/Tail-based）+ ES/Cassandra 存储；选型先看「生态（云原生→Jaeger，Java→SkyWalking）」，再定「采样策略（高吞吐→概率采样，找问题→Tail-based）」**。
