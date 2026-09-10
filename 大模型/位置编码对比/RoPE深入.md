# 旋转位置编码 RoPE 深入

> 对应 Su et al. (2021) RoFormer: Enhanced Transformer with Rotary Position Embedding；亦见 Rotary Position Embedding 理论。

## 一、背景与挑战

绝对位置编码把位置信息「加」到 token 向量上，但注意力计算的是内积，绝对位置随序列平移并不保持相对关系。相对位置编码（如 T5 偏置）更直接，但实现复杂、与多头机制耦合。长上下文外推还需额外处理。

RoPE（Rotary Position Embedding，旋转位置编码）的设计目标是：让**两个向量的内积只依赖于它们的相对位置距离**，而非各自绝对位置。同时它作用在 Q/K 上、形式优雅、且天然支持通过调节基频（base）与 NTK 缩放做长度外推，已成为 LLaMA、Qwen、ChatGLM 等当代 LLM 的默认位置编码。

## 二、核心原理

RoPE 的核心思想：用旋转矩阵把「位置 $m$」编码进 query/key 向量的旋转角度中。对维度两两分组 $(2i,2i+1)$，在位置 $m$ 对该组施加角度 $\theta_i m$ 的旋转：

$$
\begin{bmatrix} q_{2i}^{(m)} \\ q_{2i+1}^{(m)} \end{bmatrix}
=
\begin{bmatrix} \cos m\theta_i & -\sin m\theta_i \\ \sin m\theta_i & \cos m\theta_i \end{bmatrix}
\begin{bmatrix} q_{2i} \\ q_{2i+1} \end{bmatrix}
$$

关键性质：旋转后的内积只依赖相对距离 $m-n$：

$$
\langle \text{RoPE}(q,m), \text{RoPE}(k,n) \rangle = g(q,k,m-n)
$$

即相对位置被精确编码，绝对位置被「抵消」。角度 $\theta_i = \text{base}^{-2i/d}$，base 越大高频分辨率越高。

## 三、形式化与数学基础

令旋转矩阵 $R_m = \text{diag}(R(\theta_1 m),\dots,R(\theta_{d/2} m))$，$R(\phi)$ 为二维旋转。则：

$$
\text{RoPE}(x,m) = R_m x
$$

注意力分数满足：

$$
(R_m q)^\top (R_n k) = q^\top R_{m-n} k = f(q,k,m-n)
$$

长度外推时，若推理长度超出训练，需调整 base（NTK 缩放）：

$$
\text{base}' = \text{base} \cdot \lambda^{\frac{d}{d-2}},\quad \lambda>1
$$

使各频率重新分配，避免高频在长序列过密而失准。该公式即「NTK-aware」插值的核心。

## 四、代码实现

RoPE 的 PyTorch 实现：

```python
import torch

def rope(q, k, base=10000.0):
    # q,k: (B, H, L, D)  D 为偶
    D = q.shape[-1]
    pos = torch.arange(q.shape[2], device=q.device)
    theta = base ** (-torch.arange(0, D, 2) / D)     # (D/2,)
    ang = pos[:, None] * theta[None, :]              # (L, D/2)
    cos, sin = ang.cos(), ang.sin()
    def rot(x):
        x1, x2 = x[..., 0::2], x[..., 1::2]
        return torch.cat([x1*cos - x2*sin, x1*sin + x2*cos], -1)
    return rot(q), rot(k)
```

仅作用于 Q/K，V 不加位置。

## 五、与其他技术对比

| 编码 | 相对性 | 外推方式 | 作用对象 | 代表 |
|------|--------|----------|----------|------|
| 绝对(正弦) | 否 | 弱 | 输入 | Transformer |
| T5 偏置 | 是 | 需扩展 | 注意力 | T5 |
| ALiBi | 是(偏置) | 天然 | 分数 | MPT/BLOOM |
| RoPE | 是(旋转) | base/NTK | Q/K | LLaMA/Qwen |

## 六、常见误区

- **「RoPE 加在输入上」**：实际加在 Q/K，V 不带位置。
- **「base 无所谓」**：base 决定高频容量，外推必须调（PI/NTK）。
- **「外推=直接拉长」**：不调 base 在远超训练长度处会失效。
- **混淆 RoPE 与绝对编码**：RoPE 编码的是相对距离，内积层面显式成立。

## 七、与开源书·权威来源对应

- Su et al., *RoFormer: Enhanced Transformer with Rotary Position Embedding*, 2021。
- blairan 的「Rotary Embeddings: A Relative Revolution」NTK 扩展分析。
- HuggingFace Transformers 中 LLaMA/Qwen 的 `apply_rotary_pos_emb` 实现。
- 亦见本知识库「外推技术综述」「绝对位置编码」。

## 八、面试题

1. 为何 RoPE 外推要调 base？NTK 缩放的数学含义？
2. RoPE 如何保证内积只依赖相对距离 $m-n$？
3. RoPE 与 ALiBi 在机制上的本质区别？
4. RoPE 为何只作用于 Q/K 而不作用于 V？

## 九、演进与趋势

从原始 RoPE 到 NTK-aware / position interpolation（PI）外推，再到 YaRN（需微调的长上下文缩放）与动态 NTK。主流 LLM 已把 RoPE 作为默认，外推技术从「推理期技巧」走向「训练期协同设计」。

## 十、小结

RoPE 用旋转矩阵把相对位置精确编码进 Q/K 内积，形式优雅、外推可通过 base/NTK 调节，是当代 LLM 位置编码主流。理解其相对性与频率分配，是掌握长上下文的关键。
