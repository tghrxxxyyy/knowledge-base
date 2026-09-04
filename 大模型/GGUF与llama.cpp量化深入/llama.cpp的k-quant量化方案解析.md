# llama.cpp的k-quant量化方案解析

> 对应 ggerganov/llama.cpp 的 k-quant (Q4_K/Q5_K/Q6_K) 量化实现。

## 一、背景与挑战

朴素 Q4_0/Q5_0 对所有权重同精度，精度有限。k-quant 引入按张量重要性分块、混合精度的"超块 (super-block)"结构，在同等体积下提升精度。

## 二、核心原理

k-quant 把权重分为若干 super-block（如 256 元素），每个 super-block 含一个共享 scale 与若干 sub-block（如 8 元素一组）的附加 scale/scale 因子，对重要维度精细量化。

## 三、形式化与数学基础

Q4_K 对每个 super-block：

$ \\hat w = s_{sb}\\cdot (s_{sub}\\cdot q + d),\\quad q\\in\\{0,\\dots,15\\} $

附加因子 $ s_{sub},d $ 以低比特表示，整体仍约 4.5~5 bit/权重，精度优于均匀 Q4_0。

## 四、代码实现

```python
# 概念: k-quant super-block 量化 (简化)
def q4k_block(w, sb=256, sub=8):
    out = []
    for i in range(0, len(w), sb):
        blk = w[i:i+sb]
        s_sb = blk.abs().max() / 15
        for j in range(0, sb, sub):
            sub_blk = blk[j:j+sub]
            s_sub = (sub_blk / s_sb).abs().max()
            q = torch.clamp(torch.round(sub_blk / (s_sb * s_sub)), 0, 15)
            out.append((q, s_sb * s_sub))
    return out
```

## 五、与其他技术对比

- Q4_K_M 比 Q4_0 精度高且体积相近，是性价比首选。
- 相比 GPTQ/AWQ 的 group 量化，k-quant 把混合精度做进格式本身。

## 六、常见误区

- 认为 Q4_K 严格等于 4bit；实际因附加 scale 略超 4bit。
- 盲目选 Q2_K 追求极小体积导致崩坏。

## 七、与开源书/权威来源对应

- ggerganov/llama.cpp: https://github.com/ggerganov/llama.cpp
- huggingface/transformers: https://github.com/huggingface/transformers

## 八、面试题

- k-quant 的 super-block 是什么？
- Q4_K_M 为何比 Q4_0 更优？
- k-quant 是否严格 4bit？

## 九、演进与趋势

llama.cpp 持续新增 IQ(n) 等 imatrix 引导量化，借助重要性矩阵进一步提升低比特质量。

## 十、小结

k-quant 通过超块混合精度在体积与精度间取得更好平衡，是 GGUF 生态主流量化。
