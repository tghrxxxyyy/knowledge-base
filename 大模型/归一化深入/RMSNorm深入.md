# RMSNorm 深入

> 见「深度学习基础/批量归一化与层归一化深入」。

## 一、背景与挑战

LayerNorm 含减均值(中心化)，计算稍重。RMSNorm(LLaMA 采用)省略中心化，仅除均方根，更快且稳定。

## 二、核心原理

```
x̂_i = x_i / √( (1/d)Σ x_j² + ε ), y = γ⊙x̂
```

## 三、关键要点

- 省去均值计算，约 7% 提速。
- 被 LLaMA/Qwen 广泛采用。

## 四、与开源书对应

- Zhang & Sennrich, *Root Mean Square Layer Normalization*, 2019.

## 五、面试题

- RMSNorm 相比 LayerNorm 少了什么？为何影响小？

## 六、小结

RMSNorm 是效率导向的归一化演进。
