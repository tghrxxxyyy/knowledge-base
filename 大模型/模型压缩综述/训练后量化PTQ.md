# 训练后量化 PTQ

> 见「量化基础」。此处补充 PTQ 流程。

## 一、核心概念

PTQ 不重训，直接用标定数据估计量化参数(scale/zero-point)，把 FP16→INT8/INT4。流程：收集标定样本 → 统计激活分布 → 选量化粒度(per-tensor/per-channel/per-group) → 映射。

## 二、关键要点

- 量化粒度越细(per-group)越准但开销大。
- 标定数据需代表真实分布。

## 三、面试题

- per-channel 与 per-tensor 量化的差异？
