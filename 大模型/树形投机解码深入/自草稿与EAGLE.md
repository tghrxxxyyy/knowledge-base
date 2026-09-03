# 自草稿与 EAGLE

> 对应 Li et al., *EAGLE*, 2024（用目标模型特征自回归草稿）。

## 一、背景与挑战

独立小草稿模型与目标分布偏移大、接受率低；EAGLE 用目标模型自身特征做草稿。

## 二、核心原理

EAGLE 在目标模型隐状态上训练轻量自回归头，预测下 token 特征再映射为 token；草稿贴近目标分布，接受率高。

## 三、数学形式

草稿分布 $q_\theta(\cdot|h_t)\approx p(\cdot|h_t)$；$h_t$ 为目标模型隐状态，分布更近故接受率升。

## 四、代码实现

```python
head = EAGLEHead(target.model)
draft = head.speculate(hidden, gamma)
```

## 五、与其他对比

- 比 独立草稿模型 接受率更高；
- 与 树形投机深入 组合成树。

## 六、常见误区

- EAGLE 仍需训练且绑定特定目标模型；
- 隐状态头推断增少量开销。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- EAGLE 为何接受率高？答：用目标模型隐状态草稿，分布更贴近目标。

## 九、演进

小模型草稿 → 特征草稿 → 多阶 EAGLE。

## 十、小结

EAGLE 用目标模型特征自草稿，显著提升投机接受率。
