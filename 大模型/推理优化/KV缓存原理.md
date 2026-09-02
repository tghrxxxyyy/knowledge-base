# KV 缓存原理

> 对应 llm-course「Quantization / Inference」与 FlashAttention 系列。理解 KV Cache 是理解 LLM 推理成本的前提。

## 一、核心概念

自回归生成时，每个新 token 都要 attend 之前所有 token。若每步都重算历史 key/value，计算量 `O(T²)`。KV Cache 把历史每层的 K、V 缓存下来，新 token 只需计算自身的 Q 与新增 K/V，再拼接缓存：

```
每步仅计算新 token 的 q_t, k_t, v_t
cache_K = [cache_K; k_t],  cache_V = [cache_V; v_t]
output_t = Attention(q_t, cache_K, cache_V)
```

显存占用 = `2 × n_layers × batch × seq_len × n_heads × head_dim × dtype_bytes`。

## 二、关键要点

| 维度 | 影响 |
|------|------|
| 序列长 | 显存线性增长 |
| batch 大 | 显存线性增长 |
| 层数/维度 | 固定系数 |

## 三、常见误区

- 误以为 KV Cache 省的是算力——其实也省算力，但主要代价是**显存**。
- 长对话未做缓存淘汰，显存爆掉。

## 四、与开源书的对应

- llm-course「LLM Engineer / Inference」：https://github.com/mlabonne/llm-course
- 经典：Pope et al., *Efficiently Scaling Transformer Inference*, 2023 (KV Cache 分析).

## 七、面试题

- KV Cache 主要省的是算力还是显存？为什么？
- 长对话推理为何显存随长度线性增长？
