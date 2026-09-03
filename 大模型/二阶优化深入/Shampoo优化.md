# Shampoo预条件优化

> 对应 Gupta et al., *Shampoo: Preconditioned Stochastic Tensor Optimization*, ICLR 2018。

## 一、背景与挑战

逐参数标量预条件（如 Adam）忽略张量结构；Shampoo 用矩阵预条件贴合参数形状。

## 二、核心原理

对 $d$ 维张量参数，沿每个模式（mode）维护协方差矩阵并求逆，提供张量感知的预条件。

## 三、数学形式

对矩阵 $W\in\mathbb R^{m\times n}$，预条件 $(L^{-1} W R^{-1})$，$L\approx\mathbb E[WW^\top], R\approx\mathbb E[W^\top W]$。

## 四、代码实现

```python
# 每个模式维护并定期求逆
update = inv_L @ grad @ inv_R
```

## 五、与其他对比

- 与 K-FAC 同用矩阵预条件但更通用。
- 与 自适应学习率深入（Adam）是标量版对比。

## 六、常见误区

- 多模式矩阵求逆开销大，需间隔更新。
- 小矩阵不划算，仅在大张量受益。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Shampoo 比 Adam 强在哪？答：用张量各模式矩阵预条件，捕捉参数结构，大矩阵更优。

## 九、演进

标量预条件 → 矩阵预条件 → 分布式 Shampoo。

## 十、小结

Shampoo 把二阶预条件推广到张量结构，是大模型训练有力候选。
