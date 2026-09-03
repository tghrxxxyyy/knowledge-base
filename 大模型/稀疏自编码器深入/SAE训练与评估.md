# SAE 训练与评估

> 对应 Cunningham et al., 2023；Marks et al., *Sparse Feature Circuits*, 2023.

## 一、背景与挑战

SAE 需大规模激活数据、稳训练，且要量化“是否真可解释、是否漏特征”。

## 二、核心原理

在大量残差流激活上训练；评估用重构误差、特征活频次（dead feature 比例）、单义性（人工/自动标注语义一致性）。

## 三、数学形式

dead rate $=\frac1F\sum_f\mathbb I(\text{act}_f<\epsilon\ \forall\text{批次})$；可解释性打分 $S=\text{align}(f, \text{text})$。

## 四、代码实现

```python
dead = (feature_acts.amax(0) < 1e-6).float().mean()
recon = ((x - sae(x))**2).mean().item()
```

## 五、与其他对比

- 与 数据高效学习深入（训练数据质量）相关。
- 与 激活监控深入（用 SAE 特征做监控）衔接。

## 六、常见误区

- dead features 浪费容量却常被忽视。
- 仅看重构误差忽略可解释性。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 如何衡量 SAE 质量？答：低重构误差 + 低 dead feature 率 + 高特征单义/可解释性。

## 九、演进

小模型实验 → 大规模训练 → 自动化可解释性评测。

## 十、小结

SAE 训练与评估需兼顾重建与解释，dead feature 管理是落地关键。
