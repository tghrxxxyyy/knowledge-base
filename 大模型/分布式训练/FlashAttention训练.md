# FlashAttention 训练

> 对应 Dao et al. 2022（FlashAttention: Fast and Memory-Efficient Attention with IO-Awareness）。

## 一、背景与挑战

标准注意力需显式构造 $N\times N$ 注意力矩阵（$N$ 为序列长度），其显存与计算都随 $N^2$ 增长。当序列很长（长文档、长上下文训练）时，这个矩阵既占爆显存、又因反复读写 HBM（高带宽内存）带来巨大 IO 瓶颈——实际瓶颈往往不是算力而是**内存带宽**。FlashAttention 由 Dao 等人于 2022 年提出，核心思想是用 IO 感知的分块计算，把大矩阵留在更快的 SRAM 上，避免 materialize 完整注意力矩阵，从而既提速又省显存，是训练长上下文模型的必需组件。

## 二、核心原理

FlashAttention 把 $Q,K,V$ 沿序列维度切成小块（tiling），在 SRAM 内逐块计算 attention 的softmax与输出，并配合**重计算（recomputation）**：前向不保存完整中间注意力矩阵，反向时按块重新计算。它不改变数学结果，只改变「怎么算、数据放哪」：

- **分块**：每次只把一小块 $Q,K,V$ 载入 SRAM，计算局部 softmax 统计量（running max/sum）。
- **在线 softmax**：用分块增量更新 softmax 的 max 与分母，避免先算全矩阵。
- **重计算**：反向需要的注意力分数不存储，而是从 $Q,K,V$（本就要存）重新算，用算力换显存。

结果上，显存从 $O(N^2)$ 降到 $O(N)$，HBM 访问量大幅下降，长序列下提速显著。

理解 FlashAttention 要抓住「IO 感知」这个关键词。GPU 的算力（FLOPs）增长远快于显存带宽（HBM 带宽），因此许多算子不是算得慢，而是「等数据从 HBM 搬进 SRAM 再搬回去」搬得慢。注意力标准实现要把 $N\times N$ 的 $S$ 与 $P$ 矩阵完整 materialize 到 HBM，再读回来做 softmax 与乘 V，这一来一回的带宽消耗正是瓶颈。FlashAttention 让每个块只在 SRAM 内完成「算局部 softmax 统计量 → 更新输出」，HBM 上只写回最终的 $O$ 与极小的统计量，带宽骤降。

这也解释了为何它「既快又省显存」：省显存是因为不再存 $N^2$ 的中间矩阵（只存 $N$ 级输出）；快是因为 HBM 读写大幅减少，而 SRAM 上的计算本就是芯片擅长的。代价是反向需重算注意力分数，但重算发生在 SRAM 且可与前向重叠，整体仍净加速。训练长上下文（如 32K/128K 序列）时，若不用 FlashAttention，光注意力中间矩阵就可能超出单卡显存，因此它是「能训」的前提而非「可选项」。

需注意的是，FlashAttention 对硬件与内核有要求：需要支持特定矩阵乘与 softmax 融合内核的架构（如 Ampere 及以上），且输入序列长度、头维度常需对齐到块大小以获得最佳性能；不满足时会回退到低效路径。

## 三、形式化与数学基础

注意力输出 $O = \text{softmax}(QK^\top/\sqrt{d})V$。标准做法 materialize $S=QK^\top\in\mathbb{R}^{N\times N}$。FlashAttention 用分块 $Q_i,K_j,V_j$（块大小 $B_c,B_r$）：

$$S_{ij} = Q_i K_j^\top/\sqrt{d},\quad m_i = \text{rowmax}(S_{ij}),\quad P_{ij} = \exp(S_{ij}-m_i)$$

以 running max $m$ 与 running sum $\ell$ 增量归一化：

$$\ell_i^{(j+1)} = e^{m_i^{(j)}-m_i^{(j+1)}}\ell_i^{(j)} + e^{-m_i^{(j+1)}}\text{rowsum}(e^{S_{ij}-m_i^{(j+1)}})$$

最终 $O_i = \text{diag}(\ell_i)^{-1}\sum_j e^{S_{ij}-m_i}V_j$。显存占用：

$$\text{Standard: } O(N^2),\qquad \text{FlashAttention: } O(N)$$

## 四、代码实现

PyTorch 2.x 原生支持（`scaled_dot_product_attention` 自动走高效内核）：

```python
import torch
from torch.nn.functional import scaled_dot_product_attention

# q,k,v: (B, H, N, d)；FlashAttention 在支持的后端自动启用
out = scaled_dot_product_attention(q, k, v, attn_mask=None, dropout_p=0.0)
# 也可显式：torch.backends.cuda.enable_flash_sdp(True)
```

HuggingFace 训练通常通过 `use_flash_attention_2=True` 开启。

## 五、与其他技术对比

| 方法 | 显存 | 速度 | 结果 |
|------|------|------|------|
| 标准注意力 | $O(N^2)$ | 慢（IO 瓶颈） | 同 |
| FlashAttention | $O(N)$ | 快 | 数学等价 |
| 稀疏/线性注意力 | $O(N)$ | 快 | 近似不等价 |

## 六、常见误区

- 以为 FlashAttention 改了注意力数学，实则仅 IO 优化、结果等价。
- 忽视它依赖特定 GPU 架构（如 Ampere+）与对齐的块大小。
- 长序列训练不用它，导致显存爆炸、无法训练。
- 反向重计算会增算力，但仍在整体提速（因省 HBM 带宽）。

## 七、与开源书·权威来源对应

- Dao et al., 2022, *FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness*（NeurIPS）。
- FlashAttention 仓库：https://github.com/Dao-AILab/flash-attention
- 以官方最新文档为准。

## 八、面试题

- FlashAttention 为何既提速又省显存？它改了数学结果吗？
- 在线 softmax 与重计算各自解决什么问题？
- 为何说注意力瓶颈常是内存带宽而非算力？

## 九、演进与趋势

FlashAttention 已演进到 v2/v3：v2 优化并行与 warp 级调度进一步提升吞吐；v3 利用 Hopper 的 TMA 与异步流水进一步压榨硬件。其核心「IO 感知」理念也影响了后续长序列训练与推理优化。

## 十、小结

FlashAttention 用分块 + 在线 softmax + 重计算，把注意力从 $O(N^2)$ 显存、IO 瓶颈，优化为 $O(N)$、带宽友好，且数学结果完全等价。它是现代长上下文训练与高效推理的底层基石。
