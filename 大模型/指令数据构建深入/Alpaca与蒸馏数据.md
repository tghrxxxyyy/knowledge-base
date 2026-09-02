# Alpaca 与蒸馏数据

> 见「指令数据构建深入/指令数据总览」。

## 一、背景与挑战

Self-Instruct 用 text-davinci 蒸馏出 52K 指令数据，开启「小模型+蒸馏」范式。

## 二、核心原理

以 175 条人工种子经 Self-Instruct 扩到 52K 指令，再用强模型生成回答，微调 LLaMA-7B 得到 Alpaca。

## 三、关键要点

- 成本低（仅 API 调用）。
- 蒸馏继承教师偏见/局限。

## 四、代码实现

```python
alpaca = load("tatsu-lab/alpaca")  # 标准数据集
```

## 五、与其他对比

- Alpaca 偏通用；ShareGPT 偏多轮对话；Wizard 偏 Evol-Instruct 复杂化。

## 六、常见误区

- 蒸馏数据可直接复用到别的基座——分布差异需重评估。

## 七、与开源书对应

- Alpaca: https://github.com/tatsu-lab/stanford_alpaca
- Taori et al., 2023.

## 八、面试题

- Alpaca 的 52K 数据从何而来？有何局限？

## 九、演进

Alpaca → Vicuna(ShareGPT) → WizardLM(Evol-Instruct) → 多源。

## 十、小结

Alpaca 证明蒸馏指令可激活开源模型指令遵循。
