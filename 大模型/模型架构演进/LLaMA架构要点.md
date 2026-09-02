# LLaMA 架构要点

> 现代开源 LLM 参考架构。

## 一、背景与挑战

LLaMA 在 GPT 基础上做工程优化：Pre-Norm + RMSNorm + RoPE + SwiGLU + GQA(2/3)。

## 二、核心原理

```
x = x + Attn(RMSNorm(x))
x = x + FFN(RMSNorm(x)),  FFN=SwiGLU
```

## 三、关键要点

- SwiGLU 替代 ReLU FFN。
- RoPE 提供位置。
- GQA 省 KV。

## 四、与开源书对应

- Touvron et al., *LLaMA / LLaMA-2*, 2023.

## 五、面试题

- LLaMA 相比原始 Transformer 做了哪些改动？

## 六、小结

LLaMA 是现代开源模型事实模板。
