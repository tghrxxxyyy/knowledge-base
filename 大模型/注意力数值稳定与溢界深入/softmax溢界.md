# Softmax 溢界与防护

> 对应数值 softmax 标准实现（减最大值）；PyTorch `softmax` 内部稳定。

## 一、背景与挑战

softmax 含 $\exp$，当输入最大值很大时上溢为 Inf，进而 NaN；当所有输入极小且相减不当时下溢。

防护须同时处理上溢/下溢，且保持梯度正确。

## 二、核心原理

稳定 softmax：先减去行最大值 $m$，再 exp、归一：$\mathrm{softmax}(z)_i=e^{z_i-m}/\sum_j e^{z_j-m}$。

减最大值保证指数输入非正（最大为 0），杜绝上溢；下溢项自然趋 0，不影响归一。

## 三、数学形式

$\mathrm{softmax}(z)_i=\frac{e^{z_i-m}}{\sum_j e^{z_j-m}},\,m=\max_j z_j$；数学等价于原始 softmax。

## 四、代码实现

```python
def stable_softmax(z):
    m = z.amax(dim=-1, keepdim=True)
    e = (z - m).exp()
    return e / e.sum(-1, keepdim=True)
```

## 五、与其他对比

- 与 对数求和指数技巧 同源：都靠最大值平移。
- 与 交叉熵数值稳定 衔接，cross_entropy 内部用 log_softmax。
- 与 注意力数值稳定与溢界深入 总览呼应，注意力 softmax 同样需稳。

## 六、常见误区

- 不减最大值直接 exp，大 logits 立刻 Inf。
- 在 FP16 中做 softmax，最大值平移后仍可能因尺度丢精度（需 FP32）。
- 误用 sum 而非 logsumexp 实现交叉熵。

## 七、与开源书对应

- annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- softmax 为何减最大值？答：指数输入非正，根除数值上溢，数学不变。
- FP16 下 softmax 还稳吗？答：最大值平移后仍可能下溢，建议 FP32 路径。

## 九、演进

朴素 exp/归一 → 最大值平移 → 融合 log_softmax。

## 十、小结

softmax 溢界靠最大值平移解决，且低精度下应走 FP32 路径。
