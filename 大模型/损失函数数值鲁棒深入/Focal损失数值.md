# Focal Loss 数值行为

> 对应 Lin et al., *Focal Loss for Dense Object Detection*, 2017（Focal Loss）。

## 一、背景与挑战

Focal Loss 在交叉熵上乘调制因子 $(1-p_t)^\gamma$，抑制易分样本权重，聚焦难例；但极端 $p_t\to 0$ 时数值需小心。

实现上以 logits 直接计算更稳定，避免对极小概率取 log。

## 二、核心原理

$\mathcal L_{FL}=-(1-p_t)^\gamma\log p_t$，其中 $p_t$ 为目标类概率；$\gamma$ 越大越聚焦难例。

用 $\log p_t=-\mathrm{CE}$ 可由稳定交叉熵复用，避免手算概率。

## 三、数学形式

$p_t=\mathrm{softmax}(z)_y$；$\mathcal L_{FL}=-(1-p_t)^\gamma\log p_t$，或以 logits：$\alpha_t(1-p_t)^\gamma(-\log p_t)$。

## 四、代码实现

```python
import torch.nn.functional as F
ce = F.cross_entropy(logits, target, reduction="none")
pt = torch.exp(-ce)
fl = (1 - pt) ** gamma * ce
loss = (alpha * fl).mean()
```

## 五、与其他对比

- 与 交叉熵数值稳定 共享稳定算子，仅增加调制因子。
- 与 类别不平衡（若新增）衔接，Focal 专为失衡设计。
- 与 标签平滑 同属目标改造，但目的不同。

## 六、常见误区

- 对 softmax 输出取 log 再算，重蹈溢出。
- $\gamma$ 过大致难例梯度爆炸。
- 忽视 $(1-p_t)$ 在 $p_t\to1$ 时趋零，易例被过度抑制。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Focal 为何聚焦难例？答：易例 $(1-p_t)$ 小、权重被压，难例权重近 1 被保留。
- 如何实现数值稳？答：基于稳定 cross_entropy 的 logits 路径，避免手算概率 log。

## 九、演进

CE → weighted CE → Focal Loss → 自适应聚焦。

## 十、小结

Focal Loss 在稳定交叉熵之上加调制，专治类别失衡与易例主导。
