# 概念激活向量（TCAV）

> 对应 Kim et al., *Interpretability Beyond Feature Attribution*, 2018.

## 一、背景与挑战

想量化“某高层概念（如性别、毒性）对模型预测的贡献”，但概念难用单 token 表达。

## 二、核心原理

收集概念正负样例，在层激活上训练线性分类器，其法向量即为概念激活向量（CAV）；用 CAV 方向度量概念对预测的导数灵敏度。

## 三、数学形式

$CAV_w=\arg\min_w \mathcal L(h_w(f_l(x)),y_{concept})$；$TCAV=\frac1{|X|}|\{x:\frac{\partial f_l(x)}{\partial CAV_w}>0\}|$。

## 四、代码实现

```python
cav = LinearSVM().fit(H_pos, 1).fit(H_neg, 0).coef_
sens = (grad_of_logit_along(CAV) > 0).mean()
```

## 五、与其他对比

- 与 线性探针深入（CAV 即概念方向探针）同源。
- 与 特征归因深入（全局概念 vs 局部 token）互补。

## 六、常见误区

- 概念样例选择带偏见致 CAV 偏斜。
- 用随机方向做显著性检验（需随机概念基线是 TCAV 关键）。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- TCAV 为何要随机方向做检验？答：验证 CAV 方向灵敏度显著高于随机方向，排除偶然。

## 九、演进

单概念探针 → TCAV 显著性 → 多概念审计。

## 十、小结

TCAV 用概念方向量化高层概念影响，是模型审计的有力工具。
