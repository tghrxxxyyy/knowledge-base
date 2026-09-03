# PGD攻击

> 对应 Madry et al., 2018；与 对抗训练总览深入 衔接。

## 一、背景与挑战

单步攻击弱，易被绕过；PGD（投影梯度下降）是多步强攻击，作为鲁棒性基准。

## 二、核心原理

从随机起点在 $\epsilon$-球内多步梯度上升最大化损失，每步后投影回约束集，得到强对抗样本。

## 三、数学形式

$\delta_{t+1}=\Pi_\epsilon(\delta_t+\alpha\,\text{sign}(\nabla_\delta\mathcal L(x+\delta_t,y)))$。

## 四、代码实现

```python
for _ in range(K):
    delta = (delta + alpha*delta.grad.sign()).clamp(-eps,eps)
    delta = (x+delta).clamp(0,1)-x
```

## 五、与其他对比

- 比 FGSM 强得多，是鲁棒评估的金标准。
- 与 对抗训练成本深入 强相关（多步昂贵）。

## 六、常见误区

- 步长 $\alpha$ 过大跨出球或震荡。
- 未随机重启，可能落非最坏点。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- PGD 为何是强攻击？答：多步+投影在约束内逼近最坏扰动，难以被弱防御骗过。

## 九、演进

FGSM → BIM → PGD（多步+随机重启）。

## 十、小结

PGD 以多步投影逼近最坏扰动，是衡量鲁棒性的标准攻击。
