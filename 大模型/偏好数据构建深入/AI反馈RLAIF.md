# AI 反馈（RLAIF）偏好构建

> 对应 Bai et al., *Constitutional AI*, 2022；Lee et al., *RLAIF*, 2023。

## 一、背景与挑战

人工标注不可规模化；用强模型当评委生成偏好，几乎零成本扩规模。

## 二、核心原理

RLAIF：用现成模型（或自身）对两回答打分/排序得偏好；Constitutional AI 用原则（宪法）引导自评，减少人工。

## 三、数学形式

偏好 $y_w = \arg\max_{y} \text{RM}_{AI}(x,y)$；用原则 $C$ 约束评判：$\text{judge}(x,y,C)$。

## 四、代码实现

```python
resp = llm(f"按原则{C}评判两回答优劣:\nA:{a}\nB:{b}")
pref = parse_pref(resp)
```

## 五、与其他对比

- 比人工便宜、可规模化，但带评委偏见。
- 与 直接偏好优化深入（用 AI 偏好做 DPO）直接结合。

## 六、常见误区

- 评委模型偏见被放大（自我偏好）。
- 原则设计不当致偏置价值观。

## 七、与开源书对应

- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 问：RLAIF 风险？答：AI 评委偏见被继承放大，需多样评委与原则校验。

## 九、演进

人工 → 单模型评委 → 宪法式多原则。

## 十、小结

RLAIF 以 AI 评委规模化偏好，但须防偏见固化。
