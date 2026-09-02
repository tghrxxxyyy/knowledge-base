# 优化器详解：SGD / Momentum / Adam

> 对应 d2l-zh 第11章「优化算法」。理解各优化器差异有助于大模型调参。

## 一、核心概念

| 优化器 | 公式要点 | 适用 |
|--------|----------|------|
| SGD | `θ -= ηg` | 凸、需精调 |
| Momentum | `v=γv+ηg; θ-=v` | 加速、抗陷 |
| RMSProp | `v=βv+(1-β)g²; θ-=ηg/√v` | 非平稳(RL) |
| Adam | 一+二阶矩 | 默认首选 |

## 二、关键差异

- **自适应学习率**：Adam/RMSProp 对每个参数缩放，稀疏特征更稳定。
- **偏差校正**：Adam 用 `m̂,v̂` 修正冷启动。
- **解耦衰减**：AdamW 把权重衰减从梯度中分离，正则更有效。

## 三、代码实现

```python
import torch.optim as optim
optim.SGD(model.parameters(), lr=0.1, momentum=0.9)
optim.AdamW(model.parameters(), lr=3e-4, weight_decay=0.01)
```

## 四、面试题

- 为什么大模型预训练偏好 AdamW？
- 偏差校正对 Adam 早期训练为何重要？
