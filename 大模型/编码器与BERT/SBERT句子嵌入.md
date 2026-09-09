# SBERT 句子嵌入

> 对应 Reimers & Gurevych, *Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks*, 2019。

## 一、背景与挑战

BERT 能产出高质量 token 表示，但「取句向量」这一步它并不擅长：原生 `[CLS]` 或均值池化得到的向量各向异性严重，直接做余弦检索效果甚至不如朴素 GloVe 词袋。而在语义检索、聚类、去重、RAG 召回等场景，我们需要的是「一次编码、随时比对」的句向量——若每次都用 BERT 对句对做交叉编码（cross-encode），开销无法承受。SBERT 正是为解决「高效、高质量句向量」而生。

## 二、核心原理

SBERT 在 BERT 之上加一个**孪生网络（siamese）** 微调阶段：两个相同权重的 BERT 分别编码句 $a,b$，池化得向量 $u,v$，用余弦相似度对齐人工标注的语义相似度（回归）或三元组（分类）。推理时每句只需编码一次，得到固定维度向量，后续用余弦/内积 + 近邻索引（ANN）批量比对，速度是 Cross-Encoder 的数百倍。

关键：训练目标让「向量几何距离」直接反映「语义距离」，把 BERT 的弱句向量「纠正」为可用嵌入。

## 三、形式化与数学基础

池化得句向量 $u=f(a), v=f(b)$。回归目标用余弦相似 + MSE：

$$
\mathcal{L}_{\text{reg}} = \bigl(\cos(u,v) - \text{sim}_{\text{gold}}(a,b)\bigr)^2
$$

三元组（triplet）目标以边际 $\epsilon$ 拉开正负例：

$$
\mathcal{L}_{\text{triplet}} = \max\!\big(0,\; \|u_a-u_p\|^2 - \|u_a-u_n\|^2 + \epsilon\big)
$$

分类（NLI 句对）可用 softmax 对拼接 $[u;v;|u-v|]$ 打分。推理相似度：

$$
\text{sim}(a,b) = \frac{u^\top v}{\|u\|\,\|v\|}
$$

## 四、代码实现

训练与推理一个 SBERT 模型：

```python
from sentence_transformers import SentenceTransformer, InputExample, losses
from torch.utils.data import DataLoader

# 1) 用句对相似度数据微调
train = [InputExample(texts=["猫坐在垫子上","一只猫在垫子上"], label=1.0),
         InputExample(texts=["猫坐在垫子上","汽车飞速行驶"], label=0.0)]
loader = DataLoader(train, shuffle=True, batch_size=8)
model = SentenceTransformer("bert-base-chinese")
model.fit(loader, losses.CosineSimilarityLoss(model), epochs=1)

# 2) 推理：每句仅编码一次
emb = model.encode(["如何学习深度学习？", "深度学习方法入门"])
print(model.similarity(emb[0], emb[1]))   # 余弦相似
```

## 五、与其他技术对比

| 方案 | 编码次数/查询 | 速度 | 精度 | 用途 |
|------|--------------|------|------|------|
| Cross-Encoder | 每对一次 | 慢 | 最高 | 重排 rerank |
| SBERT/句向量 | 每句一次 | 快 | 中高 | 召回 recall |
| BERT `[CLS]` 原生 | 每句一次 | 快 | 低 | 不推荐 |

典型检索流水线：**SBERT 召回 Top-100 → Cross-Encoder 重排 Top-10**，兼顾效率与精度。

## 六、常见误区

- 「SBERT 是全新架构」：它是 BERT + 孪生微调 + 池化，主体仍是 BERT。
- 「句向量无需训练」：无监督池化远差于 SBERT/bge 等对比训练。
- 「向量维度越高质量越好」：维度需与训练目标匹配，盲目增维收益有限。
- 「召回即用、无需重排」：SBERT 召回精度有限，关键场景应接 Cross-Encoder 重排。

## 七、与开源书·权威来源对应

- Reimers & Gurevych, *Sentence-BERT*, 2019（arXiv:1908.10084）。
- 后续句向量模型：SimCSE (Gao et al., 2021)、BGE (BAAI)、E5、GTE。
- MTEB 基准（大规模嵌入评测）。
- 编码器表示应用相关章节。

## 八、面试题

- SBERT 与 Cross-Encoder 在大模型 RAG 中如何分工（召回 vs 重排）？
- 为何 SBERT 推理比 Cross-Encoder 快数百倍？代价是什么？
- SBERT 的训练目标（回归/三元组）如何让向量距离反映语义？
- 为什么原生 BERT 句向量不适合检索，SBERT 如何修复？

## 九、演进与趋势

SBERT 之后，句向量模型走向「大规模对比训练 + 难负例挖掘」：SimCSE 用 dropout 正例、BGE/E5/GTE 用指令式检索与多语言对齐，并在 MTEB 上系统评测。与 RAG 深度绑定成为检索器标配；同时「召回—重排」两段式流水线成为生产标准架构。

## 十、小结

SBERT 用孪生网络 + 对比/回归损失微调 BERT，产出可一次编码、随时比对的句向量，速度远胜 Cross-Encoder，精度足够做召回。生产中常「SBERT 召回 + Cross-Encoder 重排」配合。最新模型（BGE 等）与 MTEB 基准以官方为准。
