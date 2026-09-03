# EWC 弹性权重固化

> 见「持续学习深入/持续学习挑战」。

## 一、背景与挑战

如何在不存旧数据下防忘？

## 二、核心原理

EWC 用 Fisher 信息估计参数重要性，对重要参数加二次惩罚，限制其大幅变动。

## 三、数学形式

```
L = L_new + λ Σ_i F_i (θ_i - θ*_i)^2
```

F_i 为 Fisher 对角。

## 四、代码实现

```python
penalty = lam * sum(F * (theta - theta_star)**2)
```

## 五、关键要点

- Fisher 近似重要性。
- λ 平衡新旧。

## 六、与其他对比

- 回放需存数据；EWC 不需。

## 七、常见误区

- Fisher 完全准确——仅对角近似。

## 八、与开源书对应

- Kirkpatrick et al., *EWC*, 2017.
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 九、面试题

- EWC 如何用 Fisher 信息？

## 十、演进

EWC → 在线EWC → 其它正则法。

## 十一、小结

EWC 用重要性护参数。
