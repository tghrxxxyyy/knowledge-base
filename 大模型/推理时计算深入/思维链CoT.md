# 思维链（Chain-of-Thought）

> 对应 Wei et al., *Chain-of-Thought Prompting*, 2022。

## 一、背景与挑战

复杂推理直接给答案易错；需显式中间步骤。

## 二、核心原理

提示模型"一步步想"，生成中间推理再给结论；可零样本（"let's think step by step"）或少数样本示范。

## 三、数学形式

输出分解 $y=\text{reason}(x)\oplus \text{ans}(x)$；训练目标含推理步骤似然。

## 四、代码实现

```python
prompt = q + "\n让我们一步步思考："
chain = model(prompt, max_new=512)
```

## 五、与其他对比

- 与 指令遵循（推理指令）相关。
- 与 推理时计算总览 衔接（基础）。

## 六、常见误区

- 误以为 CoT 让小模型突然变强（对大模更显）。
- 步骤不监督致逻辑跳跃。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- CoT 为何有效？答：把复合问题分解为可学习的中间步骤，降低每步难度并利用训练分布。

## 九、演进

few-shot CoT→zero-shot→自动 CoT。

## 十、小结

CoT 是推理时计算基石，激发模型逐步推理能力。
