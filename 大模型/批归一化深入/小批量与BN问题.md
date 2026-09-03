# 小批量与 BN 问题

> 见「批归一化深入/批归一化总览」；BN 的局限。

## 一、背景与挑战

BN 在大模型/小 batch/序列上表现差。

## 二、核心原理

BN 依赖 batch 内统计：batch 小（<8）时均值方差噪声大、不稳；序列/变长场景难定 batch 轴；分布式下需跨卡同步（SyncBN）才准。这促成 LayerNorm/RMSNorm 在 Transformer 中取代 BN。

## 三、关键要点

- 小 batch 慎用 BN。
- 序列模型多用 LN。

## 四、代码实现

```python
# 小 batch 改用 LN
x = nn.LayerNorm(d)(x)
```

## 五、与其他对比

- BN 慢小 batch；LN 稳。

## 六、常见误区

- BN 处处可用——序列/小批不宜。

## 七、与开源书对应

- d2l-zh: https://github.com/d2l-ai/d2l-zh
- 见「归一化深入」（待补）。

## 八、面试题

- 为何 Transformer 不用 BatchNorm？

## 九、演进

BN → LN（序列）→ RMSNorm（高效）。

## 十、小结

BN，也有「不适区」。
