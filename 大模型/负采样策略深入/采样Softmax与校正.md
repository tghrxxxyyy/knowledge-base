# 采样 Softmax 与重要性校正

> 对应 Jean et al., 《Sampled Softmax》, 2014；以及偏差校正理论。

## 一、背景与挑战

全 softmax 在大词表/大实体集不可行；采样后需校正采样偏差。

## 二、核心原理

每步只算小部分类（采样），用重要性权重校正采样分布与真实分布的偏差（如校正因子 $Q(y)/P_n(y)$）。

## 三、数学形式

校正概率 $\tilde p(y) = \frac{Q(y)}{P_n(y)} p(y)$，使期望与全 softmax 一致。

## 四、代码实现

```python
logits_s = logits[idx] - log(Q[idx] / Pn[idx])   # 校正偏置
loss = cross_entropy(logits_s, label_pos)
```

## 五、与其他对比

- 与 负采样策略深入总览（NEG 不校正）对照。
- 与 度量学习深入（检索负样本）衔接。

## 六、常见误区

- 未校正致高频类占优。
- 采样分布与真实分布差大时校正不稳。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 采样 softmax 为何要校正？答：采样分布偏置使梯度有偏，校正项恢复无偏估计。

## 九、演进

全 softmax → 采样 softmax → 带校正采样。

## 十、小结

采样 softmax 以校正保无偏，适合超大类数场景。
