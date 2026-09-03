# MAML 详解

> 见「迁移与元学习深入/少样本与元学习」与「元学习算法深入/元学习算法总览」；Finn et al., 2017。

## 一、背景与挑战

如何得到一个「稍调即适配」的初始化？

## 二、核心原理

内循环：在任务上用当前 θ 算几步更新 `θ' = θ - α∇L_T(θ)`；外循环：优化 θ 使各任务 `θ'` 的损失之和最小。即学「最易微调的起点」。

## 三、数学形式

`min_θ Σ_T L_T(θ - α∇L_T(θ))`，二阶梯度需对 α 步反向。

## 四、代码实现

```python
for t in tasks:
    fast = theta - alpha * grad(L_t(theta))
    meta_loss += L_t(fast)
meta_loss.backward()  # 二阶
```

## 五、关键要点

- 二阶梯度计算贵（可用一阶近似 FOMAML）。
- 学的是「可塑性」而非具体知识。

## 六、与其他对比

- 预训练学表征；MAML 学适应过程。

## 七、常见误区

- MAML=预训练——目标不同。

## 八、与开源书对应

- Finn et al., 2017.
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 九、面试题

- MAML 内外循环各自优化什么？

## 十、演进

MAML → FOMAML(一阶) → Reptile。

## 十一、小结

MAML，学「起跑姿势」。
