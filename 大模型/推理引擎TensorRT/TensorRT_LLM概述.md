# TensorRT-LLM 概述

> 对应 NVIDIA TensorRT-LLM 与 In-Flight Batching 论文。

## 一、核心概念

TensorRT-LLM(TRT-LLM)是 NVIDIA 面向大模型推理的高性能引擎，核心优化：核融合(kernel fusion)、量化(FP8/INT4)、**In-Flight Batching**(连续批处理)、分页 KV Cache、注意力插件(FlashAttention/多查询注意力)。相比原生 HF 推理可提速数倍。

## 二、关键特性

| 特性 | 作用 |
|------|------|
| 核融合 | 减 kernel 启动 |
| FP8 | Hopper 加速 |
| In-Flight Batching | 提吞吐 |
| 分页 KV | 省显存 |

## 三、与开源书的对应

- TensorRT-LLM: https://github.com/NVIDIA/TensorRT-LLM
- 见「推理优化/vLLM部署」「PagedAttention」文档。

## 七、面试题

- TRT-LLM 相比 vLLM 的优势与适用场景？
