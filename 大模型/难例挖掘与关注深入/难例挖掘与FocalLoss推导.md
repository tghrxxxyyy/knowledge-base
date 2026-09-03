# 难例挖掘与FocalLoss推导

> 对应 Lin et al. 2017 "Focal Loss for Dense Object Detection", ICCV 2017。

## 一、背景与挑战

训练中后期大量易样本损失趋零但梯度仍在累积，淹没少数难样本信号。Focal Loss 通过降权易样本，让模型聚焦难例。

## 二、核心原理

在交叉熵前乘调制因子 $(1-p_t)^\gamma$，使高置信度(易)样本损失被大幅压低，难样本($p_t$ 小)保持高权重。

## 三、数学形式

标准交叉熵：

$$
\mathrm{CE} = -\log p_t
$$

Focal Loss：

$$
\mathrm{FL} = -(1-p_t)^\gamma \log p_t
$$

加类别平衡 $\alpha_t$：

$$
\mathrm{FL} = -\alpha_t (1-p_t)^\gamma \log p_t
$$

$\gamma$ 增大更聚焦难例，$\gamma=0$ 退化为 CE。

## 四、代码实现

```python
import torch

def focal_loss(logits, targets, gamma=2.0, alpha=0.25):
    ce = torch.nn.functional.cross_entropy(logits, targets, reduction='none')
    pt = torch.exp(-ce)
    return (alpha * (1 - pt) ** gamma * ce).mean()
```

## 五、与其他对比

与普通难例挖掘(OHEM)相比，Focal Loss 是“软”加权，无需硬筛选样本，训练更平滑。

## 六、常见误区

误区：$\gamma$ 越大越好。过大会使梯度被极端难样本(含噪声)主导。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- Lin 2017：https://arxiv.org/abs/1708.02002

## 八、面试题

- Q：Focal Loss 怎么降权易样本？答：调制因子 $(1-p_t)^\gamma$ 随置信度升高趋零。
- Q：$\gamma$ 的作用？答：控制聚焦强度，越大越偏难例。

## 九、演进

从目标检测到类别不均衡分类，再到 LLM 训练中对难 token 的重加权变体。

## 十、小结

Focal Loss 用连续调制实现“关注难例”，是难例挖掘的软范式代表。
