# AdaGrad

> 对应 Duchi, Hazan & Singer, *Adaptive Subgradient Methods*, JMLR 2011。

## 一、背景与挑战

不同参数梯度频率差异大（如 NLP 稀疏特征），固定 LR 难兼顾。

## 二、核心原理

累积历史梯度平方，频繁更新参数步长减小、罕见参数步长保持大，自适应稀缺特征。

## 三、数学形式

$v_t=v_{t-1}+g_t^2$；$update=\frac{\eta}{\sqrt{v_t}+\epsilon}g_t$；累积使步长单调递减。

## 四、代码实现

```python
v += g * g
theta -= lr * g / (v.sqrt() + 1e-8)
```

## 五、与其他对比

- 与 RMSProp/Adam 相比无指数遗忘，后期步长趋零。
- 与 自适应学习率总览 同源。

## 六、常见误区

- 长训练下累积致步长过小提前停。
- 对非凸深度学习易过早收敛。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- AdaGrad 缺点？答：累积平方无衰减，长训练步长单调趋零，不利非凸深网。

## 九、演进

AdaGrad → RMSProp(加衰减) → Adam。

## 十、小结

AdaGrad 开创自适应思想，但累积衰减缺陷促生后续变体。
