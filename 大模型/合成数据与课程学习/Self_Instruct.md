# Self-Instruct

> 对应 Wang et al.(2022)。用模型自己造指令数据。

## 一、核心概念

Self-Instruct 用少量种子指令，让 LLM 自动扩写大量新指令与回答，经过滤后用于 SFT，显著降低人工标注成本。Alpaca 即基于此用 GPT-3.5 生成 52K 数据。

## 二、关键要点

- 种子质量决定多样性。
- 需去重与启发式过滤。

## 三、与开源书的对应

- Wang et al., *Self-Instruct*, 2022.
- Stanford Alpaca: https://github.com/tatsu-lab/stanford_alpaca

## 七、面试题

- Self-Instruct 如何避免生成数据同质化？
