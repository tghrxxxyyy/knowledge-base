# Mistral 与 MoE 生态

> 见「稀疏专家混合深入/MoE原理」与「开源模型生态深入/开源模型格局」。

## 一、背景与挑战

Mistral 以高效架构（滑动窗口、MoE）著称。

## 二、核心原理

Mistral 7B（滑动窗口注意）、Mixtral 8x7B（MoE）以少激活参数达高性能；社区衍生众多。

## 三、关键要点

- 滑动窗口省上下文。
- MoE 高效。

## 四、代码实现

```python
m = AutoModelForCausalLM.from_pretrained("mistralai/Mixtral-8x7B-Instruct")
```

## 五、与其他对比

- 同算力 MoE 更强。

## 六、常见误区

- 8x7B=56B 激活——实际约 13B。

## 七、与开源书对应

- Mistral 官方; llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- Mixtral 效率来自哪？

## 九、演进

Mistral-7B → Mixtral → 小模型。

## 十、小结

Mistral 引领高效开源。
