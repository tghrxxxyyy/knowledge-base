# BatchNorm 深入

> 见「深度学习基础/池化与归一化层」。补充训练细节。

## 一、背景与挑战

内部协变量偏移(ICS)使深层网络训练困难。BN 对每个特征在 batch 维归一化，稳定分布。

## 二、核心原理

训练用 batch 统计，推理用滑动平均全局统计；含可学习 `γ, β`。

## 三、关键要点

- batch 过小统计不稳，需用 GN/LN。
- CNN 标配，Transformer 不用。

## 四、与开源书对应

- Ioffe & Szegedy, *Batch Normalization*, 2015.

## 五、面试题

- BN 推理为何用滑动平均而非 batch 统计？

## 六、小结

BN 是 CNN 时代基石，但在小 batch/序列场景被 LN 取代。
