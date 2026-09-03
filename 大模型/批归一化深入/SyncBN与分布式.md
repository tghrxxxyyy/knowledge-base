# SyncBN 与分布式

> 见「批归一化深入/小批量与BN问题」；多卡 BN 一致性。

## 一、背景与挑战

数据并行时每卡 batch 小，BN 统计偏。

## 二、核心原理

**SyncBN（同步批归一化）**：跨所有卡的同一层求全局均值/方差再归一化，等效大 batch，提升小 batch 下 BN 质量。代价是卡间通信。大模型多弃 BN 用 LN 规避此问题。

## 三、关键要点

- 单卡小 batch 时 SyncBN 救场。
- 通信开销存在。

## 四、代码实现

```python
bn = nn.SyncBatchNorm(C)   # 多卡同步
```

## 五、与其他对比

- 普通 BN 卡内统计；SyncBN 全局。

## 六、常见误区

- 多卡 BN 自动同步——需显式 SyncBN。

## 七、与开源书对应

- d2l-zh: https://github.com/d2l-ai/d2l-zh
- 见「分布式训练」。

## 八、面试题

- 数据并行下 BN 为何要同步？

## 九、演进

BN → SyncBN → 改用 LN。

## 十、小结

SyncBN，让多卡「同账本」。
