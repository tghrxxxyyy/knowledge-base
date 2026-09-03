# 对比损失与 InfoNCE

> 对应 Oord et al., *CPC*, 2018（InfoNCE）；Chen et al., *SimCLR*, 2020（视觉对比）。

## 一、背景与挑战

如何定义“相似句得更近”的可微目标；负例构造是关键。

## 二、核心原理

锚点句与正例（同义/自身增广）拉近，与一批负例推远；InfoNCE 把任务当分类（在负例中认出正例）。

## 三、数学形式

$\mathcal L_{NCE}=-\log\frac{\exp(z\cdot z^+/\tau)}{\exp(z\cdot z^+/\tau)+\sum_{k}\exp(z\cdot z_k^-/\tau)}$。

## 四、代码实现

```python
logits = (z @ z_all.T) / tau
loss = F.cross_entropy(logits, pos_idx)
```

## 五、与其他对比

- 与 稠密检索训练深入（批内负例）同源。
- 与 双塔训练技巧（triplet）对照。

## 六、常见误区

- 温度 $\tau$ 太大欠区分、太小过自信。
- 负例含假负例（同义）拉偏。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- InfoNCE 为何是分类？答：在含一正例的负例集合中做 softmax 分类，等价于对比。

## 九、演进

triplet → InfoNCE → 去偏 NCE。

## 十、小结

InfoNCE 是嵌入训练主损，温度与负例质量定表征。
