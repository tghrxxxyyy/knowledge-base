# FlashAttention 实现细节

> 对应 Tri Dao 开源实现 `flash-attention`；以及 `torch.scaled_dot_product_attention` 的 memory-efficient 后端。

## 一、背景与挑战

要正确实现需处理变长、padding、因果掩码、head 布局与 dtype 对齐等工程细节。

## 二、核心原理

要点：输入为 `(batch, seq, n_heads, head_dim)` 且需连续；支持 causal 掩码（仅下三角）、变长序列用 `flash_attn_varlen`；反向依赖重计算，需保存 softmax 的 $m,l$ 统计量。

## 三、数学形式

因果约束 $j\le i$ 在分块时通过块内掩码实现；保存 $m^{(t)},l^{(t)}$ 供反向重算 $\nabla S$。

## 四、代码实现

```python
from flash_attn import flash_attn_qkvpacked_func
out = flash_attn_qkvpacked_func(qkv, causal=True, dropout_p=0.0)
```

## 五、与其他对比

- 与 层归一化深入 融合思路一致：减少 HBM 往返。
- 与 稀疏注意力深入 实现可叠加（稀疏+FA）。

## 六、常见误区

- head_dim 非 64/128 时性能或正确性下降。
- 未 contiguous 输入触发拷贝开销。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 用 FA 要注意什么？答：连续内存布局、head_dim 对齐、causal/varlen 接口与 dtype。

## 九、演进

手写 CUDA → 库化 → 框架内置 SDPA 后端。

## 十、小结

FlashAttention 的工程细节集中在内存布局与掩码，正确使用才能拿到效率红利。
