# 自举损失Bootstrapping

> 对应 Reed et al. 2014 "Training Deep Neural Networks on Noisy Labels with Bootstrapping", ICLR 2015 workshop。

## 一、背景与挑战

标签噪声会误导难例学习。Bootstrapping 让模型“软目标”部分来自自身预测，降低对错误标注硬目标的过拟合。

## 二、核心原理

目标不是固定的 one-hot，而是真实标签与模型预测的混合：

$$
\tilde{y} = \beta\, y + (1-\beta)\, \hat{y}
$$

$\beta$ 控制对原始标签的信任度，模型预测提供正则。

## 三、数学形式

软目标交叉熵：

$$
\mathcal{L} = -\sum_k \tilde{y}_k \log p_\theta(x)_k
$$

Hard bootstrapping 则取 $\hat{y}=\arg\max p_\theta$ 的 one-hot，等价于对高置信预测自我标注。

## 四、代码实现

```python
import torch

def boot_loss(logits, targets, beta=0.8):
    probs = torch.softmax(logits, -1)
    soft = beta * targets + (1 - beta) * probs.detach()
    return torch.nn.functional.cross_entropy(logits, soft)
```

## 五、与其他对比

相比 OHEM 专注难例，Bootstrapping 专注标签噪声鲁棒性，二者可叠加。

## 六、常见误区

误区：$\beta$ 过小导致模型忽略真实标签跑偏。需根据噪声率设 $\beta$。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- Reed 2014：https://arxiv.org/abs/1412.6596

## 八、面试题

- Q：Bootstrapping 抗噪原理？答：用模型预测软化目标，降低硬错误标签权重。
- Q：$\beta$ 如何选？答：标签噪声越高，$\beta$ 越小。

## 九、演进

发展为标签平滑、置信样本选择与协同训练去噪。

## 十、小结

Bootstrapping 通过自举软目标提升噪声鲁棒性，是难例/噪声共存的实用策略。
