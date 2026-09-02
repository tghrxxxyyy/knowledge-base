# DeepSeek 系列

> 见「推理与思考模型深入/推理与思考模型」与「稀疏专家混合深入/主流MoE模型」。

## 一、背景与挑战

DeepSeek 以低成本训练与强推理（R1）出圈。

## 二、核心原理

DeepSeek-V 系列用 MoE+MLA（多维潜在注意力）省 KV；R1 用 GRPO 强化推理，蒸馏小模型；训练成本创新低。

## 三、关键要点

- MLA 压缩 KV 缓存。
- R1 推理强且可蒸馏。

## 四、代码实现

```python
m = AutoModelForCausalLM.from_pretrained("deepseek-ai/DeepSeek-R1-Distill-7B")
```

## 五、与其他对比

- 相比同规模，推理突出。

## 六、常见误区

- R1 仅大模型——有蒸馏小版。

## 七、与开源书对应

- DeepSeek 官方; llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- DeepSeek 的成本优势来自？

## 九、演进

V1 → V2(MLA) → V3 → R1。

## 十、小结

DeepSeek 重塑性价比。
