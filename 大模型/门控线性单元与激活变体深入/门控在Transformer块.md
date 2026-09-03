# 门控在Transformer块

> 对应 Shazeer 2020 与 LLaMA（Touvron et al., 2023）采用 SwiGLU + RMSNorm 的块设计。

## 一、背景与挑战

Transformer 每块含注意力与 FFN；门控主要作用于 FFN，需理解其在整体残差流中的角色。

## 二、核心原理

典型块：先 RMSNorm→注意力→残差，再 RMSNorm→SwiGLU FFN→残差；门控在 FFN 内部对注意力输出做非线性路由。

## 三、数学形式

$h_{t+1}=h_t + \text{Attn}(\text{Norm}(h_t)) + \text{SwiGLU}(\text{Norm}(h_{t+1}))$，门控只出现在第二项。

## 四、代码实现

```python
h = h + attn(norm1(h))
h = h + swiglu(norm2(h))
```

## 五、与其他对比

- 门控 FFN 与门控注意力（如 Gated Attention）不同层；本主题聚焦 FFN 门控。
- 与 预归一化后归一化深入 强相关：归一化位置决定门控输入分布。

## 六、常见误区

- 把块级残差门控与 FFN 内 GLU 门混为一谈。
- 在 Post-LN 下直接用 SwiGLU 易训练不稳，需配 Pre-LN。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 门控在 Transformer 哪一层起作用？答：主要在 FFN（SwiGLU），对通道做乘法路由。

## 九、演进

无门控 FFN → GLU → SwiGLU，且与 Pre-LN/RMSNorm 协同成为标准块。

## 十、小结

门控 FFN 是现代 Transformer 块的质量核心，与 Pre-LN 协同稳定训练。
