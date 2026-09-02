# DeepSeek-R1 解析

> 对应 DeepSeek-AI, *DeepSeek-R1*, 2025。开源推理模型的里程碑。

## 一、核心概念

DeepSeek-R1 通过**大规模 RL(类 GRPO)** 让模型自发涌现长链推理(aha moment)，并蒸馏到小模型。关键：

- **R1-Zero**：纯 RL(无 SFT 冷启动)即从基础模型涌现推理，但可读性差。
- **R1**：加冷启动 SFT + 多阶段 RL(推理 RL + 通用对齐 RL)，兼顾能力与可读性。
- **蒸馏**：把 R1 的推理能力蒸馏到 Qwen/Llama 小模型，小模型也能强推理。

## 二、关键要点

- 推理能力可通过 RL 自我进化，未必需海量 SFT。
- 蒸馏让小模型获得大模型推理行为。

## 三、与开源书的对应

- DeepSeek-AI, *DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning*, 2025.

## 七、面试题

- R1-Zero 的「aha moment」指什么？
- 为何 R1 比 R1-Zero 更实用？
