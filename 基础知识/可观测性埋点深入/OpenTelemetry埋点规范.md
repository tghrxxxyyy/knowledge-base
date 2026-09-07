# OpenTelemetry埋点规范

> 对应 OpenTelemetry (observability standard)。

## 一、背景与挑战
各家 APM 私有 SDK 锁定厂商，切换成本高，且语义不统一导致跨团队指标不可比。

## 二、核心原理
OpenTelemetry 提供厂商中立的 API/SDK 与语义约定（Semantic Conventions），统一 Trace、Metric、Log 的数据模型与导出协议（OTLP）。

## 三、形式化与数学基础
数据模型抽象为 Signal = {Trace, Metric, Log}，共用 Resource（服务标识）与 Context（trace 关联）。导出器 exporter: Signal -> 后端，可插拔。

## 四、代码实现
```python
from opentelemetry.sdk.resources import Resource
from opentelemetry.exporter.otlp.proto.grpc import OTLPSpanExporter
resource = Resource.create({"service.name": "cart"})
# 同一 SDK 可对接任意支持 OTLP 的后端
exporter = OTLPSpanExporter(endpoint="otel-collector:4317")
```

## 五、与其他技术对比
相比私有 SDK，OTel 避免锁定且语义统一；代价是抽象层带来的学习成本。

## 六、常见误区
- 自定义维度名与语义约定冲突，破坏跨服务可比性。
- 直接连后端而非经 Collector，失去批处理与路由能力。

## 七、与开源书/权威来源对应
OpenTelemetry 官方文档明确定义了 Semantic Conventions 与 OTLP 协议。

## 八、面试题
OTel 如何做到厂商中立？Collector 的作用是什么？

## 九、演进与趋势
OTel 成为 CNCF 毕业项目，逐步成为云原生可观测性的事实标准。

## 十、小结
OTel 用统一规范与开放协议终结埋点碎片化，是大规模可观测性的基础设施。
