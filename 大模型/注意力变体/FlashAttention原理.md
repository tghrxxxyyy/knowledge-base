# FlashAttention 原理

> 见「推理优化/PagedAttention」「分布式训练/FlashAttention训练」。深入数学。

## 一、背景与挑战

标准注意力需物化 `n×n` 注意力矩阵到 HBM，带宽瓶颈严重。FlashAttention 用分块(tiling)在 SRAM 内完成 softmax+点积，避免写回大矩阵。

## 二、核心原理

把 Q/K/V 分块载入 SRAM，块内算局部 softmax(需在线归一化修正)，结果累加，全程不物化 `n×n`。IO 复杂度从 `O(n²)` 降为 `O(n²/M)`(M 为 SRAM 大小)。

## 三、数学形式(在线 softmax)

对分块 `j`，维护运行最大值 `m` 与运行和 `l`：

```
m_new = max(m, rowmax(S_j))
l_new = e^{m-m_new} l + e^{m_new - m} Σ exp(S_j - m_new)
```

## 四、关键要点

- 结果数学等价，仅 IO 优化。
- 是训练/推理长上下文的基石。

## 五、与开源书对应

- Dao et al., *FlashAttention*, 2022; Dao, *FlashAttention-2*, 2023.

## 六、面试题

- FlashAttention 为何不改变数学结果却能提速？

## 七、小结

FlashAttention 是当代 Transformer 工程的事实标准。
