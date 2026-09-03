# Adam优化器

> 对应 Kingma & Ba, *Adam: A Method for Stochastic Optimization*, ICLR 2015。

## 一、背景与挑战

需同时处理稀疏梯度与噪声梯度，结合动量与 RMS 归一。

## 二、核心原理

Adam 融合一阶动量（梯度的指数平均，提供方向惯性）与二阶矩（提供逐元素步长缩放），并做偏置校正。

## 三、数学形式

$m_t=\beta_1m_{t-1}+(1-\beta_1)g_t$，$v_t=\beta_2v_{t-1}+(1-\beta_2)g_t^2$；$\hat m,\hat v$ 校正后更新。

## 四、代码实现

```python
from torch.optim import Adam
opt = Adam(params, lr=3e-4, betas=(0.9,0.999), eps=1e-8)
```

## 五、与其他对比

- 与 RMSProp 多出动量项。
- 与 AdamW 的区别见权重衰减深入。

## 六、常见误区

- β2 在训练后期（小梯度方差）可调大（如 0.95）。
- 忽略 bias correction 在初期的影响。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Adam 为何用 bias correction？答：指数平均初期偏零，校正使早期估计无偏，稳定起步。

## 九、演进

RMSProp+动量 → Adam → AMSGrad/LAMB。

## 十、小结

Adam 融合动量与 RMS，是深度与大模型默认优化器。
