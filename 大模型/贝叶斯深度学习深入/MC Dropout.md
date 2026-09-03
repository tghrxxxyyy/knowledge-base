# MC Dropout

> 见「贝叶斯深度学习深入/贝叶斯深度学习总览」；Gal & Ghahramani, 2016。

## 一、背景与挑战

不想改网络结构也能估计不确定性？

## 二、核心原理

在推理期**保留 dropout** 并多次前向传播，把多次预测当作后验采样。预测均值作点估计，方差作不确定性。理论证明 dropout 近似贝叶斯高斯过程（Gal & Ghahramani, 2016）。

## 三、数学形式

`Var ≈ (1/T)Σ (f_t - f̄)² + τ^{-1}`，含模型方差与观测噪声。

## 四、代码实现

```python
model.train()  # 保留 dropout
T = 20
preds = [model(x) for _ in range(T)]
unc = torch.stack(preds).var(0)
```

## 五、关键要点

- 实现零成本（不改变训练）。
- T 越大估计越准、越慢。

## 六、与其他对比

- 深度集成需多模型；MC Dropout 单模型。

## 七、常见误区

- 推理关 dropout 才对——估计不确定性需开着。

## 八、与开源书对应

- Gal & Ghahramani, 2016.
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 九、面试题

- 为何 MC Dropout 能近似贝叶斯？

## 十、演进

Dropout(正则) → MC Dropout(不确定性)。

## 十一、小结

一次训练，多次采样得置信。
