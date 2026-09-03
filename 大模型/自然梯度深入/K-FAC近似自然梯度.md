# K-FAC近似自然梯度

> 对应 Martens & Grosse, ICML 2015。

## 一、背景与挑战

全 Fisher 逆成本 $O(p^3)$ 不可行；利用层结构分解。

## 二、核心原理

将 Fisher 近似为各层输入/输出梯度协方差的 Kronecker 积，使预条件可分层求逆。

## 三、数学形式

$G\approx\text{diag}(A_1\otimes G_1,\ldots,A_L\otimes G_L)$；自然梯度更新按层白化。

## 四、代码实现

```python
ng = kron(inv_G_l, inv_A_l) @ grad_l
```

## 五、与其他对比

- 与 二阶优化深入 的 K-FAC 节同算法。
- 与 自然梯度总览 是具体实现。

## 六、常见误区

- 协方差缺乏滑动平均会震荡。
- 忽略层间耦合仅块对角，可能偏差。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 如何用 K-FAC 做自然梯度？答：每层用输入/梯度协方差 Kronecker 分解求逆，白化该层梯度。

## 九、演进

全 Fisher → 块对角 → 自适应阻尼 K-FAC。

## 十、小结

K-FAC 是自然梯度在大模型的主要可行实现路径。
