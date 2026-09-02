# Llama 系列

> 见「开源模型生态深入/开源模型格局」与「模型架构演进」。

## 一、背景与挑战

Llama 开启开源 LLM 浪潮，需了解演进。

## 二、核心原理

Llama2（GQA、长上下文）、Llama3（更大词表、更优 tokenizer、强多语）逐步逼近闭源；社区衍生众多。

## 三、关键要点

- GQA 降 KV 缓存。
- 词表扩展到 128K（Llama3）。

## 四、代码实现

```python
m = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.1-8B")
```

## 五、与其他对比

- 相比早期开源，质量大幅提升。

## 六、常见误区

- Llama 全开源——部分权重受限许可。

## 七、与开源书对应

- Llama 官方; llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- Llama3 相比 Llama2 改进？

## 九、演进

Llama1 → 2 → 3 → 3.1/3.2。

## 十、小结

Llama 是开源标杆。
