# 思维链 Chain-of-Thought

> 对应 Wei et al., *Chain-of-Thought Prompting*, 2022。提升复杂推理的核心技术。

## 一、核心概念

CoT 在 prompt 中加入「逐步推理」的示例或指令，让模型先输出中间推理步骤，再给最终答案。显著改善算术、常识、符号推理。

```
问题：小刚有5苹果，吃了2个，又买3箱每箱4个，共几个？
思考：初始5，吃2剩3，买3×4=12，共3+12=15。
答案：15
```

零样本 CoT 只需加一句「让我们一步步思考」(Kojima et al., 2022)。

## 二、数学直觉

CoT 把单步难映射 `x → y` 分解为 `x → z_1 → ... → y`，每步在模型能力强范围内。

## 三、关键要点

| 形式 | 说明 |
|------|------|
| 少样本 CoT | 给推理示例 |
| 零样本 CoT | "let's think step by step" |
| 自洽性 | 多采样投票 |

## 四、常见误区

- 把推理步骤当最终答案解析，需明确分隔。
- 简单任务加 CoT 反而增加延迟、无意义。

## 五、与开源书的对应

- Wei et al., *Chain-of-Thought Prompting Elicits Reasoning in LLMs*, 2022.
- Kojima et al., *Large Language Models are Zero-Shot Reasoners*, 2022.
- Prompt-Engineering-Guide: https://www.promptingguide.ai/zh/techniques/cot

## 七、面试题

- 为什么 CoT 能提升推理？
- 零样本 CoT 的关键触发句是什么？
