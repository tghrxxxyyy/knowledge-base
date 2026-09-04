# RoPE总览与复数解释

> 对应 Su et al., 2021 *RoFormer: Enhanced Transformer with Rotary Position Embedding*。

## 一、背景与挑战
绝对位置编码无法直接表达相对位置，正弦编码外推到长上下文能力有限。RoPE 通过对 query/key 施加与位置相关的旋转，把相对位置信息编码进内积。

## 二、核心原理
对二维子空间 $(q_{2i}, q_{2i+1})$，位置 $m$ 施加旋转 $R_m = \begin{pmatrix} \cos m\theta_i & -\sin m\theta_i \\ \sin m\theta_i & \cos m\theta_i \end{pmatrix}$，$\theta_i = 10000^{-2i/d}$。内积 $\langle R_m q, R_n k \rangle$ 仅依赖 $m-n$，自然得到相对位置。

## 三、形式化与数学基础
对 $d$ 维向量分成 $d/2$ 个二维子空间，频率 $\theta_i = b^{-2i/d}$（$b=10000$）。最终 $q_m = R_{\Theta,m} q, k_n = R_{\Theta,n} k$，$\langle q_m, k_n \rangle = g(q,k,m-n)$，是 $m-n$ 的函数。

## 四、代码实现
```python
def apply_rope(x, cos, sin):
    # x: (B, H, L, D), cos/sin: (1,1,L,D)
    x1, x2 = x[..., ::2], x[..., 1::2]
    return torch.cat([x1*cos - x2*sin, x1*sin + x2*cos], dim=-1)
```

## 五、与其他技术对比
- vs 绝对位置编码：RoPE 内积直接含 $m-n$。
- vs ALiBi：RoPE 用旋转，ALiBi 用加性偏置，RoPE 表达力更强。

## 六、常见误区
- 旋转频率 $\theta_i$ 设错（如全部相同）会破坏多尺度位置。
- 应用 RoPE 时未对 query/key 都做，导致内积不对称。

## 七、与开源书/权威来源对应
- huggingface/transformers `apply_rotary_pos_emb`。
- meta-llama/llama 官方实现。
- EleutherAI/gpt-neox RoPE 实现。

## 八、面试题
- RoPE 为什么能编码相对位置？答：旋转矩阵性质 $R_m^\top R_n = R_{n-m}$，使内积仅依赖 $m-n$。

## 九、演进与趋势
绝对位置 → 正弦 → RoPE → 动态 NTK 缩放（YaRN）。

## 十、小结
RoPE 以旋转编码相对位置，是现代 LLaMA/Mistral/Qwen 等主流架构的位置编码选择。
