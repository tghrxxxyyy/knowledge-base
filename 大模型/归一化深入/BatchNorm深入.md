# BatchNorm 深入

> 对应 Ioffe & Szegedy 2015 *Batch Normalization*；实践参见《动手学深度学习》(d2l-zh) 批量归一化章节。

## 一、背景与挑战

深层网络训练时，前层参数更新会改变后层输入分布，导致后层需不断适应，这种现象称为**内部协变量偏移（Internal Covariate Shift, ICS）**。它使训练变慢、对学习率敏感、易陷入饱和区。BatchNorm（BN）的提出初衷即缓解 ICS：对每个小批量（mini-batch）的特征做归一化，把各特征拉回均值 0、方差 1 的稳定分布，从而允许更大学习率、加速收敛。

## 二、核心原理

对一个 mini-batch 中某特征通道，计算批量均值 $\mu_B$ 与方差 $\sigma_B^2$，做标准化后再用可学习缩放 $\gamma$ 与平移 $\beta$ 恢复表达能力：

$$\hat{x}_i = \frac{x_i - \mu_B}{\sqrt{\sigma_B^2 + \epsilon}}, \qquad y_i = \gamma \hat{x}_i + \beta$$

**训练阶段**用当前 batch 统计；**推理阶段**没有 batch 概念，改用训练时累积的滑动平均全局均值/方差（running mean/var）。$\gamma,\beta$ 通过反向传播学习，保证 BN 不降低模型容量。

## 三、形式化与数学基础

对 batch $B=\{x_1,\dots,x_m\}$，统计量：

$$\mu_B = \frac{1}{m}\sum_{i=1}^m x_i, \qquad \sigma_B^2 = \frac{1}{m}\sum_{i=1}^m (x_i-\mu_B)^2$$

推理时，$\mu_{\mathrm{run}} \leftarrow (1-\alpha)\mu_{\mathrm{run}} + \alpha\mu_B$ 滚动更新；最终使用 $\mu_{\mathrm{run}},\sigma_{\mathrm{run}}^2$。反向传播中，BN 的梯度需同时对 $x_i$、$\gamma$、$\beta$ 求导，并跨 batch 内样本耦合，是归一化层中最复杂的梯度流之一。

## 四、代码实现

PyTorch 中可直接使用：

```python
import torch.nn as nn

bn = nn.BatchNorm2d(num_features=64, momentum=0.1, eps=1e-5)
x = torch.randn(16, 64, 32, 32)      # (N, C, H, W)
out = bn(x)

# 推理模式切换
bn.eval()
with torch.no_grad():
    out_val = bn(x)
```

注意 `momentum` 控制滑动平均更新速度；`track_running_stats=True` 时自动维护全局统计。

## 五、与其他技术对比

| 方法 | 归一化维度 | 依赖 batch | 典型场景 |
|------|------------|------------|----------|
| BatchNorm | 跨 batch 同通道 | 是 | CNN（大 batch） |
| LayerNorm | 单样本全特征 | 否 | Transformer/RNN |
| GroupNorm | 通道分组 | 否 | 小 batch 检测 |
| InstanceNorm | 单样本单通道 | 否 | 风格迁移 |

BN 在 batch 足够大时效果最佳；batch 过小时统计噪声大，应改用 LN/GN。

## 六、常见误区

- 误区一：BN 消除 ICS 是定论。后续研究（如 Santurkar 2018）指出 BN 主要作用是平滑损失-landscape、提升训练稳定性，ICS 解释存争议。
- 误区二：训练和推理用同一统计。推理必须用滑动平均全局统计，否则部署结果漂移。
- 误区三：小 batch 也硬用 BN。batch=1~2 时 BN 几乎失效。

## 七、与开源书·权威来源对应

- Ioffe & Szegedy, *Batch Normalization: Accelerating Deep Network Training*, 2015.
- d2l-zh 批量归一化：https://zh.d2l.ai/chapter_convolutional-modern/batch-norm.html
- Santurkar et al., *How Does Batch Normalization Help Optimization?*, 2018.

## 八、面试题

- BN 推理为何用滑动平均全局统计而非 batch 统计？如果不这样会怎样？
- BN 在小 batch 下为何不稳定？有哪些替代方案？
- 关于 BN 缓解 ICS 的说法，学界后来有什么修正性认识？

## 九、演进与趋势

(1) 卷积网络时代 BN 是标配，但 Transformer 弃用 BN 转向 LN。(2) 演化出 BN 的变体（如 Batch Renormalization 处理 batch 偏移）。(3) 在超大 batch 分布式训练下，同步 BN（SyncBN）跨卡聚合统计。(4) 现代大模型几乎不用 BN，但在视觉骨干、检测头中仍常见。

## 十、小结

BatchNorm 通过对 mini-batch 特征归一化，显著加速 CNN 训练、放宽学习率限制，是深度学习工程化的重要基石。其本质是稳定每层输入分布（不论归因为 ICS 还是损失景观平滑）。但 BN 依赖 batch 统计，在小 batch 与序列场景被 LayerNorm/GroupNorm 取代，理解其训练/推理差异是部署正确性的关键。
