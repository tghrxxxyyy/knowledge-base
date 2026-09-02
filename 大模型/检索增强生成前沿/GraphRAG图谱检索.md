# GraphRAG 图谱检索

> 对应 llm-universe 进阶与微软 GraphRAG；Sarthi et al., *RAPTOR* 相关。

## 一、背景与挑战

传统向量检索擅长片段匹配，难回答「全局性/摘要性」问题（如「整体主题是什么」）。

## 二、核心原理

GraphRAG 先从语料抽取实体关系建知识图谱，再社群检测（Leiden）分层摘要，回答时沿社群摘要聚合，兼顾局部与全局。

## 三、关键要点

- 建图成本高但一次建可复用。
- 全局问答显著优于普通 RAG。

## 四、代码实现

```python
from graphrag import GraphRAG
g = GraphRAG(); g.index(documents); print(g.query("本库核心主题?"))
```

## 五、与其他对比

- 向量 RAG 局部；GraphRAG 全局概览强。

## 六、常见误区

- 所有场景都需图谱——小语料普通 RAG 足够。

## 七、与开源书对应

- GraphRAG: https://github.com/microsoft/graphrag
- llm-universe: https://github.com/datawhalechina/llm-universe

## 八、面试题

- GraphRAG 如何支持全局性问题？

## 九、演进

向量 RAG → 树状摘要(RAPTOR) → 图谱社群摘要。

## 十、小结

GraphRAG 把「检索」升级为「结构化知识推理」。
