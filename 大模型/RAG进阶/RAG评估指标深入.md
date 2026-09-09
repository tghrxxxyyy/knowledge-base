# RAG 评估指标深入

> 对应 Exploding Gradients RAGAS 与 TruLens；在「RAG深入/RAG评估」基础上的指标深挖。

## 一、背景与挑战

RAG 质量受**检索**与**生成**双重影响，单一端到端分数无法定位问题、也无法指导优化。要深入诊断，需把指标拆细、把「为什么得分低」说清楚。

更深层挑战：

- 忠实度如何自动、稳定地判定(避免 LLM 评委自相矛盾)。
- 上下文相关性(Context Relevance)与答案相关性(Answer Relevancy)易混淆。
- 指标间存在权衡(召回高 vs 噪声多)。
- 评测集需覆盖真实分布，否则线下高分线上翻车。

## 二、核心原理

分层指标体系：

**检索层**
- Recall@k：相关文档是否在 Top-k。
- MRR / NDCG：排序质量。
- Context Relevance：检索片段整体与问题的相关比例。

**生成层**
- Faithfulness(忠实度)：答案论断是否都被上下文蕴含。
- Answer Relevancy(答案相关性)：答案是否切题(与问题语义对齐)。
- 无害性/合规性：安全维度。

RAGAS 用「LLM 拆解论断 + 蕴含判定」实现忠实度自动计算；TruLens 用「上下文相关性、 groundedness、答案相关性」三角评估。

## 三、形式化与数学基础

忠实度以论断蕴含定义。把答案拆为论断集 $\{c_1,\dots,c_m\}$， groundedness：

$$\mathrm{Faith}=\frac{1}{m}\sum_{j=1}^{m}\mathbb{1}\big[c_j \text{ 可被上下文 } C \text{ 蕴含}\big]$$

上下文相关性：

$$\mathrm{CtxRel}=\frac{|\{片段_i \in C : \mathrm{rel}(片段_i, q)=1\}|}{|C|}$$

NDCG 引入位置权重(见 RAG 评估基础)：

$$\mathrm{NDCG@k}=\frac{\sum_{i=1}^{k}\frac{2^{rel_i}-1}{\log_2(i+1)}}{\mathrm{IDCG@k}}$$

## 四、代码实现

```python
from ragas import evaluate
from ragas.metrics import (
    context_recall, context_precision,
    faithfulness, answer_relevancy,
)

results = evaluate(
    data,
    metrics=[context_recall, context_precision,
             faithfulness, answer_relevancy],
)
# 分层看：检索层(context_*) vs 生成层(faithfulness/relevancy)
print(results)
```

## 五、与其他技术对比

| 指标 | 层 | 关注 | 自动计算 |
|------|----|------|----------|
| Context Recall | 检索 | 找全 | LLM |
| Context Precision | 检索 | 排前/无噪 | LLM |
| Faithfulness | 生成 | 无幻觉 | LLM |
| Answer Relevancy | 生成 | 切题 | LLM |

## 六、常见误区

- 只看答案流畅，无视忠实度(幻觉可流畅)。
- 把 Context Relevance 与 Answer Relevancy 混为一谈。
- 忠诚度高但上下文本身无关，答案仍无用(需检索层一起看)。
- 用单一综合分决策，丢失分层归因能力。

## 七、与开源书·权威来源对应

- RAGAS：https://github.com/explodinggradients/ragas
- TruLens：https://github.com/truera/trulens
- 基础见「RAG深入/RAG评估」「RAG深入/向量检索与相似度」。

## 八、面试题

- 为何 RAG 评估必须分检索与生成两层？
- Faithfulness 与 Answer Relevancy 的区别？
- 忠实度高但答案仍差，可能问题出在哪一层？

## 九、演进与趋势

评估从「离线批测」走向「在线连续评测」：生产 trace 自动抽样进评估集，指标回灌告警与回归。针对多跳、Agentic、长上下文的专用指标(如多跳忠实度)持续涌现，并与可观测性打通。

## 十、小结

深入评估要分层、可归因：检索层看 Context Recall/Precision，生成层看 Faithfulness/Answer Relevancy。指标需组合解读、结合真实分布评测集，才能可靠驱动 RAG 优化。
