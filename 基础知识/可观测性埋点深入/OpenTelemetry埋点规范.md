# OpenTelemetry埋点规范

> 对应 OpenTelemetry 官方规范（Signals、Semantic Conventions、OTLP）与 CNCF 相关文档。

## 一、背景与挑战
在 OpenTelemetry（OTel）出现之前，可观测性领域是厂商割据的：每家的 APM 都有自己的 Agent 与私有 SDK，埋点 API 各异，指标命名与语义也不统一。由此带来三个问题。

- 厂商锁定：一旦用某家 SDK 埋了上百个点，迁移后端的成本极高，等于把数据资产押在绑定关系上。
- 语义不一致：同样是 HTTP 请求延迟，A 团队叫 http_duration，B 团队叫 api_latency，跨团队无法聚合比对。
- 重复建设：追踪、指标、日志三套 SDK 各自维护上下文传播，逻辑重复且容易不一致。

OTel 的目标是提供一套厂商中立的 API/SDK 与语义约定，让埋点一次、导出到任意后端。

## 二、核心原理
OTel 用「信号（Signal）+ 统一上下文」组织数据模型。

- 三大信号：Trace、Metric、Log，共享同一套 Resource 与 Context。
- API 与 SDK 分离：API 是埋点方依赖的稳定接口，SDK 是具体实现；库作者只依赖 API，应用负责装配 SDK。
- Resource：描述「数据从哪来」，如 service.name、service.version、host.name，随所有信号一起上报。
- Context 与 Propagator：上下文在进程内传递当前 Span，跨进程通过 Propagator 注入/提取 W3C Trace Context。
- Exporter 与 OTLP：Exporter 把信号编码后发往后端，OTLP（基于 gRPC/HTTP 的 protobuf 协议）是官方标准协议。

Collector 是可选但强烈建议的一环：应用把数据发给 Collector，由它做批处理、重试、过滤、脱敏、路由与扇出，应用与后端解耦。

## 三、形式化与数学基础
把数据模型抽象为信号集合：

$$ Signal \in \{Trace,\ Metric,\ Log\} $$

每个样本都是「载荷 + Resource + Context」的组合：

$$ sample = (payload,\ R,\ C),\quad R = \text{Resource},\ C = \text{Context} $$

导出链路是可插拔的函数组合。设 Exporter 为 $E$，处理管线为 $P$，后端为 $B$：

$$ data_{backend} = E(P(sample)) $$

批处理的收益可用吞吐与延迟权衡刻画。设单条发送开销 $c$、批大小 $b$，则每条平均网络开销降至 $c/b$，但引入了最大 $b$ 条的缓冲延迟与内存占用：

$$ mem \approx b \cdot size_{sample} $$

因此 $b$ 需在吞吐、延迟与内存之间取平衡，Collector 的 batch processor 正是做这件事。

## 四、代码实现
装配 Resource 与 Exporter，并体现 API 与 SDK 的分层。

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

# Resource 描述服务身份，随所有信号上报
resource = Resource.create({
    "service.name": "cart",
    "service.version": "1.0.0",
    "deployment.environment": "prod",
})

provider = TracerProvider(resource=resource)
# 经 Collector 而非直连后端，保留批处理与路由能力
exporter = OTLPSpanExporter(endpoint="otel-collector:4317")
provider.add_span_processor(BatchSpanProcessor(exporter))
trace.set_tracer_provider(provider)

tracer = trace.get_tracer(__name__)   # 库侧只用 API，不感知后端
```

典型 Collector 配置片段（概念示意）：

```yaml
receivers:
  otlp:
    protocols:
      grpc: {endpoint: 0.0.0.0:4317}
processors:
  batch: {}
  memory_limiter: {}
exporters:
  otlp:
    endpoint: backend:4317
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp]
```

应用只依赖 API 与 OTLP 端点，后端更换时只需改 Collector 配置，业务代码零改动。

## 五、与其他技术对比

| 维度 | OpenTelemetry | 厂商私有 SDK | 自研埋点框架 |
| --- | --- | --- | --- |
| 厂商中立 | 是 | 否，易锁定 | 取决于实现 |
| 语义统一 | 有语义约定 | 各自为政 | 需自行制定 |
| 三信号统一 | 是，共享上下文 | 常割裂 | 通常只覆盖部分 |
| 迁移成本 | 低 | 高 | 中 |
| 学习成本 | 抽象层较多 | 较低 | 视规模而定 |

代价是抽象层带来的复杂度：API/SDK/Collector/Exporter 分层较多，初期理解成本高于直接用某家 Agent，但换来长期可移植性。

## 六、常见误区
- 自定义维度名与语义约定冲突，破坏跨服务可比性；应优先采用标准名。

## 七、与开源书·权威来源对应
- OpenTelemetry 官方规范定义了 Signals、Resource、Context、Semantic Conventions 与 OTLP。

## 八、面试题
1. OTel 如何做到厂商中立？API 与 SDK 分离的意义是什么？
2. Collector 的作用是什么？为什么建议经 Collector 而非直连后端？

## 九、演进与趋势
- OTel 已是 CNCF 毕业项目，逐步成为云原生可观测性的事实标准。

## 十、小结
OpenTelemetry 用厂商中立的 API/SDK、统一的语义约定与开放的 OTLP 协议，终结了埋点碎片化。它的核心价值在于「埋点一次、导出任意后端」，并通过 Collector 把应用与后端解耦。代价是抽象层带来的学习成本，但换来的是长期可移植性与跨团队可比性。
