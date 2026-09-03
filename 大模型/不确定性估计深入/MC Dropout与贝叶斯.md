# MC Dropout 与贝叶斯近似

> 对应 Gal & Ghahramani, *Dropout as Bayesian Approximation*, 2016。

## 一、背景与挑战

全贝叶斯后验不可解；MC Dropout 用 dropout 多次前向近似。

## 二、核心原理

推理时保持 dropout 开，多次前向取均值/方差作为预测与不确定性；近似深度高斯过程后验。

## 三、数学形式

预测均值 $\bar\mu=\frac1T\sum_t f(x;w_t)$，方差含偶然与认知项；认知 $\approx \text{Var}_t(\mu_t)$。

## 四、代码实现

```python
model.train()                 # 保持 dropout
samples = [model(x) for _ in range(20)]
epistemic = samples.var(0).mean()
```

## 五、与其他对比

- 比集成省内存（同权重多采样）。
- 与 不确定性估计深入（总览）衔接。

## 六、常见误区

- 推理忘开 dropout 致不确定为零。
- dropout 率不当致近似偏差。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 问：MC Dropout 为何近似贝叶斯？答：多次 dropout 前向采样不同子网络，近似后验权重分布。

## 九、演进

集成 → MC Dropout → 深度集成。

## 十、小结

MC Dropout 以低成本近似不确定，是实用基线。
