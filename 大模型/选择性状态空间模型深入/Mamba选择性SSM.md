# Mamba选择性SSM架构

> 对应 Gu & Dao, *Mamba*, 2023（选择性状态空间模型的具体架构与硬件感知并行扫描）。

## 一、背景与挑战

选择性 SSM 失去卷积并行，需新算法在 GPU 上高效做变步长扫描，同时保持近线性复杂度。

## 二、核心原理

块结构类似 Transformer：RMSNorm→投影→卷积+SSM→门控 MLP；SSM 用并行扫描（prefix sum）在硬件上并行计算递归。

## 三、数学形式

$y_k=\sum_{j\le k}\bar A_{k,j}\bar B_j u_j$，其中 $\bar A_{k,j}=\prod_{t=j+1}^k\bar A_t$ 可并行前缀积计算。

## 四、代码实现

```python
# 并行扫描：沿序列维做前缀积
for _ in range(log2(L)):
    x = x + shift(x, 2**p) * A_prefix
```

## 五、与其他对比

- 与 状态空间对偶与Mamba2深入 关系：Mamba2 把选择性 SSM 重写为 SSD 矩阵形式，更利于张量化。
- 与 预归一化后归一化深入 协同：用 Pre-LN/RMSNorm 稳定训练。

## 六、常见误区

- 把 Mamba 块等同于 Transformer 块；内部是 SSM 扫描而非注意力。
- 忽视硬件感知实现才是其效率来源，朴素递归很慢。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- Mamba 如何在 GPU 高效算递归？答：用并行扫描把前缀积张量化，避免串行递归。

## 九、演进

选择性 SSM → 硬件感知并行扫描 → Mamba2 的 SSD 重构。

## 十、小结

Mamba 以选择性 SSM + 并行扫描实现线性时间、内容感知的序列建模。
