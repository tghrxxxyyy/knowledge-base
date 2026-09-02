# Gorilla 与 API 调用

> 见「Function_Calling进阶/工具调用协议」。

## 一、背景与挑战

通用模型对海量 API 的准确调用弱。Gorilla 专攻「根据自然语言选对 API 并填参」。

## 二、核心原理

用 API 文档（Torch/Hub/ML/...）构造指令数据微调，使模型输出正确的 API 调用，配合检索器缓解 API 频繁变更。

## 三、关键要点

- 检索器实时拉取最新 API 文档。
- 显著降低「幻觉 API 名/参数」。

## 四、代码实现

```python
# Gorilla 输出结构化调用
call = "torch.nn.Linear(in_features=784, out_features=10)"
```

## 五、与其他对比

- 通用 function calling 泛化；Gorilla 在 API 检索场景更准。

## 六、常见误区

- 认为任何 API 调用都靠通用模型——长尾 API 需专门训练。

## 七、与开源书对应

- Gorilla: https://github.com/gorilla-llm/gorilla
- Patil et al., *Gorilla*, 2023.

## 八、面试题

- Gorilla 如何用检索器应对 API 变更？

## 九、演进

静态微调 → 检索增强调用 → 多 API 编排。

## 十、小结

Gorilla 把「自然语言→API」做成专门能力。
