# GPT 架构实现

> 对应 rasbt/LLMs-from-scratch 第4章「Implementing a GPT Model From Scratch」。组装完整 decoder-only Transformer。

## 一、核心概念

GPT 由 **Token+位置嵌入 → N × Transformer 块 → 层归一化 → 输出线性层** 组成。每块：`Pre-Norm(层归一化) → 因果自注意力 → 残差 → Pre-Norm → FFN(SwiGLU/GeLU) → 残差`。

```python
class TransformerBlock(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.ln1 = nn.LayerNorm(cfg.d_model)
        self.attn = CausalSelfAttention(cfg.d_model, cfg.n_heads, cfg.ctx_len)
        self.ln2 = nn.LayerNorm(cfg.d_model)
        self.ff = nn.Sequential(
            nn.Linear(cfg.d_model, 4*cfg.d_model), nn.GELU(),
            nn.Linear(4*cfg.d_model, cfg.d_model))
    def forward(self, x):
        x = x + self.attn(self.ln1(x))
        x = x + self.ff(self.ln2(x))
        return x

class GPT(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.tok_emb = nn.Embedding(cfg.vocab, cfg.d_model)
        self.pos_emb = nn.Embedding(cfg.ctx_len, cfg.d_model)
        self.blocks = nn.ModuleList([TransformerBlock(cfg) for _ in range(cfg.n_layers)])
        self.ln_f = nn.LayerNorm(cfg.d_model)
        self.head = nn.Linear(cfg.d_model, cfg.vocab, bias=False)
    def forward(self, idx):
        B, T = idx.shape
        pos = torch.arange(T, device=idx.device)
        x = self.tok_emb(idx) + self.pos_emb(pos)
        for blk in self.blocks: x = blk(x)
        return self.ln_f(x)   # (B,T,d_model)，再 @ head.weight.T 得 logits
```

## 二、关键要点

| 组件 | 作用 |
|------|------|
| tok_emb | 词表→向量 |
| pos_emb | 位置 |
| blocks | 深层变换 |
| ln_f+head | 语言模型头 |

## 三、常见误区

- 位置嵌入未截断到 `T`，长序列越界。
- 权重 tying（emb 与 head 共享）未显式设置。

## 四、与开源书的对应

- rasbt/LLMs-from-scratch Ch.4: https://github.com/rasbt/LLMs-from-scratch
- 权重共享：GPT-2 把 token embedding 与输出层共享。

## 七、面试题

- GPT 为何是 decoder-only？其位置嵌入如何加？
- 输出 logits 维度如何得到？
