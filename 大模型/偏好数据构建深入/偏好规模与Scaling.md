# 偏好数据规模与Scaling

> 对应偏好数据量研究（Touvron et al., *Llama 2*, 2023 用百万级偏好）。

## 一、背景与挑战

偏好数据多少合适？边际随规模递减且受质量影响。

## 二、核心原理

更多样高质量偏好提对齐上限；但噪声偏好边际收益骤降；存在质量-数量权衡点。

## 三、数学形式

对齐增益 $\Delta \approx f(N_{pref})$ 对数饱和；噪声比 $\eta$ 高时收益转负。

## 四、代码实现

```python
for n in [10k, 50k, 200k]:
    eval(dpo_train(subset(n)))
```

## 五、与其他对比

- 与 SFT 数据规模（指令量）对照。
- 与 数据高效学习深入（质量优先）共享。

## 六、常见误区

- 盲目堆量忽视噪声。
- 不与 SFT/预训分布对齐致偏移。

## 七、与开源书对应

- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 问：偏好数据何时饱和？答：在质量固定时呈对数饱和，过噪数据反伤，需质量优先。

## 九、演进

小集 → 百万级 → 质量加权采样。

## 十、小结

偏好数据规模受质量约束，质量加权优于单纯堆量。
