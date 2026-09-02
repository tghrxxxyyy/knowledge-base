# LayerNorm 深入

> 见「深度学习基础/池化与归一化层」「Transformer深入/层归一化与残差连接」。

## 一、背景与挑战

BN 依赖 batch，序列/小 batch 不稳。LN 对单样本特征维归一化，batch 无关。

## 二、核心原理

```
μ = mean(x), σ² = var(x)
x̂ = (x-μ)/√(σ²+ε), y = γ⊙x̂ + β
```

## 三、关键要点

- Transformer 标配。
- 与残差组合成 Pre/Post-Norm。

## 四、与开源书对应

- Ba et al., *Layer Normalization*, 2016.

## 五、面试题

- 为何 Transformer 用 LN 而非 BN？

## 六、小结

LN 是序列模型稳定训练的支柱。
