# 双塔与 Embedding 召回

> 见「搜索推荐大模型深入/搜索推荐总览」与「嵌入几何深入/嵌入检索几何」；DSSM 思想。

## 一、背景与挑战

召回需毫秒级从亿级候选取 top-k，必须可预计算。

## 二、核心原理

**双塔（two-tower）**：query 与 doc 各过一编码器得 embedding，离线算 doc 嵌入建索引，在线只算 query 嵌入做近邻检索（见 FAISS）。训练用对比/排序损失拉正例近、负例远。可端到端用 LLM 作编码器。

## 三、数学形式

`score = E_q(q)·E_d(d)`，负采样优化。

## 四、代码实现

```python
doc_emb = doc_encoder(docs)          # 离线
q_emb = query_encoder(q)             # 在线
idx.search(q_emb, k)
```

## 五、关键要点

- 双塔无交叉，表达力受限（难建模交互）。
- 负采样质量决定上限。

## 六、与其他对比

- 双塔快可预计算；交叉编码器准但慢。

## 七、常见误区

- 双塔能建模交互——早期无交互。

## 八、与开源书对应

- Huang et al., DSSM, 2013.
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 九、面试题

- 双塔为何能在线快召回？

## 十、演进

DSSM → 强编码器 → LLM 双塔。

## 十一、小结

双塔，是召回的「快慢分流」。
