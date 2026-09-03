# Pre-LN 与 Post-LN

> 对应 Xiong et al., *On Layer Normalization in the Transformer Architecture*, 2020；Nguyen & Salazar, 2019。

## 一、背景与挑战

原始 Transformer 把 LN 放在子层输出之后（Post-LN），深层训练易不稳定、需 warmup；如何提升稳定性？

## 二、核心原理

Pre-LN 把 LN 移到子层输入之前：$x_{out}=x+Sublayer(LN(x))$。理论表明 Pre-LN 梯度更平滑、训练更稳定、warmup 需求低，但可能略损最终精度；Post-LN 表达更强但更难训。

## 三、数学形式

Post-LN：$x' = LN(x + Sublayer(x))$。Pre-LN：$x' = x + Sublayer(LN(x))$。两者残差路径不同导致梯度范数差异。

## 四、代码实现

```python
# Pre-LN
h = x + attn(ln1(x))
out = h + ffn(ln2(h))
# Post-LN: out = ln(x + attn(x) + ffn(...))
```

## 五、与其他对比

- 与 线性注意力深入/相对位置编码深入 无直接关系，属模块结构选择。
- Pre-LN 常配更简单的学习率调度。

## 六、常见误区

- 认为 Post-LN 一定更差；大模型下合理 warmup 仍可用。
- 混用 Pre/Post 致深层梯度异常。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- Pre-LN 为何更易训练？答：LN 在残差分支输入，梯度沿恒等路径更平滑，减少深层退化。

## 九、演进

Post-LN(原始) → Pre-LN(稳定) → Pre-LN+RMSNorm(LLM 主流)。

## 十、小结

Pre-LN 以结构微调显著改善深层训练稳定，是现代大模型的事实标准。
