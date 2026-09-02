# Qwen 系列

> 见「开源模型生态深入/开源模型格局」与「多语言与跨语言深入」。

## 一、背景与挑战

中文与多语场景需强模型，Qwen 表现突出。

## 二、核心原理

Qwen2/2.5 覆盖 0.5B~72B、MoE（Qwen-Max/Plus 闭源，Qwen2.5 开源），中英双语强，工具调用友好。

## 三、关键要点

- 中英均衡。
- 长上下文（128K+）。

## 四、代码实现

```python
m = AutoModelForCausalLM.from_pretrained("Qwen/Qwen2.5-14B-Instruct")
```

## 五、与其他对比

- 相比 Llama 中文更强。

## 六、常见误区

- 仅中文——其实多语。

## 七、与开源书对应

- Qwen 官方; llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- Qwen 的中文优势来源？

## 九、演进

Qwen → Qwen1.5 → 2 → 2.5。

## 十、小结

Qwen 是中文开源代表。
