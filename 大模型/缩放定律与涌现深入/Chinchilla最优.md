# Chinchilla 最优

> 见「缩放定律与涌现深入/缩放定律」。

## 一、背景与挑战

给定算力，参数与数据如何分配最优？

## 二、核心原理

Chinchilla 指出此前模型（如 Gopher）参数过大、数据不足；同算力下应大致等比例增参数与数据，70B 模型配 1.4T tokens 更优。

## 三、关键要点

- 数据量需随参数增。
- 小模型+多数据常更效。

## 四、代码实现

```python
# 经验：tokens ≈ 20 × params
data_tokens = 20 * params
```

## 五、与其他对比

- Gopher 参数过多；Chinchilla 均衡。

## 六、常见误区

- 越大越好——受算力/数据约束。

## 七、与开源书对应

- Hoffmann et al., 2022.
- llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- 为何 Chinchilla 用更多数据？

## 九、演进

Kaplan → Chinchilla → 实际训练配比。

## 十、小结

配比决定算力效率。
