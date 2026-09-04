# Pre-LN和Post-LN初始化

> 对应 Xiong 2020 (On Layer Normalization in Transformer) 与 Vaswani 2017。

## 一、背景与挑战
Transformer 有 Post-LN(归一化在残差后)与 Pre-LN(归一化在残差前)两种。Post-LN 深层训练不稳需 warmup，Pre-LN 更稳但表达略异。

## 二、核心原理
Post-LN 最后一层的梯度随深度无衰减，需小初始化+长 warmup；Pre-LN 梯度直接回传下层、各层梯度范数相近，训练更稳，但需对残差分支适当缩放防最后层主导。

## 三、形式化与数学基础
Post-LN 梯度范数 $\\|\\nabla\\|\\propto L$；Pre-LN 各层 $\\|\\nabla_l\\|$ 近似常数。DeepNorm 给出：
$ \\mathrm{Post\\text{-}LN}: \\alpha = (2N)^{1/4},\\; \\beta = (8N)^{-1/3} $，
稳定深层训练(属后续改进)。

## 四、代码实现
```python
import torch
# Pre-LN 块
def pre_ln(x, attn, mlp):
    h = x + attn(torch.nn.functional.layer_norm(x, x.shape[-1:]))
    h = h + mlp(torch.nn.functional.layer_norm(h, h.shape[-1:]))
    return h
# Post-LN 将 layer_norm 放到最外层
```

## 五、与其他技术对比
Pre-LN 易训练但表征容量略低，大模型多采 Pre-LN；Post-LN 需 warmup 与缩放。Xiong 2020 论证二者差异来源。

## 六、常见误区
误区一：Pre-LN 无需 warmup——仍建议。误区二：二者数学等价——归一化位置改变梯度流。误区三：Post-LN 不可用，实际加 deepnorm 后可。

## 七、与开源书/权威来源对应
Xiong 2020 LN 分析；Vaswani 2017 原始 Post-LN；Shazeer 2020 GLU 相关。

## 八、面试题
问：Pre-LN 为何稳？答：梯度直连下层、各层范数相近。问：Post-LN 问题？答：末层梯度随深度增需 warmup。

## 九、演进与趋势
DeepNorm、Fixup 等消除 warmup；RMSNorm 替代 LayerNorm。

## 十、小结
归一化位置决定梯度流与训练稳定性，是大模型初始化设计的核心选择。
