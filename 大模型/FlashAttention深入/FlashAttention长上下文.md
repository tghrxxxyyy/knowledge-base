# FlashAttention 与长上下文

> 对应 Dao et al., 2022；以及 FlashAttention 在 LongLLM/长上下文训练中的应用。

## 一、背景与挑战

训练百万 token 上下文时，即便算法可处理，朴素注意力也会因显存与时间爆炸而无法落地。

## 二、核心原理

FA 的 $O(n)$ 显存与近线性时间使长序列训练可行；与序列并行（把序列维切到多卡）结合，可进一步扩展上下文到百万级。

## 三、数学形式

前向时间 $T=O(n^2 d)$ 降为 $O(n^2 d^{-1})$ HBM 流量主导但仍需 $O(n^2 d)$ 计算；FA 主要优化的是带宽而非 FLOP，故配合算力并行。

## 四、代码实现

```python
# 与序列并行：把长 n 切分到多 GPU，FA 各卡算局部
local_out = flash_attn_func(q_shard, k_shard, v_shard, causal=True)
```

## 五、与其他对比

- 与 无限上下文深入（PI/ALiBi）互补：FA 解决效率，外推解决长度泛化。
- 与 稀疏注意力深入 都可降长序列成本，但 FA 是精确实现。

## 六、常见误区

- 以为 FA 能自动外推长度；它只解决计算效率，外推靠位置编码。
- 长序列下仍受计算 $O(n^2)$ FLOP 限制。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- FA 对长上下文训练的作用？答：把显存降到线性、提速，使长序列训练在单卡/多卡可行。

## 九、演进

短上下文训练 → FA 长上下文 → FA+序列并行百万级。

## 十、小结

FlashAttention 是长上下文训练的效率底座，与位置外推、序列并行共同支撑超长模型。
