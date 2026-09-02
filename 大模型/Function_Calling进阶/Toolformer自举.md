# Toolformer 自举

> 见「Function_Calling进阶/工具调用协议」。

## 一、背景与挑战

标注「何时调用工具」成本高。Toolformer 让模型自举学习调用 API。

## 二、核心原理

用少量示例让 LLM 标注「哪些文本位置应插入 API 调用」，执行后仅保留有帮助的样本微调，使模型自发决定调用时机与参数。

## 三、数学形式

样本保留准则：

```
keep iff utility(call) = P(y|x with call) - P(y|x) > 0
```

## 四、关键要点

- 自监督筛选降低人工标注。
- 支持计算器/检索/翻译等多工具统一学习。

## 五、与其他对比

- function calling 靠 Schema 声明；Toolformer 靠自举数据。

## 六、常见误区

- 以为无需任何标注——初始示例仍必要。

## 七、与开源书对应

- Toolformer: https://github.com/lucidrains/toolformer-pytorch
- Schick et al., *Toolformer*, 2023.

## 八、面试题

- Toolformer 如何自动决定「是否」调用工具？

## 九、演进

人工标注 → 自举筛选 → 与 RLHF 结合。

## 十、小结

Toolformer 展示了工具调用能力也可自监督习得。
