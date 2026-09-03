# FGSM与快速对抗训练

> 对应 Goodfellow et al., *Explaining and Harnessing Adversarial Examples*, 2015；与 PGD攻击深入 衔接。

## 一、背景与挑战

PGD 训练成本高；FGSM 单步快但鲁棒较弱，需理解其定位。

## 二、核心原理

FGSM 沿梯度符号单步走 $\epsilon$ 构造扰动；快速对抗训练（如 Wong 2020）用单步+随机初始化提速。

## 三、数学形式

$\delta_{FGSM}=\epsilon\,\text{sign}(\nabla_x\mathcal L(x,y))$；快速训练在随机初始化起点加单步。

## 四、代码实现

```python
delta = eps * x.grad.sign()
loss = model(x+delta, y)
```

## 五、与其他对比

- 比 PGD 快数倍，但鲁棒性上限低。
- 与 对抗训练成本深入 是直接的速度-鲁棒权衡。

## 六、常见误区

- 单步 FGSM 易过拟合“标签泄露”现象（cat 成 dog）。
- 误以为 FGSM 训练可达 PGD 级鲁棒。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- FGSM 与 PGD 区别？答：单步 vs 多步投影，PGD 更强更贵，FGSM 快但鲁棒弱。

## 九、演进

FGSM → 快速对抗训练 → PGD 训练。

## 十、小结

FGSM 提供廉价鲁棒近似，适合资源受限或预筛场景。
