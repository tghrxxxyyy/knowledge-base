# Cross-Encoder 重排

> 对应 Nogueira & Cho, *Relevance Feedback with Multi-scale Document Compression* 及 Nogueira et al. BERT 重排工作 (2019)；Sentence-Transformers `CrossEncoder`；Cohere/ voyage/BGE-reranker 系列；与 bi-encoder 向量召回、多路召回、RAG 精排链路配套。检索质量的最后一公里。

## 一、背景与挑战

双塔（bi-encoder）把 query 与 doc **分别**编码为向量，用内积/余弦打分：

- 优点：doc 向量可离线建库，在线查询只编码一次 query，毫秒级；
- 缺点：query 与 doc **无逐词交互**，细粒度语义（否定、单位、实体精确匹配、复杂约束）容易「向量像但语义不对」。

用户要的是：宽召回 + 窄精排。Cross-Encoder（CE）把 `query [SEP] doc` **拼成一个序列**进 BERT/RoBERTa 等，输出相关性标量：

- 优点：深层交叉注意力可建模 token 级交互，精度通常显著高于 bi-encoder；
- 缺点：每个 (q,d) 对都要完整前向，**无法离线预计算 doc 分数**，对全库打分计算量爆炸。

因此 CE 的定位非常清晰：**只对 Top-K 候选（通常 20～200）精排**，永远放在向量/稀疏召回之后。

## 二、核心原理

### 2.1 结构

```text
[CLS] q_1..q_m [SEP] d_1..d_n [SEP]  →  Encoder  →  h_CLS  →  Linear  →  s(q,d)
```

交叉层堆叠使每个位置的表示都依赖另一侧 token，比双塔的「两个独立池化向量」表达力强得多。实现上可用单卡批处理多对，但显存与延迟随候选数线性升。

### 2.2 训练目标

- **Pointwise**：sigmoid + BCE，或排序用的 margin；
- **Pairwise**：对 (正例, 负例) 的 hinge/logistic；
- **Listwise**：softmax over list + CE；
- 负样本挖掘：随机负、BM25 硬负、上一阶段 bi-encoder 的高分假阳（hard negative）最关键。

### 2.3 在 RAG / 搜索中的位置

```text
Query
 → 多路召回（稠密向量 + BM25 + 图/GDE 等）  万级→百级
 → Cross-Encoder / LLM rerank               百级→5～20
 → （可选）多样性/时效性/去重规则
 → 生成或列表展示
```

**去重**（同 URL 同 chunk 策略）、**最大长度截断策略**、**分数校准**（不同模型分数不可直接比）都是上线细节。

## 三、形式化与数学基础

令 $x=[q;d]$ 拼接 token 序列，编码器 $\theta$：

$$ s_\theta(q,d)=W\,h_{[CLS]}(x)+b $$

Pointwise 逻辑损失：

$$ \mathcal{L}=-\sum_i y_i\log\sigma(s_i)+(1-y_i)\log(1-\sigma(s_i)) $$

Pairwise（margin）：

$$ \mathcal{L}=\max(0,\ m-s(q,d^+)+s(q,d^-)) $$

与 bi-encoder $s_{\text{bi}}=f(q)^\top g(d)$ 相比，CE 的决策边界是**输入空间上的深函数**而非内积空间上的超平面——解释「为何 CE 更准」。计算量对比：库大小 $N$、候选 $K$：

$$ C_{\text{dense}}=\mathcal{O}(1\ \text{query encode} + \text{ANN}),\quad C_{\text{CE}}=\mathcal{O}(K\ \text{forward}) $$

取 $K\ll N$ 才经济。

## 四、代码实现

```python
# Sentence-Transformers CrossEncoder（MS MARCO 风格）
from sentence_transformers import CrossEncoder

model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2", max_length=512)

query = "如何在 Spring 中配置多数据源事务？"
docs = ["Spring 多数据源 @Transactional 失效的常见原因...", "...", "..."]
pairs = [(query, d) for d in docs]
scores = model.predict(pairs)                 # (len(docs),)
ranked = sorted(zip(docs, scores), key=lambda x: -x[1])

# 批量 + 设备
scores = model.predict(pairs, batch_size=32, show_progress_bar=True)
```

```python
# 伪代码：RAG 管道中的两阶段
def rag_retrieve(query, store, k_dense=50, k_final=8):
    cands = dense_ann(query, k=k_dense) + bm25(query, k=k_dense)
    cands = dedup(cands)
    ce_scores = reranker.predict([(query, c.text) for c in cands])
    top = topk(cands, ce_scores, k_final)
    return top
```

工程注意：`max_length` 截断会导致长文档尾部信息丢失（常见误区）；用 chunk 而非整文档进 CE；分数只在同模型内可比；GPU 批处理调 `batch_size`；生产可蒸馏成更小 CE 或 ONNX。

## 五、与其他对比

| 方案 | 交互 | 在线延迟 | 精度（典型） | 库规模友好 |
| --- | --- | --- | --- | --- |
| BM25 | 词面 | 极低 | 中（词汇鸿沟） | 好 |
| bi-encoder | 无 | 低 | 中～高 | **极好** |
| late-interaction (ColBERT) | 延迟 token 交互 | 中 | 高 | 中 |
| **Cross-encoder** | **全交互** | 高（仅 Top-K） | **最高** | 仅精排 |
| LLM 重排/生成式打分 | 最强 | 很高 | 高（贵） | 仅极小 K |

与 **ColBERT**：token 级 MaxSim，检索阶段仍可部分预计算，是召回与精排之间的折中。与 **LLM-as-reranker**：把候选列表给大模型重排，更强但更贵更慢；CE 是「小模型精排」的成本甜点。

## 六、常见误区

1. **对全库跑 Cross-Encoder**——不可行；必须先召回缩候选。
2. **CE 分数跨模型可比**——不可；换模型要重新校准或只重排不融合分数。
3. **长文档整篇塞进 CE**——`max_length` 截断丢尾；应用高质量 chunk。
4. **只用随机负例训练**——精度上不去；必须硬负例挖掘。
5. **CE 可以替代生成**——它只排序，不产出答案文本；生成仍在下一步。
6. **召回召回好了就不需要重排**——开放域与复杂约束下 CE 仍是性价比最高的涨点项之一。

## 七、与开源书·权威来源对应

- Nogueira et al., *Document Re-ranking with BERT*, 2019。
- Sentence-Transformers 文档 CrossEncoder 章节。
- MS MARCO / BEIR / TREC Deep Learning 评测传统。
- BGE-reranker、voyage-rerank、Cohere Rerank 公开说明。
- 本仓库 RAG、多路召回、检索前沿篇章。

## 八、面试题

**1. Cross-Encoder 为何准但慢？**  
要点：query-doc 联合编码，交叉注意力做 token 级交互，表达力强；每个对一次完整前向，无法离线建 doc 库，复杂度随候选数线性。

**2. 它在 RAG 里放哪？**  
要点：多路召回之后、生成之前，对 Top-K（几十到几百）精排，再截取少数进 LLM。

**3. 如何训练一个重排模型？**  
要点：相关性标注或合成对 + pointwise/pairwise 损失 + 硬负例（BM25/上一模型假阳）挖掘；蒸馏大 CE 到小模型可部署。

**4. 长文档怎么处理？**  
要点：高质量切块；CE 只看 chunk 与 query；必要时用「段落-文档」两级：chunk 精排后回传文档级聚合。

**5. CE 与 bi-encoder 如何互补？**  
要点：bi-encoder 负责规模化召回与低延迟过滤；CE 负责小候选集上的高精度交互打分；二者精度-成本互补，不可互相完全替代。

## 九、演进与趋势

- **强基座重排**：用指令型大模型/专用 reranker 处理多向量字段与长上下文。
- **蒸馏与量化**：大 CE → Mini 系 / ONNX / INT8，边缘与高 QPS 服务。
- **多模态重排**：图文联合交叉，服务电商与多模态 RAG。
- **与 Agent 结合**：重排分数作为工具返回值，Agent 决定是否追加查询或二次重排。
- **评测**：从 NDCG@10 扩到业务会话式指标与幻觉抑制（重排影响证据质量）。

## 十、小结

Cross-Encoder 用「禁止离线、必须联合编码」换来细粒度相关性，是召回漏斗里**性价比最高的精度放大器**。牢记三句话：**先召回后精排**、**硬负例决定上限**、**截断与 chunk 质量决定下限**。系统设计时把 CE 当作有明确 $K$ 预算的排序组件，分数校准与去重规则和模型本身同样重要。
