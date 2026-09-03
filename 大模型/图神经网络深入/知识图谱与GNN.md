# 知识图谱与 GNN

> 见「大模型与知识图谱」与「图神经网络深入/图神经网络总览」；Bordes et al., *TransE*, 2013。

## 一、背景与挑战

知识图谱（实体-关系-实体）需表征与推理，GNN 可编码结构。

## 二、核心原理

- **TransE 等嵌入**：把关系视为翻译 `h + r ≈ t`。
- **RGCN**：对每种关系用不同权重，处理多关系图。
- **GNN 编码 KG**：节点经消息传递得结构感知嵌入，供链接预测/问答。

## 三、关键要点

- 关系类型多时参数量大，需基分解。
- KG 与大模型结合（见大模型与知识图谱章）补事实性。

## 四、代码实现

```python
# RGCNConv 支持关系类型
from torch_geometric.nn import RGCNConv
```

## 五、与其他对比

- TransE 浅嵌入；GNN 深结构。

## 六、常见误区

- KG 能替代参数记忆——需互补。

## 七、与开源书对应

- Bordes et al., TransE, 2013.
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 八、面试题

- RGCN 如何处理多关系？

## 九、演进

TransE → DistMult → RGCN → 图 Transformer。

## 十、小结

GNN 让知识图谱「可计算」。
