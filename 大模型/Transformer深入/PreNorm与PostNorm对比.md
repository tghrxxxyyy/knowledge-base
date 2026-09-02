# Pre-Norm 与 Post-Norm 深度对比

> 作为「层归一化与残差连接」的深入延伸。

## 一、核心差异回顾

```
Post-Norm:  y = LayerNorm(x + F(x))
Pre-Norm :  y = x + F(LayerNorm(x))
```

- Post-Norm 把归一化放在残差之后，残差路径上未归一化，深层易数值不稳。
- Pre-Norm 在子层前归一化，残差直接传递原始信号，梯度更平滑。

## 二、实证结论（Xiong et al. 2020）

- 同学习率下 Pre-Norm 收敛更快、对学习率更鲁棒。
- Post-Norm 需 warmup 更谨慎。

## 三、面试题

- 若把 Pre-Norm 改成 Post-Norm，训练动态会怎样变化？
