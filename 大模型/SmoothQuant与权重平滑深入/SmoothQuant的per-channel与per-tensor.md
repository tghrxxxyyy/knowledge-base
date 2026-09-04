# SmoothQuant的per-channel与per-tensor

> 对应 Xiao 2023 SmoothQuant 中 per-channel / per-tensor 平滑粒度的讨论。

## 一、背景与挑战

平滑因子可逐通道 (per-channel) 或逐张量 (per-tensor) 计算。粒度影响精度与硬件友好度，需权衡。

## 二、核心原理

per-channel 对每个激活通道独立求 $ s_j $，最灵活、精度最高；per-tensor 用全局单值，硬件更易实现但平滑不充分。实践常取 per-channel 平滑 + per-tensor 权重量化。

## 三、形式化与数学基础

per-tensor：

$ s=\\frac{(\\max_j\\max|X_j|)^\\alpha}{(\\max_i\\max|W_i|)^{1-\\alpha}} $

per-channel 见前篇逐通道 $ s_j $。前者是后者的特例（所有 $ s_j $ 相等）。

## 四、代码实现

```python
import torch

def smooth_per_tensor(W, X, alpha=0.5):
    xmax = X.abs().max().item()
    wmax = W.abs().max().item()
    s = (xmax ** alpha) / (wmax ** (1 - alpha) + 1e-12)
    return W * s, X / s, s
# per-channel 见 smooth() 函数
```

## 五、与其他技术对比

- per-channel 精度高但需逐通道反量化，kernel 复杂。
- per-tensor 利于 Tensor Core，但离群通道未被单独处理。

## 六、常见误区

- 为硬件简便强行 per-tensor，导致离群通道仍难量化。
- 把平滑粒度与量化粒度混淆。

## 七、与开源书/权威来源对应

- Xiao et al. 2023, SmoothQuant.
- NVIDIA/TensorRT-LLM: https://github.com/NVIDIA/TensorRT-LLM
- pytorch/pytorch: https://github.com/pytorch/pytorch

## 八、面试题

- per-channel 与 per-tensor 平滑如何取舍？
- 为什么常 per-channel 平滑 + per-tensor 量化？
- 粒度对 hardware kernel 的影响？

## 九、演进与趋势

结合硬件特性的混合粒度（关键通道 per-channel，其余 per-tensor）是方向。

## 十、小结

平滑粒度是精度与硬件效率的折中，per-channel 平滑是 SmoothQuant 精度的来源。
