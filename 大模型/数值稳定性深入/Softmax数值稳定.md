# Softmax 数值稳定

> 见「数值稳定性深入/数值稳定性总览」与「注意力数学基础/Softmax与温度」。

## 一、背景与挑战

exp 大数直接上溢。

## 二、核心原理

标准技巧：先减最大值 `m=max(z)`，再 `exp(z-m)`，结果不变但防上溢。因 `exp(z)/Σexp(z) = exp(z-m)/Σexp(z-m)`。所有 softmax 实现都应内置此技巧（PyTorch 已做）。

## 三、数学形式

`softmax(z)_i = exp(z_i - m) / Σ_j exp(z_j - m)`。

## 四、代码实现

```python
def stable_softmax(z):
    m = z.max(-1, keepdim=True); e = (z-m).exp()
    return e / e.sum(-1, keepdim=True)
```

## 五、关键要点

- 减最大值不改变结果。
- 必须做，否则易 Inf。

## 六、与其他对比

- 朴素 exp 易溢；稳定版安全。

## 七、常见误区

- 直接 exp 没事——大 logit 即爆。

## 八、与开源书对应

- d2l-zh: https://github.com/d2l-ai/d2l-zh
- 见「注意力数学基础」。

## 九、面试题

- softmax 为何要先减最大值？

## 十、演进

朴素 → 减最大值 → 在线归一化。

## 十一、小结

softmax，先「减峰」再算。
