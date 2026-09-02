# 能力基准 MMLU

> 见「模型评测深入/评测基准」与「评测基准深入」。

## 一、背景与挑战

需综合衡量模型多学科知识，MMLU 是常用零样本/少样本多选题基准。

## 二、核心原理

涵盖 57 学科、约 1.5 万四选一题目，测知识与推理。few-shot 下看 in-context 能力。

## 三、代码实现

```python
from lm_eval import simple_evaluate
res = simple_evaluate(model="gpt2", tasks=["mmlu"])
```

## 四、关键要点

- 高分不一定代表实用能力。
- 存在数据污染风险（题在训练集）。

## 五、与其他对比

- MMLU 测知识；GSM8K 测数学；HumanEval 测代码。

## 六、常见误区

- 基准分高=样样强——存在学科偏科。

## 七、与开源书对应

- MMLU: https://github.com/hendrycks/test
- Hendrycks et al., 2020.

## 八、面试题

- 为何 MMLU 需关注数据污染？

## 九、演进

单基准 → 多基准套件（HELM/OpenCompass）。

## 十、小结

MMLU 是模型「知识体检」第一关。
