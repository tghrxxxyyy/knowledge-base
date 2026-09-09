# RAG 可观测性

> 对应 LangSmith / Phoenix 等 LLM 观测平台实践；生产级 RAG 的稳定运行保障。

## 一、背景与挑战

RAG 是一条长链路：查询 → 查询变换 → 检索 → 重排 → 后处理 → 拼上下文 → 生成 → 引用。任一段退化都会体现在答案上，但**用户只看到最终答案**，无法直接定位「是哪一步出错」。

没有可观测性的系统如同黑盒：线上答错，工程师只能凭猜测回滚或重试，无法快速归因、也无法量化每次改动的收益。在流量规模上来后，这会变成运维噩梦。

## 二、核心原理

可观测性的核心是「全链路追踪 + 结构化记录」：为每一次请求记录各阶段的输入/输出/指标，并支持回放与对比。

需记录的要素：

- **query**：原始与变换后查询。
- **retrieval**：召回片段、得分、来源。
- **rerank**：重排分数与顺序变化。
- **context**：最终拼入的上下文。
- **generation**：prompt、答案、引用映射。
- **metrics**：延迟、token、忠实度/相关性评分。

工具如 LangSmith、Arize Phoenix、Langfuse 提供 trace 树与评估面板，把每次调用变成可审计、可比较的对象。

## 三、形式化与数学基础

把一次 RAG 调用看作有向无环图(DAG)上的执行：

$$\text{trace}=\{(s_i, \text{in}_i, \text{out}_i, t_i, \text{cost}_i)\}_{i=1}^{L}$$

其中 $s_i$ 为阶段、$t_i$ 为耗时、$\text{cost}_i$ 为 token 成本。端到端质量 $Q$ 可归因到各阶段贡献：若固定其余阶段仅改 $s_k$ 后 $Q$ 变化 $\Delta Q_k$，则 $\Delta Q_k$ 即为该阶段的改进贡献，支撑「在哪投入优化」的决策，避免盲目改动。

## 四、代码实现

```python
from langsmith import traceable

@traceable(name="retrieve")
def retrieve(query):
    return vectordb.similarity_search(query, k=5)

@traceable(name="generate")
def generate(context, query):
    return llm(f"基于：{context}\n问题：{query}")

# 同时记录引用与指标
run = retrieve("...").metadata  # trace 自动上报
```

Langfuse / Phoenix 提供类似 `@observe` 装饰器与 OpenTelemetry 兼容接入。

## 五、与其他技术对比

| 能力 | 日志 | 全链路 trace | 评估面板 |
|------|------|--------------|----------|
| 定位阶段 | 弱 | 强 | 强 |
| 量化改动 | 否 | 中 | 强 |
| 回放调试 | 否 | 是 | 是 |

## 六、常见误区

- 只记录最终答案，不记录中间检索结果，无法归因。
- 引用未与片段绑定，答案不可溯源。
- 忽略延迟/token 成本监控，线上成本失控。
- 有 trace 无评估，看不到改动对质量的真实影响。
- 敏感 query 明文入 trace，引发合规与隐私问题(应脱敏)。

## 七、与开源书·权威来源对应

- LangSmith 文档：https://docs.smith.langchain.com/
- Arize Phoenix：https://github.com/Arize-ai/phoenix
- Langfuse(开源观测)：https://github.com/langfuse/langfuse

## 八、面试题

- RAG 出错了，应先查检索还是生成？如何快速判断？
- 可观测性记录哪些关键信息才能有效归因？
- trace 中为什么要绑定引用(来源)？

## 九、演进与趋势

可观测性从「被动 trace」走向「主动评测闭环」：线上 trace 自动抽样进入评估集，评估分数回灌告警与回归测试。与 LLM-as-Judge 结合，实现「每一跳都可评分、每条改动可度量」，并与缓存、成本监控融合成统一运维面板。

## 十、小结

可观测性是 RAG 生产稳定的底座：全链路 trace + 引用绑定 + 成本与质量指标，让问题可归因、改动可度量。没有可观测性，RAG 优化就是盲人摸象；同时需注意 trace 的隐私脱敏。
