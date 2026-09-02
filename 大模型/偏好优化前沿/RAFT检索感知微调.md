# RAFT 检索感知微调

> 见「RAG深入/总体架构」与「偏好优化前沿/RRHF与多目标对齐」。

## 一、背景与挑战

RAG 场景下，模型需学会「在检索到的文档中挑对的用」，而非依赖记忆。

## 二、核心原理

RAFT 在微调时混合「带干扰文档的检索上下文」与「无检索」样本，训练模型忽略无关文档、引用正确证据，提升 RAG 鲁棒性。

## 三、关键要点

- 故意插入噪声文档练抗干扰。
- 部分样本无检索，保通用能力。

## 四、代码实现

```python
docs = retrieve(q); docs += random_noise()
train_sample = (q, docs, gold_answer)
```

## 五、与其他对比

- 普通 SFT 不模拟检索噪声；RAFT 显式练抗噪。

## 六、常见误区

- 噪声太多反而学不会——需比例控制。

## 七、与开源书对应

- RAFT: https://github.com/ShishirPatil/RAFT
- Zhang et al., 2024.

## 八、面试题

- RAFT 为何要混入无关文档？

## 九、演进

SFT → 检索感知 SFT → 在线 RAG 训练。

## 十、小结

RAFT 让模型更懂「如何在 RAG 中用好证据」。
