# RAG 评估

> 对应 llm-universe 与 RAGAS 框架。没有评估就没有优化方向。

## 一、核心概念

RAG 评估分**检索**与**生成**两层：

- 检索指标：召回率(Recall@k)、MRR、NDCG、上下文忠诚度(Context Relevance)。
- 生成指标：答案相关性(Answer Relevance)、忠实度(Faithfulness，是否基于检索内容)、无害性。
- 端到端：RAGAS 综合打分。

## 二、代码实现（RAGAS 示意）

```python
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_recall
# dataset: 含 question, answer, contexts, reference
results = evaluate(data, metrics=[faithfulness, answer_relevancy, context_recall])
```

## 三、关键要点

| 层 | 核心指标 |
|----|----------|
| 检索 | Recall@k, Context Relevance |
| 生成 | Faithfulness, Answer Relevancy |

## 四、常见误区

- 只看答案流畅度，忽视忠实度（幻觉照样流畅）。
- 缺乏人工标注的 reference 时难以算召回。

## 五、与开源书的对应

- llm-universe「RAG 评估」：https://datawhalechina.github.io/llm-universe/
- RAGAS: https://github.com/explodinggradients/ragas

## 七、面试题

- 为什么 RAG 评估要分检索与生成两层？
- 忠实度(Faithfulness)衡量的是什么？
