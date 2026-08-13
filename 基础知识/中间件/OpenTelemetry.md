# OpenTelemetry（可观测性统一标准 / Metrics·Logs·Traces）

> OpenTelemetry（OTel）是 **CNCF 孵化项目，可观测性领域的事实标准**：一套 API/SDK/Collector 统一采集**指标（Metrics）、日志（Logs）、链路（Traces）**三支柱，厂商无关。相比 SkyWalking（APM 产品，绑定自家后端）、Jaeger（追踪后端）、Prometheus（指标采集），OTel 解决的是**「采集层的统一」**：一套埋点，任何后端（Jaeger/Prometheus/云厂商）都能接。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

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

## 二、核心原理

### 2.1 整体架构

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

### 2.2 三支柱（Signals）统一

| Signal | 内容 | OTel 模型 |
|--------|------|-----------|
| Traces | 调用链（Span） | `Span/Trace`：traceID/spanID/parentSpanID |
| Metrics | 指标（计数/直方图/仪表） | `Meter`：Counter/Histogram/Gauge/UpDownCounter |
| Logs | 日志（结构化） | `LogRecord`：时间戳/级别/属性/链路关联 |

**核心价值**：三者统一**关联字段**（traceID 贯穿 logs/metrics）——日志、链路、指标同一条 ID 打通。

### 2.3 上下文传播（W3C Trace Context）

```
traceparent: 00-{traceID}-{spanID}-{flags}
tracestate:  厂商自定义扩展

HTTP/gRPC/MQ 自动注入（SDK 拦截）→ 跨服务串联
```

### 2.4 采样（Sampling）

| 策略 | 说明 |
|------|------|
| Head Sampling | 入口决定采样率（概率/自定义规则），整链一致 |
| Tail Sampling | Collector 端二次采样（保留慢/错请求） |
| Parent-based | 子 Span 跟随父采样决策 |

**选型关注点**：生产高吞吐 → Head 概率采样（1~10%）；排查慢请求 → Collector 端 Tail 采样（错误/慢链路必留）。

### 2.5 Collector 部署模式

```
Agent 模式：每个 Pod/主机一个 Collector（采集 + 批处理 + 发送）
Gateway 模式：中心化 Collector 集群（聚合 + Tail 采样 + 脱敏）
组合：Agent 采集 → Gateway 处理 → 多后端导出（标准架构）
```

---

## 三、核心特性

| 特性 | 说明 |
|------|------|
| 标准统一 | 一套 API/SDK/协议（OTLP），厂商无关 |
| 三支柱一体 | 指标/日志/链路统一采集与关联 |
| 多语言 | Java/Go/Python/Node/.NET/Rust/JS 等 20+ 语言 |
| 自动埋点 | Java Agent/零代码侵入（字节码增强） |
| 多后端 | Jaeger/Prometheus/Loki/云厂商（Exporters 插件化） |
| 上下文传播 | W3C Trace Context 标准（跨语言互通） |
| Collector 管道 | 接收→处理→导出全插件化（过滤/脱敏/采样） |
| 生态标准 | 已成为新工具默认协议（后端都在兼容 OTLP） |

---

## 四、OTel vs SkyWalking vs 传统 APM

| 维度 | OpenTelemetry | SkyWalking | 传统 APM（Datadog/New Relic） |
|------|---------------|------------|-------------------------------|
| 定位 | 采集标准（SDK/协议） | APM 产品（端到端） | 商业 SaaS |
| 埋点 | 标准 API + 自动埋点 | 自家 Agent（Java 强） | 自家 Agent |
| 后端 | 任意（自带不强绑） | 自带（ES/H2） | 自家云 |
| 指标 | 统一（+ 转发 Prometheus） | 内置 | 内置 |
| 日志 | 统一（+ 转发 Loki/ELK） | 弱 | 强 |
| 厂商锁定 | 无 | 中（可迁 OTel） | 强 |
| 上手成本 | 中（组件多） | 低（一体） | 最低 |
| 适用 | 云原生/多后端标准 | Java 生态一体方案 | 有钱省事 |

**选型关注点**：
- 追求标准/云原生/多后端 → **OTel**（埋点一次，后端随便换）；
- Java 团队要一体开箱 → **SkyWalking**（底层 Agent 也可输出 OTel）；
- 商业支持/多语言公司 → 商业 APM（也兼容 OTel 上报）。

---

## 五、生产实践

### 5.1 落地路径

| 步骤 | 说明 |
|------|------|
| 1. 选后端 | Jaeger（链路）+ Prometheus/Grafana（指标）+ Loki（日志） |
| 2. 埋点 | Java Agent 自动埋点（零侵入起步）→ 核心链路手动埋点 |
| 3. 采集 | 每 Pod 一个 Collector Agent（DaemonSet） |
| 4. 汇聚 | Gateway 集群：Tail 采样 + 脱敏（手机号/Token） |
| 5. 关联 | 日志打 traceID → Loki ↔ Jaeger 一键跳转 |

### 5.2 常见坑

- **采样过度**：生产概率采样太低 → 关键业务链路要 100% 保留（采样规则按业务）；
- **Agent 版本漂移**：多应用 Agent 版本不一致 → 统一版本号/基线管理；
- **Collector 单点**：Gateway 模式必须集群 + 高可用；
- **性能损耗**：默认 Agent 有一定开销 → 合理采样 + 关闭不必要 exporter。

---

## 六、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 云原生可观测性标准 | OpenTelemetry | — |
| Java 一键 APM | SkyWalking | OTel + Agent |
| 链路后端 | Jaeger | Zipkin |
| 指标后端 | Prometheus/Grafana | 云托管 Prom |
| 日志后端 | Loki | ELK |
| 商业托管 | 商业 APM（OTel 兼容） | 云可观测性套件 |

---

## 七、与其他板块的关系

- 链路追踪见「[Jaeger 链路追踪](./Jaeger链路追踪.md)」与「[链路追踪 SkyWalking](./链路追踪SkyWalking.md)」；
- 监控指标见「[Prometheus 与 Grafana 监控](./Prometheus与Grafana监控.md)」；
- 日志体系见「[ELK 日志体系](./ELK日志体系.md)」与「[Loki](./Loki.md)」；
- 云上可观测性见「[云上可观测性体系](./云上可观测性体系.md)」。

> 一句话：**OTel = 采集标准（API/SDK/OTLP）+ 三支柱统一（Metrics/Logs/Traces）+ Collector 管道（采集/采样/脱敏/导出）——埋一次点、后端随便换；选型先定「后端组合（Jaeger+Prometheus+Loki）」，再选「埋点方式（自动 Agent→手动核心链路）」，最后配「采样策略 + Collector 高可用」**。
