# OpenTelemetry 在 LLM 链路

> 对应 OpenTelemetry 官方文档（Trace API、GenAI Semantic Conventions）与 vllm-project/vllm、huggingface/transformers 埋点实践。

## 一、背景与挑战

可观测生态（Prometheus、Jaeger、Grafana 等）已围绕 OpenTelemetry（OTel）形成标准：统一的 Trace/Metric/Log 数据模型与 exporter。LLM 应用若要复用这套成熟体系，而不是另造私有埋点，就必须把链路接入 OTel，否则会陷入「看板孤岛」——推理指标在一个系统、业务指标在另一个，无法关联。挑战在于：OTel 原生语义约定面向通用服务，缺乏 LLM 特有的 token、模型、采样参数、工具调用等概念，需要映射到 GenAI Semantic Conventions，且必须在埋点时做好脱敏（提示含用户隐私）。

## 二、核心原理

接入 OTel 的标准步骤：

1. 初始化 SDK：配置 TracerProvider、 exporter（OTLP 到后端）、采样器。
2. 埋点：在推理前后用 `tracer.start_as_current_span` 包裹各阶段（retrieve/generate/guardrail）。
3. 语义属性：按 GenAI 约定写入 `gen_ai.request.model`、`gen_ai.usage.prompt_tokens` 等，使跨系统可比。
4. 上下文传播：自动 propagator 在 HTTP/gRPC 边界传递 trace 上下文。
5. 脱敏：在 span 属性写入前过滤/截断敏感文本，避免隐私泄露。
6. 导出与查询：OTLP 推送到 Jaeger/Tempo，做链路查询、告警与大盘。

脱敏应在统一拦截器处完成，而非散落各埋点：所有写入 span 的文本先过脱敏规则（遮蔽 PII、截断超长输出），默认安全、按需显式放开。这样既能满足合规，又避免某个埋点遗漏导致泄露。敏感字段（提示、PII）建议默认脱敏、按需显式放开，并把脱敏规则版本一并纳入配置管理。脱敏规则应随合规要求演进并纳入评审，避免过期。

## 三、形式化与数学基础（含 LaTeX）

采样率 $r$ 直接影响追踪成本。设每 span 平均开销为 $c_{\text{span}}$，请求数 $n$，则：

$$
\text{cost}\approx n\cdot c_{\text{span}}\cdot r_{\text{sample}}
$$

更精细地，按重要性加权采样（如错误必采、长尾必采）使成本固定而覆盖率提升：

$$
r(x)=\begin{cases}1,& \text{error}(x)\ \text{or}\ \text{tail}(x)\\ r_0,& \text{otherwise}\end{cases}
$$

LLM 特有成本还需计入 token 维度：导出属性体积随输出长度增长，需限长脱敏。

## 四、代码实现

```python
# 在 LLM 生成处接入 OTel（结构示意）
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.exporter.otlp.proto.grpc import OTLPSpanExporter

trace.set_tracer_provider(TracerProvider())
tracer = trace.get_tracer("llm-app")

with tracer.start_as_current_span("generate") as sp:
    sp.set_attribute("gen_ai.request.model", "llm-7b")
    sp.set_attribute("gen_ai.request.temperature", 0.7)
    sp.set_attribute("gen_ai.usage.prompt_tokens", 128)
    out = model.generate(prompt)
    sp.set_attribute("gen_ai.response.id", out.id)
```

## 五、与其他技术对比

- 私有埋点：可控但不可移植，难以接入现有 APM 与告警，长期维护成本高。
- 仅日志：无因果链，无法跨组件钻取。
- OTel：标准化、生态成熟、可移植，配合 GenAI 约定即可表达 LLM 语义，是可持续选择。

## 六、常见误区

- 「全量采样压垮后端」：需用 tail/错误优先采样控制成本。
- 「未脱敏敏感属性」：提示与输出含 PII，写入 span 前必须过滤。
- 「span 名带动态变量」：应稳定命名、变量放属性，否则聚合失效。
- 「忽略 GenAI 约定」：自定义属性无法跨工具对比，建议对齐语义约定。

## 七、与开源书·权威来源对应

- OpenTelemetry 官方文档：SDK、Context Propagation、GenAI Semantic Conventions。
- vllm-project/vllm：兼容 OTel 的追踪与指标导出。
- huggingface/transformers：forward/生成钩子可挂 OTel span。

## 八、面试题

- LLM 链路哪些属性必须脱敏？如何在埋点层做？
- 为什么推荐用 OTel 而非私有埋点？
- 如何用采样在成本与覆盖率间平衡？错误必采如何实现？

## 九、演进与趋势

GenAI Semantic Conventions 持续完善（工具调用、embeddings、RAG 各阶段），使 LLM span 跨厂商可比；OTel 与评测、成本系统共享 trace 模型，形成统一可观测底座；自动埋点（框架集成）降低接入成本。

接入成熟度路径：
- 起步：仅对 generate 打 span，快速获得端到端时延。
- 进阶：按 GenAI 约定补全 token、模型、采样参数属性，支持跨系统对比。
- 成熟：框架级自动埋点 + 尾部采样 + 脱敏策略，把可观测变成默认能力而非额外负担。
OTel 的价值在于「写一次埋点，到处可观测」，避免被单一 APM 厂商锁定。

补充要点：
- 脱敏拦截器应覆盖所有 span 属性写入点，避免遗漏。
- 采样策略应保证错误与长尾请求必采，关键信号不丢。

## 十、小结

OpenTelemetry 以标准化 Trace/Metric/Log 与 exporter 生态，是 LLM 链路接入现有可观测体系的捷径。落地需对齐 GenAI 语义约定、按重要性采样控制成本、并在属性层脱敏，其权威基础是 OpenTelemetry 官方规范与 vLLM/Transformers 实践。
