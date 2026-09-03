# MGDA 与帕累托最优

> 对应 Sener & Koltun, 《MGDA》, 2018（多目标梯度下降）。

## 一、背景与挑战

多任务应追求帕累托最优而非简单加权；加权法可能得非最优解。

## 二、核心原理

把多任务转多目标，求公共下降方向（Frank-Wolfe 解最小冲突凸组合），或按帕累托前沿选解。

## 三、数学形式

求 $\min_{\alpha\succeq0,\|\alpha\|=1} \|\sum_t \alpha_t g_t\|^2$ 得最优权重，无公共下降则取该解。

## 四、代码实现

```python
alpha = solve_qp([g_t.numpy() for g_t in grads])   # 最小范数组合
g = sum(alpha[t] * g_t for t in tasks)
```

## 五、与其他对比

- 与 PCGrad深入（去冲突）共享方向处理。
- 与 多任务梯度平衡总览 衔接。

## 六、常见误区

- QP 求解增计算。
- 帕累托前沿需多解权衡难自动。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- MGDA 目标？答：求使各任务损失共同下降的方向，或帕累托最优解，避免无效加权。

## 九、演进

加权求和 → MGDA → 帕累托前沿搜索。

## 十、小结

MGDA 以多目标最优方向逼近帕累托，理论上更优但计算更贵。
