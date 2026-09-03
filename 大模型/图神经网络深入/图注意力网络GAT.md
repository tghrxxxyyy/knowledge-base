# 图注意力网络 GAT

> 见「图神经网络深入/图神经网络总览」；Veličković et al., *GAT*, 2018。

## 一、背景与挑战

GCN 邻居权重固定（按度），能否让模型自己学重要性？

## 二、核心原理

GAT 用注意力计算邻居权重：
```
α_{ij} = softmax_j( LeakyReLU(a^T [W h_i ‖ W h_j]) )
h_i' = σ( Σ_j α_{ij} W h_j )
```
多头注意力提升稳定。权重随数据学，对异配图更鲁棒。

## 三、数学形式

见上；α 为注意力系数。

## 四、代码实现

```python
from torch_geometric.nn import GATConv
```

## 五、关键要点

- 不需整图，可归纳（inductive）。
- 多头同 Transformer 思想。

## 六、与其他对比

- GCN 无参数权重；GAT 有。

## 七、常见误区

- 注意力总优于 GCN——视图而定。

## 八、与开源书对应

- Veličković et al., 2018.
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 九、面试题

- GAT 相比 GCN 的优势？

## 十、演进

GCN → GAT → GATv2（动态注意力）。

## 十一、小结

注意力给邻居「打分」。
