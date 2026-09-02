# 自动提示工程 APE

> 对应 Zhou et al., *Automatic Prompt Engineer (APE)*, 2022。

## 一、核心概念

用模型**自动生成并筛选**提示：让 LLM 生成候选指令，在验证集上评估，选最优（可迭代「 proposals → score → 选优」）。把提示工程从人工试错变为自动搜索。

## 二、关键要点

- 需有可量化评估的验证集。
- 与「提示优化」工具(如 DSPy/OPRO)一脉相承。

## 三、与开源书的对应

- Zhou et al., *Large Language Models Are Human-Level Prompt Engineers*, 2022.

## 七、面试题

- 自动提示工程为何需要验证集？
