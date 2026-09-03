# 自然梯度与 Fisher 信息

> 对应 Amari, *Natural Gradient*, 1998；与 KFAC深入 衔接。

## 一、背景与挑战

普通梯度沿欧氏方向，未考虑参数流形几何；自然梯度沿黎曼测地线更优。

## 二、核心原理

自然梯度 $=F^{-1}\nabla\mathcal L$，其中 $F$ 为 Fisher 信息矩阵，使更新在分布空间中等距。

## 三、数学形式

$\widetilde\nabla\mathcal L = F^{-1}\nabla\mathcal L$；更新 $\theta\leftarrow\theta-\eta\,\widetilde\nabla\mathcal L$。

## 四、代码实现

```python
nat_grad = solve(F, grad)      # F 为 Fisher 近似
theta -= lr * nat_grad
```

## 五、与其他对比

- KFAC/Shampoo 本质是自然梯度的可计算近似。
- 与 学习率调度深入 共用更新幅度调节。

## 六、常见误区

- 精确 Fisher 不可算，必须用近似。
- 误把普通梯度逆当自然梯度。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 自然梯度相比普通梯度？答：用 Fisher 逆校正，沿参数流形几何最速下降，收敛更直。

## 九、演进

欧氏梯度 → 自然梯度 → 近似自然梯度（KFAC/Shampoo）。

## 十、小结

自然梯度以 Fisher 刻画流形几何，是二阶预条件的理论根基。
