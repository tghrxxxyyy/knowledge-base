# 重排序 ReRank

> 对应 Datawhale llm-universe「重排序」与 mlabonne/llm-course「RAG / Re-ranking」；RAG 标配的「检索 → 重排」两段式。

## 一、背景与挑战

向量检索为追求速度，使用「双塔(bi-encoder)」架构：查询与文档分别独立编码，相似度只是二者向量的简单运算，**无法在编码时让查询与文档深度交互**。因此向量召回 Top-N 里常混有「语义相近但答非所问」的文档。

要在有限上下文里塞入真正相关的片段，必须在召回后用更精细的模型重新排序——这就是重排器(Reranker)的作用。它是 RAG 从「能用」到「好用」的关键一跃。

## 二、核心原理

标准两段式：

1. **粗召回**：双塔嵌入从全库取 Top-N(如 50)，快但不精。
2. **精排**：交叉编码器(cross-encoder)对「(查询, 文档)」逐对联合编码打分，取 Top-k(如 5)，慢但准。

交叉编码器把查询与文档拼在一起送入 Transformer，能捕捉细粒度词级交互，精度远高于双塔；但因其无法预计算文档向量、需逐对推理，只能用于小候选集，故必须「先召回再重排」。实践中召回 N=20~100、重排取 k=5~10 是常见配置。

## 三、形式化与数学基础

双塔打分仅依赖各自编码 $E_q(q), E_d(d)$：

$$s_{\text{bi}}(q,d)=f\big(E_q(q), E_d(d)\big)$$

交叉编码器联合编码，参数量用于查询-文档交互：

$$s_{\text{cross}}(q,d)=g\big(\mathrm{Enc}([q;\text{sep};d])\big)$$

由于 $g$ 能看到双方全部 token，表达力 $\gg f$，但推理复杂度从 $O(1)$ 预计算变为 $O(N)$ 在线逐对，故 N 必须先用向量检索压到很小，否则延迟不可接受。

## 四、代码实现

```python
from sentence_transformers import CrossEncoder

reranker = CrossEncoder("BAAI/bge-reranker-large")
pairs = [(query, doc) for doc in retrieved]
scores = reranker.predict(pairs)
top = [retrieved[i] for i in sorted(range(len(scores)), key=lambda j: -scores[j])[:5]]
```

若候选集较大(如 >200)，可先按向量分数截断，再做交叉编码器重排，平衡延迟与精度。

## 五、与其他技术对比

| 阶段 | 模型 | 速度 | 精度 | 可否预计算 |
|------|------|------|------|------------|
| 召回 | 双塔 | 快 | 中 | 是 |
| 重排 | 交叉编码器 | 慢 | 高 | 否 |
| (可选)迟交互 | ColBERT | 中 | 高 | 部分 |

## 六、常见误区

- 直接对所有文档重排，候选集太大导致成本与延迟爆炸；必须先用向量召回缩小范围。
- 重排阈值设错，丢弃正确但低分文档。
- 检索与重排用不同嵌入空间却直接拼分数比较。
- 认为重排可替代召回优化，忽视召回本身漏掉的文档重排无能为力。
- 重排后未做去重，重复片段挤占上下文。

## 七、与开源书·权威来源对应

- Datawhale llm-universe「重排序」：https://datawhalechina.github.io/llm-universe/
- mlabonne/llm-course「RAG / Re-ranking」。
- Sentence-Transformers Cross-Encoder 文档。

## 八、面试题

- 为什么 RAG 常用「召回 + 重排」而非只用向量检索？
- 交叉编码器与双塔嵌入的本质差异？
- 重排的候选集 N 过大或过小各有什么问题？

## 九、演进与趋势

重排器从 cross-encoder 走向更轻量的「迟交互(ColBERT)」「LLM 直接重排」以及「列表式(listwise)重排」。也有工作把重排与主检索统一为单一可微管线，并探索重排结果的缓存以降本，进一步压榨精度与速度的平衡。

## 十、小结

重排是「先快后准」的关键一环：双塔负责从全库粗召回，交叉编码器负责在候选集内精排。坚持「小候选集 + 同空间对齐」的工程纪律，才能兼顾效果与成本；重排取 k 与召回 N 需按评估调优。
