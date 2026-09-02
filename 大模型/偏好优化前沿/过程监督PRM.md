# 过程监督 PRM

> 见「推理与思考模型深入/推理与思考模型」与「偏好优化前沿/RRHF与多目标对齐」。

## 一、背景与挑战

只看最终答案对错（ORM）难激励中间推理正确。PRM 对每一步推理打分。

## 二、核心原理

训练过程奖励模型，对推理链每步判对错，训练/搜索时依步骤奖励引导，提升复杂推理成功率（如数学）。

## 三、数学形式

轨迹得分：

```
R(traj) = Σ_{k} r_k,  r_k = PRM(step_k)
```

## 四、代码实现

```python
step_scores = [prm(s) for s in steps]
if min(step_scores) < thr: reject(traj)
```

## 五、关键要点

- 标注成本高（需逐步标注）。
- 配合 beam search/best-of-n 显著提升。

## 六、与其他对比

- ORM 粗；PRM 细但贵。

## 七、常见误区

- PRM 一定优于 ORM——标注不准时反伤。

## 八、与开源书对应

- Lightman et al., *Let's Verify Step by Step*, 2023.
- llm-course: https://github.com/mlabonne/llm-course

## 九、面试题

- PRM 为何比 ORM 更适合推理任务？

## 十、演进

ORM → PRM → 自举 PRM（模型标模型）。

## 十一、小结

过程监督是推理模型的关键训练信号。
