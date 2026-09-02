# 重排序 ReRank

> 对应 llm-universe 与 llm-course。RAG 标配的「检索→重排」两段式。

## 一、核心概念

向量检索召回 Top-N (如 50) 后，用**交叉编码器(cross-encoder)重排器**对「查询+文档」逐对打分，精排取 Top-k (如 5)。重排器理解查询与文档的细粒度交互，精度远高于双塔嵌入，但慢——故先粗召回再精排。

## 二、代码实现

```python
from sentence_transformers import CrossEncoder
reranker = CrossEncoder("BAAI/bge-reranker-large")
pairs = [(query, doc) for doc in retrieved]
scores = reranker.predict(pairs)
top = [docs[i] for i in sorted(range(len(scores)), key=lambda j:-scores[j])[:5]]
```

## 三、关键要点

| 阶段 | 模型 | 速度 | 精度 |
|------|------|------|------|
| 召回 | 双塔 | 快 | 中 |
| 重排 | 交叉编码器 | 慢 | 高 |

## 四、常见误区

- 直接对所有文档重排，成本爆炸；必须先用向量召回缩小候选。
- 重排阈值设错，丢弃正确但低分文档。

## 五、与开源书的对应

- llm-universe「重排序」：https://datawhalechina.github.io/llm-universe/
- llm-course「RAG / Re-ranking」。

## 七、面试题

- 为什么 RAG 常用「召回+重排」而非只用向量检索？
- 交叉编码器与双塔嵌入的本质差异？
