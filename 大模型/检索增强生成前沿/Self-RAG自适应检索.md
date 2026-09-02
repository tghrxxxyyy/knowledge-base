# Self-RAG 自适应检索

> 见「RAG深入/总体架构」与「检索增强生成前沿/GraphRAG图谱检索」。

## 一、背景与挑战

固定检索所有问题浪费且引入噪声。Self-RAG 让模型自决「是否检索、是否引用」。

## 二、核心原理

训练模型输出特殊标记（Retrieve/NoRetrieve、Cite），按需检索并校验证据相关性，生成时强制引用，提升事实性。

## 三、关键要点

- 反思 token 控制检索时机。
- 引用校验提升可追溯。

## 四、代码实现

```python
# 伪代码：按需检索
if model.decides("Retrieve"): ctx = retrieve(q)
```

## 五、与其他对比

- 普通 RAG 总是检索；Self-RAG 选择性检索。

## 六、常见误区

- 自适应就省成本——反思开销需权衡。

## 七、与开源书对应

- Self-RAG: https://github.com/AkariAsai/self-rag
- Asai et al., 2023.

## 八、面试题

- Self-RAG 用哪些特殊标记控制流程？

## 九、演进

固定 RAG → 自适应 → 多步推理检索。

## 十、小结

Self-RAG 让检索「恰到好处」。
