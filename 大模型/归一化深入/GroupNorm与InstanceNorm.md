# GroupNorm 与 InstanceNorm

> 见「深度学习基础/池化与归一化层」。

## 一、背景与挑战

BN 在小 batch 失效。GN 把通道分组归一化(与 batch 无关)，IN 对单样本单通道归一化(风格迁移)。

## 二、核心原理

GN：通道分 G 组，组内求均值方差。IN：每组一个样本。

## 三、关键要点

- GN 适合小 batch 检测。
- IN 适合风格迁移。

## 四、与开源书对应

- Wu & He, *Group Normalization*, 2018.

## 五、面试题

- 为何风格迁移常用 InstanceNorm？

## 六、小结

归一化变体各有适用场景，依 batch 大小与任务选择。
