# 旋转位置编码 RoPE 与相对性

> 对应 Su et al., *RoFormer: Enhanced Transformer with Rotary Position Embedding (RoPE)*, 2021。

## 一、背景与挑战

能否用一种编码，使注意力分数只依赖两 token 的相对距离而非绝对索引，同时保留绝对位置的可乘结构？

## 二、核心原理

RoPE 用旋转矩阵把位置信息乘入查询与键：$q_m=R_m q$，$k_n=R_n k$，其中 $R_m$ 是 $2\times2$ 块对角旋转。两向量内积仅与 $m-n$ 有关，天然表达相对位置。

## 三、数学形式

$R_m=\mathrm{diag}(R(\theta_1 m),R(\theta_2 m),\dots)$，$R(\theta)=\begin{pmatrix}\cos\theta&-\sin\theta\\\sin\theta&\cos\theta\end{pmatrix}$；内积 $q_m^T k_n = q^T R_{n-m} k$ 只含差值。

## 四、代码实现

```python
def rope(x, dim, base=10000.0):
    inv = 1.0 / (base ** (torch.arange(0, dim, 2) / dim))
    ang = torch.outer(torch.arange(x.shape[-2]), inv)
    cos, sin = torch.cos(ang), torch.sin(ang)
    x1, x2 = x[..., 0::2], x[..., 1::2]
    return torch.cat([x1*cos - x2*sin, x1*sin + x2*cos], dim=-1)
```

## 五、与其他对比

- 与 T5 标量偏置相比，RoPE 是乘法旋转且理论更优雅，成为 LLaMA/GLM 等主流选择。
- 与 绝对位置编码深入 对照：RoPE 位置经旋转融入表征。

## 六、常见误区

- 误以为 RoPE 是绝对编码；其分数实际只依赖相对距离。
- 旋转频率 base 设置不当影响长序列外推。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 为何 RoPE 能表达相对位置？答：旋转矩阵使 $q_m^T k_n$ 仅含 $m-n$，分数天然相对。

## 九、演进

Shaw/XL 加性偏置 → T5 标量 → RoPE 旋转乘法 → 各种外推改进（NTK/PI）。

## 十、小结

RoPE 以旋转把绝对位置转成相对感知，兼顾表达力与理论美，是当下最流行的位置编码。
