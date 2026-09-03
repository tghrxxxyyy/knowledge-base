# RLHF 训练不稳定与诊断

> 对应 RLHF 崩溃经验；训练不稳定诊断深入 衔接。

## 一、背景与挑战

RLHF 易奖励崩、熵塌、语言混舌；需诊断与防护。

## 二、核心原理

监控：奖励均值/方差、生成熵、KL、重复率、RM 分数分布；崩时回退参考或降 lr/β。

## 三、数学形式

熵 $H(\pi(\cdot|x))=-\sum_y \pi\log\pi$；熵骤降预警模式塌缩。

## 四、代码实现

```python
if entropy < thr or kl > kl_max:
    rollback_to(ref); lr *= 0.5
```

## 五、与其他对比

- 与 直接偏好优化深入（更稳）对照稳训。
- 与 数值稳定性深入（溢出/梯度）共享。

## 六、常见误区

- 忽视熵监控致模型退化成单一套路。
- 奖励上升误判为成功（可能黑客）。

## 七、与开源书对应

- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 问：RLHF 熵塌缩表现？答：生成多样性骤降、重复套话，需监控熵并回退/降 lr。

## 九、演进

盲训 → 指标监控 → 自适应回退。

## 十、小结

RLHF 不稳需多指标监控与回退机制，否则悄然后退。
