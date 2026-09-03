# 鲁棒优化 min-max

> 对应 Madry et al., 2018；与 对抗训练总览深入 衔接。

## 一、背景与挑战

min-max 训练不稳定，内外循环耦合，需正确求解内部最大化。

## 二、核心原理

外层 SGD 更新参数使损失最小，内层用攻击（PGD）求当前参数下最坏扰动；交替进行。

## 三、数学形式

内层 $\delta^*=\arg\max_{\|\delta\|\le\epsilon}\mathcal L(\theta,x+\delta)$；外层 $\theta\leftarrow\theta-\eta\nabla_\theta\mathcal L(\theta,x+\delta^*)$。

## 四、代码实现

```python
delta = pgd_attack(model, x, y)
opt.zero_grad(); model(x+delta, y).backward(); opt.step()
```

## 五、与其他对比

- 与 梯度累积深入 可组合（对抗步内也累积）。
- 与 学习率调度深入 共同决定收敛。

## 六、常见误区

- 内部攻击步数不足，min-max 求解不彻底。
- 内外学习率同设，攻击过强致训练崩。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- min-max 内外循环如何配合？答：内层用攻击求最坏扰动，外层在该扰动上更新参数。

## 九、演进

理论框架 → PGD 内循环 → 自动化攻击。

## 十、小结

min-max 是鲁棒训练的理论骨架，内部最大化求解质量决定鲁棒上限。
