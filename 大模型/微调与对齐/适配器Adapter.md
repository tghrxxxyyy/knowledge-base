# Adapter 适配层

> 对应 Houlsby et al., *Parameter-Efficient Transfer Learning*, 2019。

## 一、核心概念

Adapter 在 Transformer 每个子层后插入一个小型瓶颈 MLP（降维-非线性-升维），仅训练这些适配器，冻结主干：

```
Adapter(x) = x + W_up · σ(W_down · LayerNorm(x))
```

`W_down: d→b`, `W_up: b→d`, `b ≪ d`（如 b=64）。

## 二、关键要点

- 参数量约 `2·b·d` 每层，随层数线性增长。
- 多语言/多任务常优于全参数微调且防遗忘。

## 三、与开源书的对应

- Houlsby et al., *Parameter-Efficient Transfer Learning for NLP*, 2019.

## 七、面试题

- Adapter 与 LoRA 的本质区别？
- 为何 Adapter 更抗灾难性遗忘？
