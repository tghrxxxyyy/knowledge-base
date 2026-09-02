# RAG 评估指标深入

> 见「RAG深入/RAG评估」。

## 一、背景与挑战

RAG 质量受检索与生成双重影响，须分层评估。

## 二、核心原理

检索层：Recall@k、MRR、NDCG、Context Relevance。生成层：Faithfulness(基于检索)、Answer Relevancy、无害性。

## 三、关键要点

| 层 | 指标 |
|----|------|
| 检索 | Recall@k, NDCG |
| 生成 | Faithfulness, Relevancy |

## 四、常见误区

- 只看答案流畅，无视忠实度(幻觉可流畅)。

## 五、与开源书对应

- RAGAS: https://github.com/explodinggradients/ragas

## 六、面试题

- 为何 RAG 评估必须分检索与生成两层？

## 七、小结

评估驱动是 RAG 优化的前提。
