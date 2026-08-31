# RAG 进阶与召回优化实战

> 板块：大模型 / RAG 　|　 返回：[README](README.md)

## 一、为什么基础 RAG 不够用

朴素 RAG（切块 → 向量化 → 召回 top-k → 拼进 prompt）在 demo 里很香，上线后常遇到：

- 召回不准：语义向量把不相关但字面相近的块排前面。
- 块太大/太小：大块噪声多，小块丢上下文。
- 缺少元数据过滤：时间、权限、来源维度没用上。
- 重排缺失：向量召回的 top-k 相关性参差。
- 多跳问题：答案分散在多段，单次召回覆盖不全。

> 结论：生产级 RAG 是一套「召回 → 过滤 → 重排 → 压缩 → 生成 → 评估」的工程链路，而非一个向量库查询。

## 二、切块（Chunking）策略对比

| 策略 | 做法 | 适用 |
|------|------|------|
| 固定长度 | 512 token 滑动窗口 | 通用，简单 |
| 语义切块 | 按标题/段落/句子边界切 | 文档结构清晰 |
| 递归切块 | 先按空行再按句号递归 | 长文容错好 |
| 父子块 | 小块检索 + 父块喂模型 | 兼顾精度与上下文 |
| 句子窗口 | 检索句 + 邻句扩充 | 细粒度问答 |

```python
# 父子块示例（伪代码）
child_chunks = split_by_sentence(doc)
parent_map = group_by_section(child_chunks)
# 检索用 child，生成用 parent
hits = vector_search(query, child_chunks, k=5)
context = [parent_map[c] for c in hits]
```

## 三、混合检索（Hybrid Search）

单一向量检索召回率有限，混合检索 = 稠密向量 + 稀疏（BM25/稀疏向量） fusion：

- **BM25**：关键词精确匹配，补向量漏掉的专有名词。
- **Dense**：语义匹配，补 BM25 漏掉的同义改写。
- **融合**：RRF（Reciprocal Rank Fusion）或加权 sum。

```
score = 0.7 * dense_score + 0.3 * bm25_score   # 或用 RRF 避免量纲问题
```

## 四、重排（Re-Rank）

向量召回 top-50 → 精排模型（cross-encoder）重排 → 取 top-5 喂给 LLM。

- 开源：BGE-Reranker、Jina Reranker、Cohere Rerank（API）。
- 收益：准确率达 10~20 个百分点的提升，是性价比最高的优化点之一。
- 代价：多一次模型推理，需控制重排候选数（50 以内）。

## 五、查询改写与多路召回

- **Query Rewriting**：用 LLM 把用户口语化问题改写成检索友好 query。
- **HyDE（假设文档嵌入）**：先让 LLM 生成「理想答案」，用答案向量去检索，拉近语义。
- **Multi-Query**：把问题拆成多个子问题并行检索，再合并（适合多跳）。

```python
sub_queries = llm.decompose(question)         # 拆成 3 个子问题
results = [retrieve(q) for q in sub_queries]
merged = dedupe_and_rank(results)
```

## 六、元数据过滤与权限

- 在向量库里存 `source / doc_id / updated_at / department / is_public`。
- 检索时先按元数据过滤（如只看本部门、只看近一年），再做向量相似度。
- 权限过滤必须在召回阶段做，不能等生成后再裁剪。

## 七、上下文压缩

召回块太多会撑爆 context 且引入噪声：

- **Selective Context**：按重要性打分裁剪。
- **LongLLMLingua**：用 LLM 压缩冗余 token。
- 经验：控制喂给生成模型的块在 4~8 个、单块 ≤ 800 token。

## 八、Self-RAG 与反思

- **Self-RAG**：生成时让模型自己决定「是否需要检索」「检索结果是否相关」「答案是否支持」。
- 通过 special token 控制检索/生成节奏，减少无谓检索与幻觉。

## 九、评测体系

| 指标 | 含义 | 工具 |
|------|------|------|
| 召回率 Recall@k | 相关块是否进 top-k | 人工标注集 |
| 答案相关性 | 是否回答问题 | LLM-as-judge |
| 忠实度 | 是否基于上下文 | 引用检查 |
| 无幻觉率 | 不编造 | 事实核验 |

- 框架：Ragas、TruLens、LangSmith、DeepEval。
- 必须建一个**标注问答集**（≥200 条）做回归，否则优化无依据。

## 十、成本与延迟优化

- 向量库用 ANN（HNSW / IVF-PQ）而非暴力检索。
- 重排模型量化部署，或用小模型。
- 缓存高频 query 的检索结果。
- 异步并行：改写、多路召回、重排并行执行。

## 十一、常见坑

- 切块不看文档结构 → 标题被切走，上下文断裂。
- 只用向量忽略 BM25 → 专有名词召回差。
- 重排候选太多 → 延迟高且无收益。
- 不做评测 → 改了一堆不知好坏。
- 把整篇文档当一块 → 噪声淹没信号。

## 十二、落地 checklist

1. 先建标注集与评测基线。
2. 语义切块 + 父子块。
3. 混合检索（dense + BM25）。
4. 加 cross-encoder 重排。
5. 加查询改写 + 元数据过滤。
6. 上下文压缩 + 缓存。
7. 持续用 Ragas 回归。

## 十三、延伸阅读

- [RAG/README](README.md)
- [上下文工程](../上下文工程/README.md)
- [智能体](../智能体/README.md)
- 论文：Self-RAG、HyDE、REALM
