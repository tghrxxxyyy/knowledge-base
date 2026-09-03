# FlashAttention 总览

> 对应 Dao et al., *FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness*, 2022（NeurIPS）。

## 一、背景与挑战

标准注意力在 GPU 上需把 $n\times n$ 注意力矩阵物化到高带宽显存（HBM），受限于显存容量与 HBM 读写带宽，既慢又占显存。

## 二、核心原理

FlashAttention 是 IO 感知的精确注意力：把 Q/K/V 分块载入飞快片上 SRAM，在块内增量计算 softmax（在线归一化），不物化完整 $n\times n$ 矩阵，从而降 HBM 读写、省显存、提速。

## 三、数学形式

标准注意力 $O=softmax(S)V$，$S\in\mathbb R^{n\times n}$ 需 $O(n^2)$ HBM。FlashAttention 以分块把 HBM 流量降到 $O(n^2 d^{-1})$ 量级，结果数学等价精确 softmax。

## 四、代码实现

```python
from flash_attn import flash_attn_func
out = flash_attn_func(q, k, v, causal=True)   # q,k,v: (b, n, h, d)
```

## 五、与其他对比

- 与 线性注意力深入 不同：Flash 仍是精确 softmax，只是 IO 优化。
- 与 稀疏注意力深入 不同：不改动注意力模式。

## 六、常见误区

- 误以为 FlashAttention 是近似；它是精确注意力的高效实现。
- 忽视其要求特定 GPU 架构（如 Ampere+）与连续内存布局。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- FlashAttention 为何更快更省显存？答：分块在 SRAM 算、不物化 $n\times n$ 矩阵，减少 HBM 读写且显存随 $n$ 线性。

## 九、演进

标准注意力 → FlashAttention(IO感知) → FlashAttention-2(并行) → FlashAttention-3(Hopper)。

## 十、小结

FlashAttention 用 IO 感知分块重算，在保持精确的同时大幅降显存与提速，是现代训练推理标配。
