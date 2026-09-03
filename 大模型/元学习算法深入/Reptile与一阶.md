# Reptile 与一阶近似

> 见「元学习算法深入/元学习算法总览」；Nichol et al., *Reptile*, 2018。

## 一、背景与挑战

MAML 二阶梯度贵，能否用一阶近似？

## 二、核心原理

Reptile 极简：对每个任务做若干 SGD 步得 `θ_i`，然后把初始 θ 向各任务终点的平均方向拉：
```
θ ← θ + β·(1/K Σ θ_i - θ)
```
等价于 MAML 的一阶近似，但无需算二阶，实现简单。

## 三、数学形式

见上；核心是与任务终点的差向量。

## 四、代码实现

```python
for t in tasks:
    phi = sgd_copy(theta, t, steps=k)
    accum += phi - theta
theta += beta * accum / K
```

## 五、关键要点

- 比 MAML 省算力。
- 隐含了「初始到终点的位移」。

## 六、与其他对比

- MAML 二阶精确；Reptile 一阶近似。

## 七、常见误区

- Reptile 偷工——效果接近 MAML。

## 八、与开源书对应

- Nichol et al., 2018.
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 九、面试题

- Reptile 与 MAML 关系？

## 十、演进

MAML → FOMAML → Reptile。

## 十一、小结

一阶，也够用。
