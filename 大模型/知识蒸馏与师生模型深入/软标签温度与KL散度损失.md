# 软标签温度与KL散度损失

> 对应 Hinton 2015 的温度蒸馏损失与 pytorch/pytorch 实现。

## 一、背景与挑战

直接用原始 logits 算 KL，教师尖锐分布几乎等价于硬标签，蒸馏失效。温度 T 把分布"摊平"，释放出暗知识。

## 二、核心原理

温度 T 同时作用于教师与学生 softmax，使小 logit 差距被放大成概率差异，学生能学到"哪些类相近"。梯度在 T 下被缩放 T^2 倍，故损失乘回 T^2 保持量级。

## 三、形式化与数学基础

$ \\nabla_{z_s}\\mathcal L_{KD}\\approx \\frac1T\\mathbb E[(z_s-z_t)] $ 当 $ T $ 较大时近似线性，乘 $ T^2 $ 抵消尺度：

$ \\mathcal L_{KD}=T^2\\text{KL}\\big(\\sigma(z_t/T)\\|\\sigma(z_s/T)\\big) $

## 四、代码实现

```python
import torch.nn.functional as F

def distillation(student, teacher, T=4.0, alpha=0.5, labels=None):
    t = teacher.detach()
    kd = F.kl_div(
        F.log_softmax(student / T, dim=-1),
        F.softmax(t / T, dim=-1),
        reduction="batchmean",
    ) * T * T
    ce = F.cross_entropy(student, labels) if labels is not None else 0
    return alpha * kd + (1 - alpha) * ce
```

## 五、与其他技术对比

- 仅 CE 训练缺少类间结构；仅 KD 缺真实监督，常组合。
- DPO/RLHF 中也有类似分布匹配思想。

## 六、常见误区

- 忘记乘 T^2，导致学生梯度过小学不动。
- 教师未 detach，反向传播污染教师。

## 七、与开源书/权威来源对应

- Hinton et al. 2015, Distilling.
- huggingface/trl: https://github.com/huggingface/trl
- pytorch/pytorch: https://github.com/pytorch/pytorch

## 八、面试题

- 为什么损失要乘 T^2？
- 教师输出为什么要 detach？
- 温度过大过小分别怎样？

## 九、演进与趋势

自适应温度、按层不同温度逐步精馏在 LLM 蒸馏中被采用。

## 十、小结

温度与 T^2 缩放是蒸馏损失的核心技巧，正确实现才能让学生学到软知识。
