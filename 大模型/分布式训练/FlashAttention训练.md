# FlashAttention 训练

> 见「推理优化/注意力复杂度」与「PagedAttention」。训练侧同样关键。

## 一、核心概念

FlashAttention 在训练时通过分块(tiling)与重计算，把 `n×n` 注意力矩阵留在 SRAM，减少 HBM 读写，提速且省显存，是训练长上下文模型的必需。

## 二、关键要点

- 结果数学等价，仅 IO 优化。
- 长序列训练几乎必用。

## 三、面试题

- FlashAttention 为何既提速又省显存？
