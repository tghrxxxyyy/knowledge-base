# 自洽性 Self-Consistency

> 对应 Wang et al., *Self-Consistency*, 2022。CoT 的集成式增强。

## 一、核心概念

对同一问题用 CoT 采样多条不同推理路径，对最终答案**多数投票**。不同路径可能得出不同答案，正确推理往往更一致，从而提升准确率。

```
生成 k 条带 CoT 的回答 → 提取答案 → 多数投票
```

## 二、关键要点

- 成本 = k 倍推理，需权衡。
- 对算术/符号推理提升明显（GSM8K +10+ 点）。

## 三、与开源书的对应

- Wang et al., *Self-Consistency Improves Chain of Thought*, 2022.

## 七、面试题

- 自洽性为何通常优于单条 CoT？
- 其代价与收益如何权衡？
