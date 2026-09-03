# RMSProp

> 对应 Tieleman & Hinton, *Lecture 6.5*, 2012（Geoff Hinton 课程）。

## 一、背景与挑战

AdaGrad 累积无衰减致步长过早消失；需对历史加权遗忘。

## 二、核心原理

用指数滑动平均代替全累积，使近期梯度主导步长，缓解步长塌缩。

## 三、数学形式

$v_t=\beta v_{t-1}+(1-\beta)g_t^2$；更新 $\theta_t-\frac{\eta}{\sqrt{v_t}+\epsilon}g_t$。

## 四、代码实现

```python
v = 0.9*v + 0.1*g*g
theta -= lr * g / (v.sqrt() + 1e-8)
```

## 五、与其他对比

- 与 AdaGrad 相比引入遗忘因子。
- 与 Adam 共享 RMS 归一，但缺一阶动量。

## 六、常见误区

- β 过大致历史残留过久，过小失稳。
- 与 Adam 混淆，缺少动量叠加。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- RMSProp 相对 AdaGrad 改进？答：用指数滑动平均替代全累积，避免步长单调趋零。

## 九、演进

全累积 → 滑动平均 → 与动量结合(Adam)。

## 十、小结

RMSProp 以指数遗忘修正 AdaGrad，是非凸训练常用优化器。
