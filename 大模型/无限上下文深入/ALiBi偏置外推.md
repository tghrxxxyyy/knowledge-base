# ALiBi 偏置与长度外推

> 对应 Press et al., *Train Short, Test Long: Attention with Linear Biases Enables Input Length Extrapolation (ALiBi)*, 2022。

## 一、背景与挑战

能否在训练时只用短上下文，推理时无需修改即可处理更长序列？

## 二、核心原理

ALiBi 完全不加位置编码，而是在注意力分数上加一个随相对距离 $|i-j|$ 线性增长的偏置 $-m|i-j|$（$m$ 按 head 几何递减）。近距离得分被抬高、远距离被压低，且偏置与绝对位置无关，天然随长度线性外推。

## 三、数学形式

$score_{ij}= \frac{q_i k_j^T}{\sqrt d} - m\cdot|i-j|$；对第 $h$ 头 $m=2^{-h/H}$ 之类，使不同头关注不同距离范围。

## 四、代码实现

```python
m = 2.0 ** (-torch.arange(H) / H)[:, None, None]
bias = -m * torch.abs(i[:, None] - j[None, :])         # (H, n, n)
scores = q @ k.transpose(-1,-2) / d**0.5 + bias
```

## 五、与其他对比

- 与 无位置编码深入 直接呼应（ALiBi 几乎无显式位置编码）。
- 与 相对位置编码深入（RoPE/T5）相比，ALiBi 偏置极简且外推天然。

## 六、常见误区

- 误以为 ALiBi 是位置编码；它只是距离衰减偏置。
- $m$ 头分配不当致所有头关注同一距离尺度。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- ALiBi 为何能训短测长？答：偏置只依赖相对距离，对任意长度都落在训练见过的形式。

## 九、演进

绝对位置(难外推) → 相对偏置(T5) → ALiBi(免编码+天然外推)。

## 十、小结

ALiBi 用极简距离偏置实现“训短测长”，是外推友好的位置处理范式。
