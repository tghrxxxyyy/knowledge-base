# Span 与 Trace 数据模型

> 对应 OpenTelemetry 官方 Trace/Span 数据模型与 vllm-project/vllm、microsoft/DeepSpeed 追踪结构。

## 一、背景与挑战

现代 LLM 系统由异构组件构成：网关、检索服务、推理引擎（vLLM/DeepSpeed）、护栏、插件。各自产生的事件格式不同、进程不同，若没有统一数据模型，这些信号就无法关联成「一次请求发生了什么」。挑战在于：要表达嵌套调用（生成内含检索）、并发（多路工具并行）、跨进程传播（请求从网关到推理 worker），同时保证模型足够简单以低成本落地、又足够丰富以承载 LLM 特有的语义（token、模型名、采样参数）。

OpenTelemetry 的 Trace/Span 模型已成为事实标准，但需理解其约束才能正确建模 LLM 链路。

## 二、核心原理

- Trace：一次端到端操作的完整记录，由唯一 `trace_id` 标识，可跨进程、跨服务。
- Span：Trace 中的一个有开始/结束时间的工作单元，含 `span_id`、父 `span_id`、操作名、起止时间戳、属性（key-value）、事件（带时间戳的注解）、状态（OK/ERROR）与链路（span links）。
- 父子关系：通过 `parent_span_id` 构成树；根 span 无父。并发调用是同一父下的兄弟 span。
- 上下文传播：通过 propagator 在进程边界（HTTP header、消息元数据）传递 `trace_id`+`span_id`，保证跨进程拼接。
- 属性（attributes）：承载 LLM 语义，如 `gen_ai.request.model`、`gen_ai.usage.prompt_tokens`。

## 三、形式化与数学基础（含 LaTeX）

Trace 是 span 的集合，父子关系构成有根树：

$$
\forall s\in\mathrm{span}:\; \mathrm{parent}(s)\in \mathrm{span}\cup\{\mathrm{root}\}
$$

且每个非根 span 有唯一父，形成无环结构：

$$
\nexists\ \text{cycle in } \{(s,\mathrm{parent}(s))\}
$$

端到端时延由 span 时间区间覆盖：

$$
T=\max_{s}(\mathrm{end}_s)-\min_{s}(\mathrm{start}_s)
$$

并行度可由兄弟 span 的时间重叠度度量；关键路径是使 $T$ 最小化的串行链。Span 属性为映射 $\mathrm{attrs}: \mathrm{span}\to \mathcal{K}\times\mathcal{V}$。

## 四、代码实现

```python
# 最小 Span 数据模型（结构示意）
class Span:
    def __init__(self, name, trace_id, parent=None):
        self.trace_id = trace_id
        self.span_id = gen_id()
        self.parent = parent              # 父 span 或 None（根）
        self.attrs = {}                   # 语义属性
        self.events = []                  # 带时间戳注解
        self.status = "OK"

    def set_attr(self, k, v):
        self.attrs[k] = v

# 跨进程传播：从入站上下文恢复父 span
def from_context(inbound_headers):
    trace_id, parent_id = propagator.extract(inbound_headers)
    return Span("handler", trace_id, parent=parent_id)
```

## 五、与其他技术对比

- 相比扁平日志：树模型天然表达嵌套/并发调用，支持关键路径分析。
- 相比自定义事件总线：OTel 标准化 propagator 与 exporter，跨语言、跨厂商互通。
- 相比纯指标：span 保留单次请求的因果结构，指标只给聚合。

## 六、常见误区

- 「把并发 span 误认为串行」：兄弟 span 时间重叠是正常并行，不要按时间先后错位挂父子。
- 「丢失 trace 上下文传播」：跨进程未注入 propagator，链路断裂成孤立 span。
- 「在 span 名里塞变量」：应把模型名等放属性，span 名保持稳定以便聚合。
- 「无上限地写属性」：过大属性拖慢 exporter，需脱敏与限长。

## 七、与开源书·权威来源对应

- OpenTelemetry 官方文档：Trace/Span 规范、Context Propagation、Semantic Conventions。
- vllm-project/vllm：推理侧 span 结构与导出。
- microsoft/DeepSpeed：训练侧 span/计时实践。

## 八、面试题

- 如何保证跨进程 trace_id 正确传播？propagator 的作用？
- Span 的父子和兄弟关系分别表示什么？
- 为什么 span 名应稳定、变量放属性？

## 九、演进与趋势

GenAI Semantic Conventions 正标准化 LLM span 属性（模型、token、温度、工具调用），使 span 兼具通用追踪与 LLM 语义；分布式追踪与评测、成本系统共享同一 trace 模型，形成统一可观测数据底座。

工程上建议把 trace 模型作为组织级「数据契约」：评测、监控、成本三套系统都消费同一 trace_id 空间，避免各建一套 id 体系导致关联失败。语义约定的早期投资，会在多系统联动时成倍回报。

## 十、小结

Span 与 Trace 数据模型以「trace_id + 树形 span + 上下文传播」统一异构组件信号，是聚合多组件、跨进程因果的前提。其权威基础是 OpenTelemetry 规范与 vLLM/DeepSpeed 实践，正确建模父子关系与属性语义是有效追踪的核心。
