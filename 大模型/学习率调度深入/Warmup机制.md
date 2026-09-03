# Warmup机制

> 对应 Gotmare et al., 2018；大模型训练经验。

## 一、背景与挑战

训练初期 batch 统计/梯度噪声大，直接大 LR 致不稳定。

## 二、核心原理

前若干步 LR 从近 0 线性/余弦升到目标值，再进入主调度（余弦/阶梯）。

## 三、数学形式

线性 warmup：$\eta_t = \eta_{max}\cdot t/t_{warm}$（$t<t_{warm}$）。

## 四、代码实现

```python
sched = LinearWarmupCosine(opt, warmup=1000, max=1e-3)
```

## 五、与其他对比

- 大模型（尤其是预训练）几乎必带 warmup。
- 与 梯度裁剪深入 / 混合精度训练深入 协同稳定。

## 六、常见误区

- warmup 过短无效、过长拖慢。
- 与 batch size 缩放（linear scaling rule）配合：LR∝batch。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- warmup 与 batch size 关系？答：大 batch 常配大 LR+warmup，遵循 linear scaling。

## 九、演进

无 → 线性 → 余弦 warmup → 分层 warmup。

## 十、小结

warmup 是大规模训练的护栏，避免初期梯度冲击。
