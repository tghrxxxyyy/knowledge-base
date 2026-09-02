# In-Flight Batching

> 见「推理优化/连续批处理」。TRT-LLM 实现。

## 一、核心概念

In-Flight Batching 即连续批处理：在每生成步动态插入新请求、移出完成请求，按 token 步调度，消除静态批处理的「短板效应」。TRT-LLM 与 vLLM 均实现，是生产吞吐关键。

## 二、关键要点

- 与 PagedAttention 配合最佳。
- 显著提升 GPU 利用率。

## 三、面试题

- In-Flight Batching 如何提升 GPU 利用率？
