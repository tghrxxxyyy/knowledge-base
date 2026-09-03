# Transformer-XL 相对编码

> 对应 Dai et al., *Transformer-XL: Attentive Language Models Beyond a Fixed-Length Context*, 2019。

## 一、背景与挑战

固定长度分段 Transformer 在段边界处丢失跨段依赖；且绝对位置在每段重置，无法区分“段内位置”与“段间历史位置”。

## 二、核心原理

XL 用相对位置并重用上一段的隐藏状态（memory）。相对位置由正弦向量 $R$ 表示，注意力分数拆为基于内容项与基于相对位置项四部分，使位置表达与绝对索引解耦。

## 三、数学形式

分数 $A_{i,j}^{rel}= \underbrace{q_i^T k_j}_{内容} + \underbrace{q_i^T W_{k,R} R_{i-j}}_{位置} + u^T k_j + v^T W_{k,R}R_{i-j}$，其中 $u,v$ 为可学习绝对内容偏置。

## 四、代码实现

```python
# 相对位置正弦 R_{i-j}
rel = W_k_R @ R[clamp(i - j, -mem, mem)]      # (n, d)
scores = q @ k_t.transpose(-1,-2) + q @ rel + u @ k_t + v @ rel
```

## 五、与其他对比

- 与 Shaw 2018 相比，XL 用正弦相对向量且引入段重用的 memory 机制。
- 与 无限上下文深入（流式分块）思想一脉相承。

## 六、常见误区

- 误以为 XL 只用相对编码；它还靠段间 memory 缓存实现长依赖。
- 相对距离上限设置过小限制长程。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- Transformer-XL 如何突破固定长度？答：相对位置编码 + 缓存上一段隐藏状态作 memory 跨段注意力。

## 九、演进

段级绝对 → XL 相对+memory → 各类长上下文方案。

## 十、小结

XL 把相对位置与段重用结合，是长程语言建模与相对编码的标志性工作。
