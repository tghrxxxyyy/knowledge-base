# LayerNorm 数值稳定性

> 对应 Ba et al., 2016（Layer Normalization）。

## 一、背景与挑战

BN 依赖 batch 维，对变长序列/RNN/Transformer 不便且小 batch 不稳。LN 在特征维归一化，与 batch 无关，适合序列建模。

它是 Transformer 的默认归一化。

## 二、核心原理

对单个样本在特征维（或最后 D 维）求均值方差并归一化，再仿射。因不跨样本，训练/推理一致，无 running 统计。

对序列模型，通常 LN 作用于特征维而保留时间维。

## 三、数学形式

对向量 $x\in\mathbb R^D$：$\mu=\frac1D\sum_i x_i$，$\sigma^2=\frac1D\sum_i(x_i-\mu)^2$；$y=\gamma\frac{x-\mu}{\sqrt{\sigma^2+\epsilon}}+\beta$。

## 四、代码实现

```python
ln = torch.nn.LayerNorm(hidden, eps=1e-5)
y = ln(x)                       # x: (B, T, D) 在 D 维归一化
```

## 五、与其他对比

- 与 BatchNorm 数值 比较：LN 与 batch 无关、无 running 统计。
- 与 RMSNorm 比较：LN 减均值、RMSNorm 不减。
- 与 注意力数值稳定与溢界深入 衔接，LN 在注意力前后稳定。

## 六、常见误区

- 在需跨样本归一化时误用 LN（如对比学习 BN 更合适）。
- eps 取过小致近零方差除 0（虽少见）。
- 把 LN 的归一化维搞错（应在特征维而非时间维）。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- annotated-transformer：https://github.com/harvardnlp/annotated-transformer

## 八、面试题

- LN 为何适合 Transformer？答：不依赖 batch、对变长序列稳定、训练推理一致。
- LN 与 BN 最大区别？答：归一化维度不同，LN 跨特征、不跨样本。

## 九、演进

LN → RMSNorm（省减均值） → Pre-LN 结构。

## 十、小结

LN 以特征维归一化摆脱 batch 依赖，是序列模型稳定的关键。
