# FlashAttention 与显存

> 对应 Dao et al., 2022；以及其在长上下文训练中的显存收益分析。

## 一、背景与挑战

标准注意力显存随 $n^2$ 增长，长序列下很快 OOM，限制上下文长度与 batch。

## 二、核心原理

FlashAttention 把显存占用从 $O(n^2)$（注意力矩阵）降到 $O(n)$（仅存必要的 $Q/K/V$ 与输出），使在同样显存下可训练/推理更长序列或更大 batch。

## 三、数学形式

峰值激活显存 $M_{std}=O(n^2)$ vs $M_{flash}=O(n\cdot d)$；当 $n\gg d$ 时差距巨大，长序列收益最显著。

## 四、代码实现

```python
# 同样显存下可支持更长 n
out = flash_attn_func(q, k, v, causal=False)   # 不物化 n×n
```

## 五、与其他对比

- 与 无限上下文深入 配合：Flash 让长序列训练可行。
- 与 KV缓存优化(推理)互补：训练侧 FA，推理侧 PagedAttention。

## 六、常见误区

- 以为 FA 也省 KV 缓存；推理 KV 缓存由别处优化。
- 序列短时 FA 显存优势不明显甚至略慢。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- FA 显存从何而来？答：不物化 $n\times n$ 注意力矩阵，激活显存随 $n$ 线性而非平方。

## 九、演进

物化矩阵 → 分块省显存 → 与序列并行结合训超长上下文。

## 十、小结

FlashAttention 的显存线性化是支撑现代长上下文模型训练的工程基础。
