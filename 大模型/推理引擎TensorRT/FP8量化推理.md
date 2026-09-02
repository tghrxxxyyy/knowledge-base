# FP8 量化推理

> 对应 NVIDIA Hopper FP8 与 Microscaling(MX)。

## 一、核心概念

FP8(8-bit 浮点，E4M3/E5M2)在 H100/H200 上有原生 Tensor Core 支持，相比 FP16 带宽与算力翻倍，且因保留指数位，精度损失远小于 INT8。TRT-LLM 原生支持 FP8 权重+激活。

## 二、关键要点

- FP8 几乎无损于 FP16(多数任务)。
- 需硬件支持(Hopper+)。

## 三、面试题

- FP8 相比 INT8 为何精度更好？
