# 向量数据库在 RAG 中的工程实践

> 对应 facebookresearch/faiss 与 run-llama/llama_index 及 Kwon et al. 2023 vLLM 高效服务。

## 一、背景与挑战
RAG 上线面临高并发、低延迟、数据更新与多租户。直接裸用检索库难以满足，需要工程化封装：批量写入、增量更新、过滤、监控。

## 二、核心原理
把向量库作为检索后端，配合文档分块流水线（见分块章）与重排。工程要点：批量 embed+写入、版本化索引、按元数据过滤、缓存热点查询、用近似索引控延迟。

## 三、形式化与数学基础
端到端检索时延预算：
$T_{\text{total}} = T_{\text{embed}} + T_{\text{search}} + T_{\text{rerank}} \le T_{\text{SLA}}$
通过选索引（如 HNSW/PQ）与 nprobe/ef 把 $T_{\text{search}}$ 控制在预算内，并监控召回率不跌破阈值。

## 四、代码实现
```python
def rag_search(q, embed, index, reranker, k=5):
    vec = embed(q)
    ids = index.search(vec, 100, filter={"doc_id": cur})  # 元数据过滤
    return reranker.rank(q, fetch(ids), k)
```

## 五、与其他技术对比
相比仅用 FAISS 脚本，工程化封装提升可靠性与可观测性；相比纯生成服务，引入检索带来额外延迟，需要索引与服务协同优化（如 vLLM 式批处理）。

## 六、常见误区
误区一：索引建好就一劳永逸，实则需增量与重建策略。误区二：忽视元数据过滤，导致跨文档/越权召回。

## 七、与开源书/权威来源对应
- facebookresearch/faiss 检索内核。
- run-llama/llama_index 提供向量存储抽象。
- Kwon et al. 2023 vLLM 连续批处理服务思想可借鉴。

## 八、面试题
1. RAG 上线如何控制检索延迟？
2. 增量更新有哪些策略？
3. 如何做多租户隔离？

## 九、演进与趋势
检索与生成服务一体化调度（如把检索纳入推理批处理），并用在线指标反推索引参数自动调优。

## 十、小结
向量数据库是 RAG 的工程底座，合理的索引选型与服务化封装决定线上体验。
