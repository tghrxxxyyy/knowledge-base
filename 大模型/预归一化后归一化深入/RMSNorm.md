# RMSNorm

> 对应 Zhang & Sennrich, *Root Mean Square Layer Normalization*, 2019（LLaMA/GPT 等广泛采用）。

## 一、背景与挑战

LayerNorm 需算均值与方差两步；RMSNorm 省去均值中心化，仅用均方根缩放，更省算力且在大模型上表现好。

## 二、核心原理

RMSNorm 对激活 $x$ 按 $\text{RMS}(x)=\sqrt{\frac1d\sum x_i^2}$ 归一，再乘可学习增益 $g$，不做去均值。

## 三、数学形式

$\hat x_i = \frac{x_i}{\sqrt{\frac1d\sum_j x_j^2+\epsilon}}\cdot g_i$，无均值项，计算更轻。

## 四、代码实现

```python
def rmsnorm(x, g, eps=1e-6):
    v = x.pow(2).mean(-1, keepdim=True)
    return x / (v + eps).sqrt() * g
```

## 五、与其他对比

- 与 LayerNorm 相比省去减均值，速度更快、稳定性在大模型上相当或更好。
- 与 门控线性单元与激活变体深入 常组合（Pre-LN+RMSNorm+SwiGLU）。

## 六、常见误区

- 误以为 RMSNorm 等价于 LayerNorm；它无中心化，对偏移不变。
- 忘记增益 $g$ 仍需要，否则尺度丢失。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 为何大模型爱用 RMSNorm？答：省去均值计算更快，且去中心化对大模型稳定足够。

## 九、演进

LayerNorm → RMSNorm（2019）→ 成为 LLaMA/GPT 标准归一化。

## 十、小结

RMSNorm 以更简计算达到同等稳定，是现代 LLM 归一化默认。
