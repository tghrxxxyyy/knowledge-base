# GraphRAG 总览与动机

> 对应 microsoft/graphrag 开源仓库（微软 GraphRAG 方法）与 Lewis et al. 2020《RAG》。

## 一、背景与挑战
传统 RAG 基于文本块向量检索，擅长局部事实问答，但对「全局性问题」（如「数据集的主要主题是什么」）力不从心，因为答案分散在大量文档中、需聚合。

## 二、核心原理
GraphRAG 先从语料抽取实体-关系图谱，再对图谱做社区检测，为每个社区生成摘要；检索时既可做局部（实体邻域）也可做全局（社区摘要聚合）搜索，把图结构作为索引。

## 三、形式化与数学基础
语料映射为图 $G=(V,E)$，V 为实体/概念，E 为关系。社区划分 $C=\{C_1,\dots,C_m\}$ 由 Louvain/Leiden 得到。全局答案经分层汇聚：
$A = \bigoplus_{C_i} \text{LLM-summary}(C_i)$
其中 $\bigoplus$ 表示对社区摘要的归约（如 map-reduce）。

## 四、代码实现
```python
def graphrag_global(graph, llm):
    comms = detect_communities(graph)        # Leiden 划分
    summaries = [llm.summarize(c) for c in comms]
    return llm.reduce("综合以下社区摘要回答全局问题：" + str(summaries))
```

## 五、与其他技术对比
相比块向量 RAG，GraphRAG 擅长全局与多跳推理，但建图成本高、对抽取质量敏感；适合知识密集、需宏观洞察的场景。

## 六、常见误区
误区一：GraphRAG 完全替代向量检索，实则二者互补。误区二：认为建图一次永久有效，语料更新需重抽。

## 七、与开源书/权威来源对应
- microsoft/graphrag 给出端到端实现与评测。
- Lewis et al. 2020 是检索增强基础。
- run-llama/llama_index 提供图谱检索集成。

## 八、面试题
1. GraphRAG 为何能回答全局性问题？
2. 社区检测在 GraphRAG 中的作用？
3. 建图质量如何影响检索上限？

## 九、演进与趋势
从静态抽取走向增量图更新，并融合向量检索形成「图 + 向量」混合索引；轻量化抽取降低成本。

## 十、小结
GraphRAG 用知识图谱把分散事实结构化，补齐传统 RAG 的全局推理短板。
