# Shampoo 优化器

> 对应 Gupta et al., *Shampoo: Preconditioned Stochastic Tensor Optimization*, 2018；与 二阶预条件优化器总览深入 衔接。

## 一、背景与挑战

Adam 仅逐元素缩放；Shampoo 对每层权重矩阵做左右预条件，捕捉输入输出维结构。

## 二、核心原理

对权重 $W\in\mathbb R^{m\times n}$ 维护 $L\in\mathbb R^{m\times m}$、$R\in\mathbb R^{n\times n}$ 近似左右逆协因数，分别预条件两个维度。

## 三、数学形式

更新 $W \leftarrow W - \eta\, L^{-1/2} G R^{-1/2}$，其中 $L\approx\mathbb E[GG^\top],R\approx\mathbb E[G^\top G]$。

## 四、代码实现

```python
L = momentum(L, G@G.T)
R = momentum(R, G.T@G)
step = lr * invsqrt(L) @ G @ invsqrt(R)
```

## 五、与其他对比

- 比 Adam 更贴合层结构，但需维护两个矩阵、开销大。
- 与 KFAC深入 同属矩阵预条件但近似对象不同。

## 六、常见误区

- 矩阵逆每步重算太贵，需逆平方根的滑动估计。
- 忽略特征维远大于批次时的尺度问题。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Shampoo 与 Adam 核心差异？答：Adam 逐元素，Shampoo 对层做左右矩阵预条件。

## 九、演进

Adam → Shampoo → 分布式 Shampoo（分片特征值）。

## 十、小结

Shampoo 以层矩阵预条件捕捉结构信息，收敛更优但工程更重。
