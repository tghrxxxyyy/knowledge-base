# LLM 应用可观测性基础

> 对应 OpenTelemetry 可观测性范式与 vllm-project/vllm、huggingface/transformers 执行钩子实践。

## 一、背景与挑战

生产级 LLM 应用通常是多组件管线：检索（RAG）、插件/工具调用、多模型路由、安全护栏、长上下文拼接等。一次用户请求可能跨越多个服务与数秒到数十秒的时延，任何一环异常（检索召回差、插件超时、某模型降级）都会体现为「答案质量下降」或「变慢」，但传统日志只记录单点事件，无法回答「慢在哪里、错在哪一步」。LLM 应用因此需要比传统服务更细的可观测性：不仅看总时延，还要钻取每一步的输入输出与耗时。

挑战在于：LLM 链路含非结构化文本、流式输出、异步并行调用，且成本（token）需与性能一并度量，传统 APM 默认模型（请求/响应）不完全适配。

## 二、核心原理

可观测性的三大支柱在 LLM 场景下延伸：

1. 日志（Logs）：记录每步的提示片段、输出、错误，但需与上下文关联。
2. 指标（Metrics）：QPS、时延分位、token 消耗、错误率、缓存命中率。
3. 追踪（Traces）：把一次请求拆成带父子关系的调用链（span），表达检索→重写→生成→校验的因果与并发结构。

核心是把每次请求建模为 Trace，内部按语义切分为 Span（如 retrieve、rerank、generate、guardrail），每个 Span 记录耗时、token、属性与事件，从而支持端到端钻取与瓶颈定位。

在 LLM 场景下，span 还承载着传统服务没有的语义：提示模板版本、检索召回质量、工具调用参数、采样配置等。把这些写入 span 属性，才能使一次「答得不好」可被拆解到具体阶段，而非笼统归咎于模型。对延迟敏感场景，应把 TTFT/TPOT 设为核心 SLO 并接入告警，而不仅是全局平均时延，因为用户感知由分位值而非均值决定。

## 三、形式化与数学基础（含 LaTeX）

端到端时延分解为各 span 处理时间与排队/传输延迟之和：

$$
T=\sum_{s\in\mathrm{span}} t_s+\sum_{e\in\mathrm{edges}} \mathrm{queue}_e
$$

对关键路径（critical path，串行主导的 span 链）$\mathcal{C}$，总时延下限由关键路径决定：

$$
T_{\text{crit}}=\sum_{s\in\mathcal{C}} t_s
$$

若某 span $s^*$ 满足 $t_{s^*}\approx T_{\text{crit}}$，则它是瓶颈。平均首 token 时延（TTFT）与每输出 token 时延（TPOT）进一步刻画生成体验：

$$
\text{TTFT}=t_{\text{prefill}}+\text{queue},\qquad \text{TPOT}=\frac{t_{\text{decode}}}{N_{\text{tokens}}}
$$

## 四、代码实现

```python
# 用 span 包裹各阶段（结构示意，基于 OTel 风格 API）
def handle(req):
    with tracer.start_as_current_span("retrieve") as s:
        s.set_attribute("docs", 5)
        ctx = do_retrieve(req)
    with tracer.start_as_current_span("generate") as s:
        s.set_attribute("model", "llm-7b")
        out = model.generate(ctx)
    return out
```

## 五、与其他技术对比

- 日志：只能看单点，缺乏跨组件因果与并发结构。
- 指标：擅长聚合趋势，但无法下钻到单次请求的「哪一步慢」。
- 追踪：天然表达嵌套/并发调用与瓶颈，是 LLM 应用定位问题的主手段；三者互补。

## 六、常见误区

- 「只记录总时延不钻取子 span」：无法定位瓶颈。
- 「遗漏异步/并行调用」：并行 span 未正确挂到父 trace，链路断裂。
- 「把完整提示/输出无脱敏入库」：泄露隐私，应在 span 属性层脱敏。
- 「忽略 token 成本度量」：只盯时延，忽视成本归因。

## 七、与开源书·权威来源对应

- OpenTelemetry 官方文档：Trace/Span 数据模型与 API。
- vllm-project/vllm：服务侧可观测钩子与指标暴露。
- huggingface/transformers：forward/生成钩子可用于埋点。

## 八、面试题

- 为何 LLM 应用需要比传统服务更细的追踪？哪些 span 必采？
- 如何用 trace 定位「答案慢」的瓶颈？关键路径是什么？
- TTFT 与 TPOT 分别反映什么体验问题？

## 九、演进与趋势

从「调用级」走向「语义级追踪」：把提示模板版本、中间推理步骤（CoT）、工具调用参数纳入 span 属性；标准化 LLM span 语义约定（如 GenAI semantic conventions）让跨厂商、跨框架追踪可比；并与评测、成本看板联动形成统一可观测面。

落地建议：
- 在 span 中记录模型版本、采样参数与缓存命中，使「质量波动」可被「配置变化」解释。
- 对工具/插件调用单独成 span，区分「模型决策慢」与「工具执行慢」。
- 把用户级 trace 采样与成本归因打通（见「生产环境采样与成本归因」），实现体验与成本双视角。
语义级追踪让 LLM 应用从「黑盒生成」变为「可解释管线」。建议把关键路径时延分位值设为核心 SLO，而非仅看均值。

补充要点：
- 关键路径时延分位值应设为核心 SLO，而非仅看均值。
- 工具/插件调用应独立成 span，区分模型与工具耗时。

## 十、小结

LLM 应用可观测性以追踪为核心，将多组件管线拆成带父子关系的 span，配合日志与指标实现端到端钻取与瓶颈定位。其权威基础是 OpenTelemetry 与 vLLM/Transformers 实践，是 LLM 应用可靠运维的底座，须覆盖时延、token 成本与隐私脱敏。
