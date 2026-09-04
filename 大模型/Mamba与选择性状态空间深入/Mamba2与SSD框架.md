# Mamba2与SSD框架

> 对应 Dao & Gu 2024 *Mamba2: Linear-Time Sequence Modeling with Selective State Spaces*。

## 一、背景与挑战
Mamba 性能强但自定义 kernel 复杂。Mamba2 引入 SSD（State Space Duality）框架，把 SSM 表达为带掩码的注意力，简化实现。

## 二、核心原理
SSD 关键发现：SSM 的输出 $y = (C \cdot \text{scan}(A, B \odot x))$ 等价于带特定对数-指数掩码的 softmax 注意力。这把 SSM 与注意力统一在同一个框架。

## 三、形式化与数学基础
SSD：$ y = \text{mask\_softmax}(Q K^\top) V $，掩码 $M_{ij} = \log A_{j-i}$（$i \ge j$，否则 $-\infty$）。$Q, K$ 是 $B, C$ 的线性变换，$V = x$。这样 Mamba2 可用 attention kernel 加速。

## 四、代码实现
```python
# Mamba2 SSD
Q = x @ Wq  # (B, L, D)
K = x @ Wk
V = x
# 用 FlashAttention 内核 + SSD 掩码
y = flash_attn(Q, K, V, mask=ssd_mask)
```

## 五、与其他技术对比
- vs Mamba：Mamba2 更快，硬件友好。
- vs Transformer：仍是线性复杂度（$O(Ld)$）。

## 六、常见误区
- SSD 掩码形式特殊，需自定义或用现有 attention kernel 适配。
- 不是所有 attention kernel 都支持 SSD 掩码。

## 七、与开源书/权威来源对应
- state-spaces/mamba2 仓库。
- Dao-AILab/flash-attention。

## 八、面试题
- Mamba2 与 Mamba 主要区别？答：用 SSD 框架走 attention kernel，更快。

## 九、演进与趋势
Mamba → Mamba2 → 与 Transformer 混合（Jamba）。

## 十、小结
Mamba2 通过 SSD 统一 SSM 与注意力，是工程优化的代表。
