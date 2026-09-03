# 分类器引导与CFG

> 对应 Ho & Salimans 2022 「Classifier-Free Diffusion Guidance」(CFG) 及 Dhariwal & Nichol 2021 分类器引导。

## 一、背景与挑战

扩散模型无条件生成多样但难控。引导技术使生成朝文本/类别条件偏移，提升保真度。分类器引导需额外训练分类器且易 artifacts；CFG 免去分类器、更稳更强。

## 二、核心原理

CFG 在训练时以一定概率丢弃条件（无条件训练），推理时用条件与无条件预测之差放大条件影响：
\epsilon = \epsilon_{uncond} + w(\epsilon_{cond}-\epsilon_{uncond})
引导系数 w 控制保真-多样权衡，w 大更贴条件但可能降多样性、出饱和。

## 三、数学形式

预测噪声：
\hat{\epsilon} = \epsilon_\theta(x_t, \varnothing) + w\left(\epsilon_\theta(x_t, c) - \epsilon_\theta(x_t, \varnothing)\right)
采样更新：
x_{t-1} = \frac{1}{\sqrt{\alpha_t}}\left(x_t - \frac{1-\alpha_t}{\sqrt{1-\bar{\alpha}_t}}\hat{\epsilon}\right) + \sigma_t z

## 四、代码实现

```python
import torch

def cfg_predict(model, x, t, cond, uncond, w=7.5):
    e_c = model(x, t, cond)
    e_u = model(x, t, uncond)
    return e_u + w * (e_c - e_u)
```

## 五、与其他对比

相比分类器引导，CFG 免训分类器、无梯度反传、更稳；相比无引导，保真显著提升；w 是核心超参，过大致过饱和与模式塌缩。

## 六、常见误区

w 越大越好（实则过饱和）；忽略无条件下 dropout 训练；混淆引导与采样步数；多条件时各 w 需分别标定。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Q：CFG 原理？答：条件减无条件差值放大引导。
- Q：为何免分类器？答：训练时随机丢条件，推理估无条件。
- Q：w 影响？答：大保真高但多样降、易饱和。

## 九、演进

从分类器引导到 CFG；到多条件并行引导；到自适 w 与启示式调度。

## 十、小结

CFG 是扩散生成可控性的基石技术，以极简差值实现强条件控制，已成为文生图标配。
