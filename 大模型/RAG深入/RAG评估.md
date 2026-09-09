# RAG 评估

> 对应 Datawhale llm-universe「RAG 评估」与 Exploding Gradients RAGAS 框架；没有评估就没有优化方向。

## 一、背景与挑战

RAG 系统由「检索」与「生成」两阶段串联，任何一端的退化都会体现在最终答案上。然而答案「看起来通顺」并不等于「正确」——幻觉同样可以写得很流畅。因此必须建立分层的、可量化的评估体系，才能定位瓶颈、驱动迭代。

核心挑战：

- 端到端指标难以归因到具体环节。
- 忠实度(Faithfulness)需要判断答案是否真基于检索内容，而非凭空生成。
- 缺乏人工标注 reference 时召回类指标难算。
- LLM-as-Judge 存在评委模型自身的偏差与一致性问题。
- 评测集若与线上分布不一致，会出现「线下高分、线上翻车」。
- 多跳/聚合类问题需要专门的复合指标。

## 二、核心原理

评估应拆分为两条独立链路：

- **检索层**：衡量「有没有把正确上下文找回来」。指标有 Recall@k、MRR、NDCG、Context Relevance(上下文相关性)。
- **生成层**：衡量「答案好不好」。指标有 Faithfulness(忠实度)、Answer Relevancy(答案相关性)、无害性。

RAGAS 等框架用 LLM 做裁判：先把答案拆成论断(claim)，再逐条判断能否被检索上下文蕴含；结合少量人工标注自动批量打分，把难以程序化的「相关性/忠实性」判断变为可规模化的指标。

## 三、形式化与数学基础

Recall@k 衡量前 k 个结果中是否包含任一相关文档：

$$\mathrm{Recall@k}=\frac{|\{相关文档\}\cap\{检索前k\}|}{|\{相关文档\}|}$$

NDCG 引入排序位置权重，对相关文档排在更靠前给予更高分：

$$\mathrm{NDCG@k}=\frac{\mathrm{DCG@k}}{\mathrm{IDCG@k}},\quad \mathrm{DCG}=\sum_{i=1}^{k}\frac{2^{rel_i}-1}{\log_2(i+1)}$$

忠实度常定义为：从答案中拆出的每个论断(claim)，能被检索上下文蕴含的比例，即：

$$\mathrm{Faith}=\frac{1}{m}\sum_{j=1}^{m}\mathbb{1}[\text{claim}_j \subseteq \text{context}]$$

## 四、代码实现

```python
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_recall

# data 为包含 question/answer/contexts/reference 字段的数据集
results = evaluate(
    data,
    metrics=[faithfulness, answer_relevancy, context_recall],
)
print(results)
```

无人工 reference 时，可用 `context_recall` 配合 LLM 自动抽取「问题对应的黄金片段」来近似计算召回。

## 五、与其他技术对比

| 指标类型 | 代表指标 | 关注点 | 自动计算 |
|----------|----------|--------|----------|
| 检索层 | Recall@k, NDCG | 上下文是否找全、排前 | 需标注/LLM |
| 生成层 | Faithfulness | 是否基于检索、无幻觉 | LLM |
| 生成层 | Answer Relevancy | 是否切题 | LLM |
| 端到端 | RAGAS score | 综合 | LLM |

## 六、常见误区

- 只看答案流畅度，忽视忠实度——幻觉照样可以很通顺。
- 缺乏人工 reference 时直接放弃召回评估，其实可用 LLM 自动判定。
- 用单一端到端分数做决策，无法定位是检索还是生成的问题。
- 评测集与线上分布不一致，导致线下高分线上翻车。
- 把 Context Relevance 与 Answer Relevancy 混为一谈。

## 七、与开源书·权威来源对应

- Datawhale llm-universe「RAG 评估」：https://datawhalechina.github.io/llm-universe/
- RAGAS：https://github.com/explodinggradients/ragas
- Lewis et al. 2020「Retrieval-Augmented Generation」提出检索+生成范式。

## 八、面试题

- 为什么 RAG 评估要分检索与生成两层？
- 忠实度(Faithfulness)衡量的是什么？如何自动化计算？
- 没有人工标注时如何评估检索召回？
- 忠实度高但答案仍差，问题可能出在哪一层？

## 九、演进与趋势

评估从「人工抽样」走向「LLM-as-Judge 自动评测」，并出现针对多跳、长上下文、Agentic RAG 的专用指标。可信评估(可溯源、可归因)与在线 A/B 评测结合，生产 trace 自动回流评测集，形成「评估-优化」闭环，成为生产级 RAG 的标配。

## 十、小结

RAG 评估需分层、量化、可归因。检索层看召回与排序，生成层看忠实与相关，RAGAS 等工具让自动批量评测成为可能。评估驱动迭代是 RAG 优化的前提。
