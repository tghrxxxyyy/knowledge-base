# RMSNorm 数值稳定性

> 对应 Zhang & Sennrich, *Root Mean Square Layer Normalization*, 2019（RMSNorm，LLaMA 等采用）。

## 一、背景与挑战

LN 需减均值再除标准差，计算两步。RMSNorm 省略减均值（中心化），仅用均方根缩放，省算力且在大模型上表现相当。

LLaMA、GPT-NeoX 等主流 LLM 采用 RMSNorm。

## 二、核心原理

$x_{norm}=x/\sqrt{\frac1D\sum_i x_i^2+\epsilon}$，再乘可学习缩放 $g$：$y=g\cdot x_{norm}$。

不减去均值意味着保留输入的绝对电平，但实践中稳定且高效。

## 三、数学形式

$\mathrm{RMS}(x)=\sqrt{\frac1D\sum_i x_i^2}$；$\hat x=x/\mathrm{RMS}(x)$；$y=g\odot\hat x$（$\epsilon$ 防零）。

## 四、代码实现

```python
import torch
def rmsnorm(x, g, eps=1e-6):
    r = x.pow(2).mean(-1, keepdim=True).add(eps).sqrt()
    return x / r * g
```

## 五、与其他对比

- 与 LayerNorm 数值 比较：少了中心化，更快。
- 与 注意力数值稳定与溢界深入 衔接，RMSNorm 在注意力子层前后。
- 与 混合精度实践陷阱 相关，RMS 计算对低精度敏感。

## 六、常见误区

- 误以为 RMSNorm 等于 LN（差一个减均值）。
- eps 太小致平方和下溢为 0 时除 0。
- 把缩放 $g$ 误置为偏差 $\beta$（RMSNorm 无偏置）。

## 七、与开源书对应

- LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- RMSNorm 与 LN 区别？答：RMSNorm 不中心化（不减均值），仅 RMS 缩放，更快。
- 为何大模型爱用 RMSNorm？答：省中心化、稳定且高效，实证有效。

## 九、演进

LN → RMSNorm → 带偏置的变体（如 GPT-2 用 LN 带 bias）。

## 十、小结

RMSNorm 以更简的 RMS 缩放达到与 LN 相近稳定，是 LLM 主流选择。
