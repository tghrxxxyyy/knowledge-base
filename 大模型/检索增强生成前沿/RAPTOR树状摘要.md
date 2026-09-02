# RAPTOR 树状摘要

> 见「检索增强生成前沿/GraphRAG图谱检索」。

## 一、背景与挑战

长文档的层级结构利于不同粒度问答。RAPTOR 用递归摘要建树。

## 二、核心原理

把检索片段聚类，用 LLM 摘要成上层节点，递归构建树。查询时同时命中叶（细节）与根（概览）。

## 三、关键要点

- 多粒度覆盖细节与全局。
- 建树成本一次性的。

## 四、代码实现

```python
# 简化：聚类后摘要
clusters = kmeans(chunks); nodes = [summarize(c) for c in clusters]
```

## 五、与其他对比

- 普通 RAG 平铺；RAPTOR 有层级。

## 六、常见误区

- 树越深越好——过摘要丢失细节。

## 七、与开源书对应

- RAPTOR: https://github.com/parthsarthi03/raptor
- Sarthi et al., 2024.

## 八、面试题

- RAPTOR 为何要递归摘要？

## 九、演进

扁平检索 → 层级摘要 → 与图谱结合。

## 十、小结

RAPTOR 以树结构兼顾细节与全局。
