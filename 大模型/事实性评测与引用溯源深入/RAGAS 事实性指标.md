# RAGAS 事实性指标

> 对应 Es et al. 2023《RAGAS: Automated Evaluation of Retrieval Augmented Generation》、Lewis et al. 2020 RAG。

## 一、背景与挑战

RAG 系统上线后，需要可重复、低成本的评估来判断「答案是否真的基于检索上下文、是否相关、检索是否到位」。人工逐条标注昂贵且不可规模化，传统整体打分（如人工满意度）又无法定位问题到底出在「检索」还是「生成」。RAGAS 的目标是提供一套**参考无关（reference-free）**的自动化指标族，无需标准答案即可评估 RAG 质量。

核心挑战：如何在没有金标答案的情况下，可信地区分「忠实于上下文」与「凭空编造」。

## 二、核心原理

RAGAS 以 LLM 作为评判（LLM-as-judge），把评测分解为多个维度：

1. **忠实度（Faithfulness）**：答案中的每个断言是否都能被检索上下文支撑，衡量「不编造」。
2. **答案相关性（Answer Relevancy）**：答案是否切题、是否回答了问题。
3. **上下文精度 / 召回（Context Precision / Recall）**：检索到的文档是否相关、是否覆盖回答问题所需证据。

评测流程：给定 (question, contexts, answer)，由 LLM 抽取答案中的断言，再逐条判断该断言是否由 context 蕴含，聚合为忠实度。

## 三、形式化与数学基础

设答案被拆为 claim 集合 C，上下文为 ctx。若断言分类器 f 判断 claim c 是否被支持：

$$
\text{Faithfulness} = \frac{|\{c \in C : f(c, ctx) = \text{supported}\}|}{|C|}
$$

答案相关性用问题 q 与答案 a 的语义对齐（常由 LLM 生成「由答案反推问题」再比对）：

$$
\text{AnswerRelevancy} = \frac{1}{N}\sum_{i} \cos\big(E(q), E(\hat q_i)\big)
$$

上下文召回以问题 q 对应的金标证据集合为准（该维度需少量标注）：

$$
\text{ContextRecall} = \frac{|\{g \in G : \exists c \in ctx, \text{relevant}(g, c)\}|}{|G|}
$$

## 四、代码实现

```python
# 忠实度计算（示意，真实评测用 RAGAS 官方 prompt）
def faithfulness(claims, context):
    supported = [c for c in claims if llm_judge(c, context) == "supported"]
    return len(supported) / max(1, len(claims))

# RAGAS 风格：抽取断言 -> 逐条判定支撑
claims = llm_extract_claims(answer)
score = faithfulness(claims, retrieved_context)
```

```python
# 调用 RAGAS 数据集评估（API 以官方为准）
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy
result = evaluate(dataset, metrics=[faithfulness, answer_relevancy])
```

## 五、与其他技术对比

- **人工标注**：准但慢且贵，无法高频回归。
- **整体 LLM 打分**：快但不可解释，难定位检索 / 生成问题。
- **RAGAS 分维度**：可定位「是检索不准还是生成编造」，且 reference-free 易批量跑。
- **依赖点**：RAGAS 质量上限受评判 LLM 能力约束，需校准。

## 六、常见误区

- **误区一：上下文包含答案即忠实**——忽视「推理跳跃」与未支撑的推断。
- **误区二：faithfulness 高 = 答案好**——它只管「不编造」，不保证「答得对 / 答得全」。
- **误区三：未区分检索与生成错误**——低分到底谁背锅需结合 context recall 看。
- **误区四：评判 LLM 永远可信**——需抽样人工校验防评判偏差。

## 七、与开源书·权威来源对应

- Es et al. 2023《RAGAS: Automated Evaluation of Retrieval Augmented Generation》（arXiv）。
- Lewis et al. 2020《RAG》定义检索增强生成范式。
- RAGAS 官方仓库与文档（指标定义、prompt 模板）。
- LangChain / LlamaIndex 集成的 RAG 评测实践。

## 八、面试题

- faithfulness 与 answer correctness 有何区别？
- RAGAS 为何是 reference-free？好处与风险？
- 如何区分检索错误与生成错误导致的低分？
- 上下文召回与精度分别衡量什么？

## 九、演进与趋势

RAGAS 从单一忠实度扩展到「忠实度 + 相关性 + 检索质量」联合评分，并引入更细的断言级、步骤级评测；与自动化回归流水线结合成为 RAG 系统的标准体检工具。具体指标与 prompt 以官方最新版本为准。

## 十、小结

RAGAS 把 RAG 评测标准化、自动化，核心价值在于用分维度、reference-free 的指标定位「检索准不准、生成编没编」，是 RAG 系统可运营化的关键一环。
