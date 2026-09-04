# RoPE在现代LLM中的实现细节

> 对应 meta-llama/llama; mistralai/mistral-src; QwenLM/Qwen。

## 一、背景与挑战
主流开源 LLM（LLaMA、Mistral、Qwen）均用 RoPE，但实现细节略有差异。理解这些细节有助于正确复现与微调。

## 二、核心原理
- 缓存 cos/sin 表避免每次重算。
- 支持 dynamic NTK（按序列长度动态调整 base）。
- 在 grouped-query attention（GQA）下，RoPE 对每头独立，但 cos/sin 可共享。
- 应用 RoPE 后再做 KV 缓存，缓存的是已旋转的 K。

## 三、形式化与数学基础
逆频率 $\text{inv\_freq}_i = 1/\theta_i$；cos/sin 表的 shape 为 $(L, d/2)$。应用时通过 reshape 把 $d$ 维向量拆为 $d/2$ 个二维子空间分别旋转。

## 四、代码实现
```python
class ROPE:
    def __init__(self, dim, base=10000):
        inv = 1.0 / (base ** (torch.arange(0,dim,2)/dim))
        self._inv = inv
    def get(self, L, device):
        t = torch.arange(L, device=device)
        freq = torch.einsum('i,j->ij', t, self._inv.to(device))
        return freq.cos(), freq.sin()
```

## 五、与其他技术对比
- 早期实现用复数乘法（m1*q + m2*k），现代 LLaMA 用实数重排。
- 一些实现把 inv_freq 存为 buffer，支持 dynamic NTK 时重新计算。

## 六、常见误区
- 对 q 和 k 应用 RoPE 的顺序不同导致结果不同（LLaMA 用 `q*cos + rotate_half(q)*sin`）。
- 训练时缓存到最大长度，推理时超过会越界。

## 七、与开源书/权威来源对应
- meta-llama/llama `model.py`。
- huggingface/transformers `modeling_llama.py`。

## 八、面试题
- cos/sin 为什么能缓存？答：它们仅依赖位置与 $\theta_i$，与输入无关。

## 九、演进与趋势
RoPE 实现 → dynamic NTK → 持久化旋转（YaRN 等）。

## 十、小结
现代 LLM 的 RoPE 实现注重缓存、dynamic NTK 与 GQA 兼容，是工程化的代表。
