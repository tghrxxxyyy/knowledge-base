# 梯度冲突与 PCGrad

> 对应 Yu et al., 《PCGrad》, 2020（梯度冲突投影）。

## 一、背景与挑战

任务梯度方向冲突时直接相加会相互抵消，损害两任务。

## 二、核心原理

对冲突的任务梯度做投影：把某任务梯度投影到其它任务梯度的正交子空间，消除负干扰。

## 三、数学形式

若 $g_i^\top g_j < 0$，则 $g_i \leftarrow g_i - \frac{g_i^\top g_j}{\|g_j\|^2} g_j$（去冲突分量）。

## 四、代码实现

```python
for i, j in pairs:
    if dot(g[i], g[j]) < 0:
        g[i] -= proj(g[i], g[j])
```

## 五、与其他对比

- 与 不确定性加权深入（不处理方向）对照。
- 与 MGDA深入（帕累托）衔接。

## 六、常见误区

- 多任务两两投影顺序敏感。
- 完全去冲突可能拖慢收敛。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- PCGrad 思路？答：检测梯度冲突，将冲突分量投影到正交方向，消除任务间负干扰。

## 九、演进

直接相加 → 投影去冲突 → 梯度 surgery 家族。

## 十、小结

PCGrad 以正交投影解梯度冲突，是负迁移的有效对策。
