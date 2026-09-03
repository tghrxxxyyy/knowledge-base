# 结果监督（ORM）原理与局限

> 对应 Outcome Supervision。

## 一、背景与挑战

ORM 易获取（只需最终对否），但难诊断过程错误。

## 二、核心原理

对完整输出给标量；训练简单；推理时对采样解排序用 ORM。

## 三、数学形式

$r_{ORM}(x,y)\in\mathbb R$；偏好用该分数差（同 BT）。

## 四、代码实现

```python
for y in samples(x): score(y) = orm(x,y)
best = max(samples, key=score)
```

## 五、与其他对比

- 与 PRM 对照（稀疏 vs 密集反馈）。
- 与 奖励模型深入 同属 RM 家族。

## 六、常见误区

- 只信 ORM 致过程错误答案偶得高分。
- 最终答案对但过程错未被惩罚。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- ORM 局限？答：只看结果，难纠中间错误、易奖励错误过程。

## 九、演进

纯 ORM → ORM+验证器 → 混合监督。

## 十、小结

ORM 简单但反馈稀疏，适合数据易得场景。
