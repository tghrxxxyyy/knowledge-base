# 注意力softmax溢出定位

> 对应 Vaswani 2017《Attention Is All You Need》(arXiv:1706.03762) 与 Dao 2022 FlashAttention (arXiv:2205.14135)。

## 一、背景与挑战

自注意力的核心是缩放点积注意力：对 query $q_i$ 与所有 key $k_j$ 计算相似度，经 softmax 归一化后加权求和 value。问题在于 $q_i k_j^\top$ 的幅值会随维度与序列长度增长，除以 $\sqrt{d}$ 只是把它拉回单位方差；一旦 logits 过大（如数百），在 FP16 下 `exp` 立即溢出为 inf，softmax 分母变 inf、分子变 inf，结果 NaN。

这类 NaN 的隐蔽之处在于：它可能只在某些 batch、某些位置（如被 padding 掩盖的位置或极长序列的远端）偶发，难以稳定复现，却足以污染整个训练步。

## 二、核心原理

softmax 的数值稳定性依赖「减最大值」技巧。对 logits 向量 $z$：

$$
\text{softmax}(z)_j = \frac{\exp(z_j - \max_k z_k)}{\sum_k \exp(z_k - \max_k z_k)}
$$

减去最大值后指数项上限为 $\exp(0)=1$，不会上溢。但该技巧的前提是**最大值计算本身没有出错**：

- 若 $z_j$ 已在计算前溢出为 inf，则 $z_j - \max = \text{inf} - \text{inf} = \text{NaN}$；
- 若 $z$ 全为 $-\infty$（整行被 mask），则 $z - \max = -\infty - (-\infty) = \text{NaN}$。

另一个源头是尺度漂移：RoPE 等位置编码会使 logits 随位置与维度缓慢增大，若未及时缩放，最终跨过 FP16 的 $\exp$ 溢出阈值（约 88）。FlashAttention 通过**分块 + 在线 softmax** 解决：逐块更新运行最大值 $m$ 与运行和 $\ell$，始终在局部减最大值，兼顾数值稳定与显存节省。

## 三、形式化与数学基础

缩放点积注意力为 $\text{Attn}(Q,K,V) = \text{softmax}(QK^\top/\sqrt{d})V$。当 $q,k$ 各分量独立同分布于均值 0、方差 1 时点积方差为 $d$，故除以 $\sqrt{d}$ 使方差归一：$\text{Var}(q\cdot k/\sqrt{d}) = 1$。在线 softmax 对第 $b$ 块维护运行统计量：

$$
m^{(b)} = \max\big(m^{(b-1)},\ \max_j z_j^{(b)}\big),\qquad
\ell^{(b)} = \ell^{(b-1)} e^{\,m^{(b-1)} - m^{(b)}} + \sum_j e^{\,z_j^{(b)} - m^{(b)}}
$$

$$
o^{(b)} = o^{(b-1)} \frac{\ell^{(b-1)} e^{\,m^{(b-1)} - m^{(b)}}}{\ell^{(b)}} + \sum_j \frac{e^{\,z_j^{(b)} - m^{(b)}}}{\ell^{(b)}} v_j
$$

注意 $m^{(b-1)} - m^{(b)} \le 0$，故所有指数项都 $\le 1$、永不溢出，这正是 FlashAttention 数值稳定的核心。

## 四、代码实现

```python
# 检查注意力 logits 的幅值，判断是否接近溢出区
import torch

def inspect_attention(q, k, mask=None):
    d = q.size(-1)
    scores = (q @ k.transpose(-1, -2)) / (d ** 0.5)   # 未 softmax
    if mask is not None:
        scores = scores.masked_fill(mask == 0, float("-inf"))

    max_abs = scores.abs().max().item()
    print("max |logits| =", max_abs)       # FP16 下 > 88 即高危

    # 用减最大值的稳定 softmax（PyTorch 内置已实现）
    attn = torch.softmax(scores, dim=-1)
    assert torch.isfinite(attn).all(), "attention produced non-finite"
    return attn
```

```python
# 简易在线 softmax（分块），演示数值稳定原理
def online_softmax_scores(scores_blocks):
    m = torch.tensor(float("-inf"))
    l = torch.tensor(0.0)
    acc = None
    for z in scores_blocks:                  # 每块为 logits 分片
        m_new = torch.maximum(m, z.max())
        w = torch.exp(z - m_new)             # 指数项恒 <= 1
        l = l * torch.exp(m - m_new) + w.sum()
        if acc is None:
            acc = (w @ z.new_zeros(w.shape[-1], z.size(-1)))
        m = m_new
    return m, l
```

## 五、与其他技术对比

| 注意力实现 | 数值稳定性 | 显存占用 | 溢出风险 | 备注 |
| --- | --- | --- | --- | --- |
| 朴素 softmax（FP16） | 依赖减最大值 | $O(n^2)$ | 高，logits 大即溢 | 简单但易炸 |
| 朴素 softmax（FP32 累加） | 较高 | $O(n^2)$ | 中 | 精度换安全 |
| FlashAttention（在线） | 高，分块减最大 | $O(n)$ | 低 | 主流方案 |
| 稀疏/线性注意力 | 视实现 | 较低 | 中 | 近似，另有误差 |
| 强制 logits 截断 | 高（人为） | $O(n^2)$ | 低但改变语义 | 仅应急 |

## 六、常见误区

- **认为除 $\sqrt{d}$ 就万无一失**：除以 $\sqrt{d}$ 是方差归一，不保证任意输入下 logits 有界。
- **忽略全 mask 行**：整行被 mask 时 softmax 输入全 $-\infty$，产生 NaN，需保证每行至少一个有效位置。
- **只在 loss 变 NaN 后才查**：应定期打印 logits 的最大绝对值，提前发现尺度漂移。
- **误用 padding mask**：把 padding 位置的 logits 设 0 会参与归一化，应设 $-\infty$ 或大负数。
- **忽视 RoPE 长度外推**：位置编码尺度随长度增长，长序列微调时尤易溢出。
- **FP16 下直接算 $QK^\top$**：应在 FP32 或 TF32 中累加点积，避免中间结果溢出。

## 七、与开源书·权威来源对应

Vaswani 2017《Attention Is All You Need》(arXiv:1706.03762) 提出缩放点积注意力并给出除以 $\sqrt{d}$ 的动机；Dao 2022《FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness》(arXiv:2205.14135) 提出分块在线 softmax，兼顾速度、显存与数值稳定；Milakov & Gimelshein 2018 讨论了 softmax 的在线计算。具体实现细节（如分块大小、精度策略）以各库官方最新文档为准。

## 八、面试题

- **问：注意力为什么除以 $\sqrt{d}$？** 答：使点积方差与维度无关，稳定 softmax 输入，防止 logits 随 $d$ 增大而溢出。
- **问：softmax 为何要减最大值？** 答：使指数项上限为 1，避免 $\exp$ 上溢；同时不改变 softmax 结果。
- **问：整行 mask 会产生什么？** 答：logits 全为 $-\infty$，减最大值出现 $-\infty-(-\infty)$，结果为 NaN。
- **问：FlashAttention 如何避免溢出？** 答：分块计算并维护运行最大值与运行和，每块都在局部减最大值。

## 九、演进与趋势

在线 softmax 已成为低精度注意力的事实标准实现。未来方向包括：更精细的分块策略与编译期融合（如 FlashAttention 系列迭代与 PyTorch SDPA 后端）；针对超长上下文的「块级稀疏 + 局部减最大」组合；以及在 FP8 训练下重新设计归一化点，使溢出阈值适配更窄的动态范围。总体趋势是把数值稳定性从「用户须知的技巧」下沉为「内核默认保证」。

## 十、小结

注意力 logits 的尺度是 NaN 的高发区：$QK^\top$ 幅值随维度与长度增长，除以 $\sqrt{d}$ 只做方差归一，不保证任意输入下有界。稳定的关键是 softmax 减最大值与在线分块归一化，并守住「全 mask 行」这类边界。监控 logits 最大幅值、用 FP32 累加点积、采用 FlashAttention，是工程上最有效的三重保障。
