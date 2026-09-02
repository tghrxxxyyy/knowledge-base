# KG 增强大模型

> 对应 llm-universe 知识库章与 d2l-zh 图神经章。

## 一、背景与挑战

LLM 知识隐式存于权重、易过时且难解释。知识图谱（KG）提供结构化、可验证知识。

## 二、核心原理

两种结合：**检索式**（查 KG 三元组补上下文）与**融合式**（KG 作为额外信号参与训练/推理）。缓解幻觉、提升事实性。

## 三、数学形式

检索增强：

```
P(y|x) ∝ P(y|x, {triples from KG})
```

## 四、代码实现

```python
triples = kg.query(f"MATCH (a)-[r]->(b) WHERE a.name='{ent}' RETURN *")
prompt = f"已知:{triples}\n问题:{q}"
```

## 五、关键要点

- KG 提供可解释依据。
- 需实体链接把文本映射到节点。

## 六、与其他对比

- RAG 用非结构化文本；KG 用结构化事实。

## 七、常见误区

- KG 永远对——KG 也有错漏需更新。

## 八、与开源书对应

- llm-universe: https://github.com/datawhalechina/llm-universe
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 九、面试题

- KG 增强相比纯 RAG 的优势？

## 十、演进

规则 KB → 向量检索 → KG+RAG 融合。

## 十一、小结

KG 给 LLM 配上「可核查的事实底座」。
