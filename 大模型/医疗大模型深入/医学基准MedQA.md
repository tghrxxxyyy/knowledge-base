# 医学基准 MedQA

> 见「模型评测指标深入/能力基准MMLU」与「医疗大模型深入/医疗应用概况」。

## 一、背景与挑战

需专业考试级基准衡量医学知识（USMLE 风格）。

## 二、核心原理

MedQA 含多选题源自美国医师执照考试，测临床知识与推理；另有 PubMedQA（文献）、MMLU 医学子集。

## 三、代码实现

```python
score = evaluate(model, medqa, few_shot=True)
```

## 四、关键要点

- 高分不代表临床可用。
- 需实时指南对齐。

## 五、与其他对比

- MMLU 通用；MedQA 专业。

## 六、常见误区

- 过考试=会看病。

## 七、与开源书对应

- MedQA: https://github.com/jind11/MedQA
- llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- MedQA 与临床可用性的差距？

## 九、演进

选择题 → 真实病历 → 多模态临床。

## 十、小结

医学基准是专业能力的门槛。
