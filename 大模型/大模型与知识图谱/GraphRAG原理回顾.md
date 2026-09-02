# GraphRAG 原理回顾

> 见「检索增强生成前沿/GraphRAG图谱检索」。

## 一、背景与挑战

把 KG 与 RAG 结合，既结构化又支持全局问答。

## 二、核心原理

建实体-关系图，社群检测分层摘要，查询时按社群聚合，兼顾局部检索与全局概览。

## 三、关键要点

- 图构建成本一次性。
- 全局问题强于向量 RAG。

## 四、其他

详见「检索增强生成前沿/GraphRAG图谱检索」。

## 五、与其他对比

- 纯 KG 查询死板；GraphRAG 灵活摘要。

## 六、常见误区

- 小库也硬上 GraphRAG——性价比低。

## 七、与开源书对应

- GraphRAG: https://github.com/microsoft/graphrag
- llm-universe: https://github.com/datawhalechina/llm-universe

## 八、面试题

- GraphRAG 的社群摘要作用？

## 九、演进

KG+检索 → 社群摘要 → 自适应。

## 十、小结

GraphRAG 是 KG 与 LLM 的强耦合范式。
