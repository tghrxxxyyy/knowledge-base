# GraphRAG 与向量检索对比

> 对应 microsoft/graphrag 与 facebookresearch/faiss 及 run-llama/llama_index。

## 一、背景与挑战
实践中常纠结选向量 RAG 还是 GraphRAG。二者并非替代，而是在不同查询类型上各有优势，理解边界才能组合。

## 二、核心原理
向量 RAG 以语义近邻检索文本块，擅长点对点事实；GraphRAG 以图谱+社区摘要支持多跳与全局聚合。本质区别在索引结构：扁平向量 vs 结构化图。

## 三、形式化与数学基础
向量检索得分：$s = E_q(q)^\top E_d(d)$。图检索可视为在图上的随机游走或邻域聚合：
$P(v \mid q) \propto \text{rel}(q,v) \cdot \sum_{u\in N(v)} P(u \mid q)$
二者可加权融合得混合得分。

## 四、代码实现
```python
def hybrid_score(q, d_vec, g_score, alpha=0.5):
    vec = cosine(q, d_vec)
    return alpha * vec + (1 - alpha) * g_score
```

## 五、与其他技术对比
简单 FAQ/事实问答用向量 RAG 足够且低成本；涉及关系推理、主题归纳用 GraphRAG 更佳。GraphRAG 建图贵、维护难，是主要门槛。

## 六、常见误区
误区一：GraphRAG 一定优于向量 RAG，实则建图质量差时反而不如。误区二：二者互斥，可级联使用。

## 七、与开源书/权威来源对应
- microsoft/graphrag 提供图谱方案与基准。
- facebookresearch/faiss 是向量检索核心库。
- run-llama/llama_index 同时支持两者。

## 八、面试题
1. 如何按查询类型选择索引？
2. 向量与图检索如何融合打分？
3. GraphRAG 的主要成本在哪里？

## 九、演进与趋势
「图 + 向量」统一索引成为主流，图负责路由与结构，向量负责细粒度语义，互为补充。

## 十、小结
GraphRAG 与向量检索是检索增强的两条正交轴线，组合使用覆盖最全。
