# Transformer FLOPs 计算

> 对应 Shazeer, 2019；Narayanan et al., 2021（3D 并行训练）.

## 一、背景与挑战

要精确估算需分解各算子（注意力、FFN、embedding、LayerNorm）的浮点开销。

## 二、核心原理

主要开销在矩阵乘：每个 $m\times n$ 乘 $n\times k$ 约 $2mnk$ FLOPs；注意力额外有 $2n^2d$ 的 QK/PV 运算。

## 三、数学形式

单层 FLOPs $\approx 2d_{model}^2(12h^2+4h^2)$ 近似；注意力 $O(n^2d)$，FFN $O(nd_{ff})$；总 $C=6ND$ 已含这些。

## 四、代码实现

```python
def attn_flops(n, d):
    return 2*n*n*d + 2*n*n          # QK^T 与 softmax·V（粗略）
def ffn_flops(b, s, d, d_ff):
    return 2*b*s*d*d_ff*2
```

## 五、与其他对比

- 与 训练算力估算总览（宏观 6ND）是微观/宏观两层。
- 与 推理算力估算（无反向、无优化器状态）对照。

## 六、常见误区

- 忽略激活重算（checkpointing）增加的额外前向 FLOPs。
- 把参数量 FLOPs 与 MAC 混用（1 MAC=2 FLOPs）。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 注意力 FLOPs 随序列长度如何缩放？答：QK^T 与 PV 均为 $O(n^2d)$，故注意力开销随序列长度平方增长。

## 九、演进

粗略 6ND → 分项算子统计 → 含重算/并行细化。

## 十、小结

分项 FLOPs 分析揭示注意力是长序列瓶颈，是优化与估算的微观基础。
