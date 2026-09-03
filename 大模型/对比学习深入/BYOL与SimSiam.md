# BYOL 与 SimSiam

> 见「对比学习深入/对比学习总览」。

## 一、背景与挑战

对比学习需大量负例，能否无负例？

## 二、核心原理

BYOL 用在线/目标双网络+预测头，仅拉近正例（无负例），靠目标网络滑动平均防崩塌；SimSiam 用 stop-grad 简化。

## 三、关键要点

- 防表征崩塌（全同）是核心。
- stop-grad 是关键。

## 四、代码实现

```python
p = predictor(online(x1)); t = target(x2).detach()
loss = mse(p, t)
```

## 五、与其他对比

- 对比式需负例；二者免负例。

## 六、常见误区

- 无负例必崩——stop-grad/动量防崩。

## 七、与开源书对应

- Grill et al., *BYOL*, 2020.
- Chen & He, *SimSiam*, 2021.

## 八、面试题

- BYOL 如何避免表征坍塌？

## 九、演进

BYOL → SimSiam(简化)。

## 十、小结

无负例对比拓宽了范式。
