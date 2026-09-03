# AdamW

> 对应 Loshchilov & Hutter, *Decoupled Weight Decay Regularization*, ICLR 2019。

## 一、背景与挑战

标准 Adam 的 L2 权重衰减与自适应步长耦合，衰减效果随参数幅度不稳。

## 二、核心原理

AdamW 将权重衰减从损失中解耦，直接按固定系数乘性衰减参数，独立于自适应缩放。

## 三、数学形式

更新 $m_t,\ v_t$ 如 Adam；参数 $w_t\leftarrow w_{t-1}-\eta(\hat m_t/(\sqrt{\hat v_t}+\epsilon)+\lambda w_{t-1})$。

## 四、代码实现

```python
from torch.optim import AdamW
opt = AdamW(model.parameters(), lr=3e-4, weight_decay=0.01)
```

## 五、与其他对比

- 与 自适应学习率深入（Adam）相比仅衰减解耦。
- 与 权重衰减总览 是具体落地。

## 六、常见误区

- 照搬 SGD 的衰减系数到 AdamW 常过大。
- 对 bias/归一化层也衰减可能不利。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- AdamW 改了什么？答：把权重衰减从梯度中解耦，直接乘性衰减参数，使衰减强度稳定。

## 九、演进

Adam → AdamW → 分层/分群衰减。

## 十、小结

AdamW 是现代大模型训练默认优化器，解耦衰减是其关键。
