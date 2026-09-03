# TRADES 鲁棒-准确权衡

> 对应 Zhang et al., *Theoretically Principled Trade-off*, 2019；与 对抗训练总览深入 衔接。

## 一、背景与挑战

强鲁棒训练往往牺牲自然准确率，TRADES 显式权衡二者。

## 二、核心原理

把目标拆为自然损失 + $\beta$ 倍鲁棒正则（原始与对抗输出 KL 散度），用 $\beta$ 控制权衡。

## 三、数学形式

$\min_\theta\, \mathcal L(f(x),y)+\beta\,\mathbb E_{\delta}\mathrm{KL}(f(x)\|f(x+\delta))$。

## 四、代码实现

```python
loss = ce(y, f(x)) + beta * kl(f(x), f(x+delta))
```

## 五、与其他对比

- 与 标签平滑深入 都用 KL/熵正则，但目标不同。
- 与 PGD攻击深入 共享对抗样本构造。

## 六、常见误区

- $\beta$ 过大致自然精度崩。
- 误以为 TRADES 完全消除权衡（理论下界仍存在）。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- TRADES 思想？答：把鲁棒性显式作为 KL 正则项，用 $\beta$ 平衡自然与鲁棒精度。

## 九、演进

Madry min-max → TRADES → 信息论变体。

## 十、小结

TRADES 以 KL 正则显式权衡鲁棒与自然精度，提供更可控训练。
