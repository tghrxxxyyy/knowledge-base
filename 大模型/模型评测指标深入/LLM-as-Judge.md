# LLM-as-Judge

> 见「模型评测深入/评测方法」与「大模型与NL2SQL/评测」。

## 一、背景与挑战

开放生成难用 n-gram 评，用强 LLM 当裁判打分渐成主流。

## 二、核心原理

用 GPT-4 级模型按 rubric 对「回答-参考/两两」打分。分 pointwise（绝对）与 pairwise（相对）。

## 三、关键要点

- 需控制位置偏差（A/B 交换）。
- 裁判模型也可能被操纵。

## 四、代码实现

```python
score = judge(f"按标准评分:\n{ref}\n候选:\n{cand}")
```

## 五、与其他对比

- 自动指标快但浅；LLM 裁判深但贵且可变。

## 六、常见误区

- 裁判永远客观——存在自我偏好（偏好同类输出）。

## 七、与开源书对应

- Zheng et al., *Judging LLM-as-a-Judge*, 2023.
- llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- LLM 裁判如何缓解位置偏差？

## 九、演进

人工 → 规则指标 → LLM 裁判 → 多裁判聚合。

## 十、小结

LLM-as-Judge 是开放生成评测的事实标准。
