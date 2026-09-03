# SSM与注意力对比

> 综合 Mamba 2023 与注意力文献；本篇系统比较两条长序列建模路线。

## 一、背景与挑战

注意力是事实标准但 $O(n^2)$；SSM 线性但有表达与实现权衡，需明确各自适用边界。

## 二、核心原理

注意力显式两两交互、易学离散模式；SSM 用压缩状态递推、近线性但交互隐式，选择性 SSM 弥补部分表达。

## 三、数学形式

注意力分数 $A=\mathrm{softmax}(QK^\top/\sqrt d)$；SSM 输出 $Y=C(I-\bar A)^{-1}\bar B U$，二者计算图本质不同。

## 四、代码实现

```python
y_attn = attn(q, k, v)
y_ssm = ssm_scan(u, A, B, C)
```

## 五、与其他对比

- 与 稀疏注意力算法深入 / 线性注意力近似方法深入 同属“降复杂度”家族，路线各异。
- 与 状态空间对偶与Mamba2深入 是 SSM 内部演进。

## 六、常见误区

- 认为 SSM 全面替代注意力；在需强两两交互任务上注意力仍占优。
- 忽略 Mamba 训练仍需大语料与调参，非即插即用。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 何时选 SSM 而非注意力？答：超长序列且重线性复杂度时选 SSM；需强显式交互时留注意力。

## 九、演进

注意力主导 → SSM 补充 → 混合架构（注意力+SSM）兴起。

## 十、小结

SSM 与注意力各有所长，长序列场景下常以混合或分层方式共存。
