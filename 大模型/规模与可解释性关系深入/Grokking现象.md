# Grokking现象

> 对应 Power et al., *Grokking: Generalization Beyond Overfitting*, 2022；Nanda et al., 2023。

## 一、背景与挑战

小模型在训练很久后突然从记忆跃迁到泛化，这种"顿悟"能否被解释？

## 二、核心原理

在算法性任务（模运算等）上，模型先过拟合训练集、测试差；训练后期权重突变为简洁回路，测试骤升。进度度量显示回路在"顿悟"前已逐步成形。

## 三、数学形式

设泛化差距 $g = \text{acc}_{test} - \text{acc}_{train}$；grokking 表现为 $g$ 长期近 0 后骤升至 0 附近（测试追平）。

## 四、代码实现

```python
for step in schedule:
    if step % 1000 == 0:
        print(step, acc_train(model), acc_test(model))  # 后期骤升
```

## 五、与其他对比

- 与 数学运算回路 衔接（回路形成过程）。
- 与 规模与可解释性关系深入 共享"可解释化顿悟"。

## 六、常见误区

- 以为 grokking 只属小玩具；大模型某些子任务也有。
- 把过拟合期当失败而停训。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Grokking 是什么？答：训练后期模型从死记突变为学成简洁回路，测试准确率骤升。

## 九、演进

现象发现 → 进度度量 → 机制解释（回路成形）。

## 十、小结

Grokking 是可解释性难得能"看穿学习"的现象，桥接训练动态与回路。
