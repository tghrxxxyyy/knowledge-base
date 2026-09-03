# BatchNorm 与 LayerNorm 对比

> 对应 Ioffe & Szegedy, *Batch Normalization*, 2015；Ba et al., *Layer Normalization*, 2016。

## 一、背景与挑战

理解两种归一化在统计维度、batch 敏感性、适用场景上的根本差异，避免误用。

## 二、核心原理

BatchNorm 沿 batch 维对同特征做归一（依赖大 batch 与固定输入尺寸）；LayerNorm 沿特征维对同样本做归一（与 batch 无关，适合变长序列）。

## 三、数学形式

BN：$\hat x^{(b)}_i=(x^{(b)}_i-\mu_{B,i})/\sqrt{\sigma^2_{B,i}+\epsilon}$，$\mu_{B,i}$ 跨 batch 求。LN：$\mu$ 跨特征维 $H$ 求，不跨样本。

## 四、代码实现

```python
bn = nn.BatchNorm1d(d)          # 沿 batch 维
ln = nn.LayerNorm(d)            # 沿特征维
yb, yl = bn(x.transpose(0,1)).transpose(0,1), ln(x)
```

## 五、与其他对比

- BN 在 CV 大 batch 有效；LN 在 NLP/RL/小 batch 更稳。
- 与 RMSNorm 对比见下节。

## 六、常见误区

- 推理时 BN 用滑动均值，LN 无需；混用导致数值偏差。
- 序列变长时 BN 的 batch 统计噪声大。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- BN 与 LN 归一维度差异？答：BN 跨 batch 同特征，LN 跨特征同样本，后者与 batch 大小无关。

## 九、演进

BN(CV) → LN(序列) → 各种稳定变体。

## 十、小结

归一化维度的选择决定适用领域，Transformer 因变长小 batch 天然选 LN。
