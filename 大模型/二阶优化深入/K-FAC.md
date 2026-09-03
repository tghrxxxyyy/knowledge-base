# K-FAC近似二阶优化

> 对应 Martens & Grosse, *Kronecker-factored Approximate Curvature (K-FAC)*, ICML 2015。

## 一、背景与挑战

全 Hessian 近似昂贵；K-FAC 利用神经网络层结构做 Kronecker 分解。

## 二、核心原理

将每层 Fisher/ Hessian 近似为输入激活协方差与梯度协方差的 Kronecker 积，使逆可分层高效计算。

## 三、数学形式

$A\approx\mathbb E[aa^\top]\otimes\mathbb E[gg^\top]$，其中 $a$ 为层输入、$g$ 为层输出梯度；预条件 $P=(A\otimes G)^{-1}$。

## 四、代码实现

```python
# 每层用 A^{-1} 与 G^{-1} 分别求逆
update = kron_inv_G @ grad @ kron_inv_A
```

## 五、与其他对比

- 与 自然梯度深入 同源（用 Fisher）。
- 与 二阶优化深入 总览衔接。

## 六、常见误区

- 协方差需指数滑动平均，否则震荡。
- 忽略层间耦合，K-FAC 仅为块对角近似。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- K-FAC 为何高效？答：用 Kronecker 分解把大矩阵逆拆成两个小矩阵逆，大幅降复杂度。

## 九、演进

全 Fisher → 块对角 → 自适应阻尼 K-FAC。

## 十、小结

K-FAC 通过结构分解实现可扩展自然梯度/二阶更新。
