# 梯度噪声与SGD泛化

> 对应 d2l-ai/d2l-zh 优化章节与 pytorch/pytorch 数据并行实现。

## 一、背景与挑战
mini-batch SGD 的梯度是真实梯度的有噪估计，这种噪声常被视为隐式正则，有助于泛化。

## 二、核心原理
小 batch 噪声大，起探索作用，易找到平坦解；大 batch 梯度准但易过拟合尖锐解。学习率调度放大/缩小该噪声。

## 三、形式化与数学基础
梯度估计 `g = ∇L + ξ`，`ξ ~ N(0, σ²/B·Σ)`。有效噪声方差 `∝ 1/B`，因此 `lr/√B` 常需协同缩放（linear scaling rule）。

## 四、代码实现
```python
# linear scaling rule：batch 翻倍则 lr 翻倍（前期）
base_bs, base_lr = 256, 3e-4
cur_bs, cur_lr = 512, base_lr * (cur_bs / base_bs)
```

## 五、与其他技术对比
全 batch 梯度下降收敛快但泛化差；带噪声 SGD 训练慢但更鲁棒。

## 六、常见误区
盲目增大 batch 而不调 lr，会削弱噪声、导致泛化下降。

## 七、与开源书/权威来源对应
d2l-ai/d2l-zh 讲解 SGD 噪声；pytorch/pytorch 的 `DataLoader` 控制 batch 噪声。

## 八、面试题
问：为何大 batch 需同步调 lr？答：保持 lr/√B 噪声尺度，维持泛化。

## 九、演进与趋势
噪声调度、锐度感知最小化（SAM）延续该思路。

## 十、小结
梯度噪声是廉价正则，batch 与 lr 设计应尊重其尺度。
