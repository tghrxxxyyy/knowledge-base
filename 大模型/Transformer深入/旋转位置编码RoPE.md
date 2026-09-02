# 旋转位置编码 RoPE

> 当前主流大模型(LLaMA、Qwen、ChatGLM 等)广泛采用。源于 Su et al., *RoFormer*, 2021。

## 一、核心概念

RoPE 通过**旋转矩阵**将绝对位置编码进 query/key 的隐空间，使注意力内积天然反映相对位置：

```
⟨RoPE(q, m), RoPE(k, n)⟩ = f(q, k, m - n)
```

即两向量经位置旋转后做点积，结果只依赖相对距离 `m-n`。

## 二、数学形式（2 维示意）

对维度对 `(2i, 2i+1)`，位置 `m` 的旋转：

```
[ q'_2i   ]   [ cos mθ_i  -sin mθ_i ] [ q_2i   ]
[ q'_2i+1 ] = [ sin mθ_i   cos mθ_i ] [ q_2i+1 ]
θ_i = 10000^{-2i/d}
```

高维由多个 2 维旋转拼接而成，可用复数乘法高效实现。

## 三、代码实现

```python
import torch

def rope(q, k, base=10000.0):
    # q,k: (B, h, T, d)
    B, h, T, d = q.shape
    inv = 1.0 / (base ** (torch.arange(0, d, 2).float() / d))
    pos = torch.arange(T).float()
    freqs = torch.outer(pos, inv)               # (T, d/2)
    cos = torch.cos(freqs); sin = torch.sin(freqs)
    def apply(x):
        x1, x2 = x[..., 0::2], x[..., 1::2]
        rot = torch.cat([-x2, x1], dim=-1)
        return x * cos + rot * sin
    return apply(q), apply(k)
```

## 四、关键要点

| 性质 | 说明 |
|------|------|
| 相对性 | 内积只依赖 `m-n` |
| 长上下文 | 可通过 NTK/PI 扩展 |
| 主流 | LLaMA/Qwen/GLM 采用 |

## 五、常见误区

- 误在 value 上加 RoPE（RoPE 仅作用于 Q/K）。
- 外推时未在 base 上做 NTK 缩放，导致长文本性能骤降。

## 六、与开源书的对应

- Su et al., *RoFormer: Enhanced Transformer with Rotary Position Embedding*, 2021 (arXiv:2104.09864).

## 七、面试题

- RoPE 为何能让注意力感知相对位置？
- 长上下文外推时 RoPE 如何调整 base？
