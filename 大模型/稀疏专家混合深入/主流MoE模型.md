# 主流 MoE 模型

> 见「稀疏专家混合深入/MoE原理」与「模型架构演进」。

## 一、背景与挑战

多个开源模型采用 MoE 验证可行性。

## 二、核心原理

Mixtral(8专家选2)、DeepSeekMoE(细粒度+共享专家)、Qwen-MoE 等，参数量巨大但激活少。

## 三、关键要点

- 共享专家捕获通用知识。
- 细粒度提升专家专精度。

## 四、代码实现

```python
from transformers import AutoModelForCausalLM
m = AutoModelForCausalLM.from_pretrained("mistralai/Mixtral-8x7B")
```

## 五、与其他对比

- 同算力下 MoE 参更多。

## 六、常见误区

- 8x7B=56B 激活——实际激活约 13B。

## 七、与开源书对应

- Mixtral: https://huggingface.co/mistralai
- DeepSeekMoE 论文.

## 八、面试题

- Mixtral 8x7B 实际激活多少参数？

## 九、演进

Switch → Mixtral → DeepSeekMoE。

## 十、小结

MoE 已成开源大模型主流形态。
