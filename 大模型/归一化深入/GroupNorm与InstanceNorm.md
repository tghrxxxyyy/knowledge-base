# GroupNorm 与 InstanceNorm

> 对应 Wu & He 2018 *Group Normalization*、Ulyanov et al. 2016 *Instance Normalization*；实践参见 d2l-zh 归一化章节。

## 一、背景与挑战

BatchNorm 依赖「跨样本的同通道 batch 统计」，当 batch size 很小（如目标检测、分割中常见 1–2）或分布式训练跨卡同步成本高时，batch 统计量噪声极大、训练不稳。GroupNorm（GN）与 InstanceNorm（IN）正是为**摆脱对 batch 的依赖**而生：它们在单样本内部做归一化，batch 大小对它们毫无影响。

## 二、核心原理

- **GroupNorm（GN）**：把通道 $C$ 分成 $G$ 组，在「单样本 + 组内所有通道 + 空间」上求均值方差归一化。统计量与 batch 无关，对小 batch 稳健。
- **InstanceNorm（IN）**：可视为 $G=C$ 的 GN 特例，即每个通道单独对单样本的空间维归一化。它最早在风格迁移中被发现能「抹去内容图像的对比度/风格统计」，从而利于风格化。

两者均保留可学习 $\gamma,\beta$，推理与训练使用相同（单样本）统计量，无需维护全局滑动平均。

## 三、形式化与数学基础

设特征图 $x\in\mathbb{R}^{C\times H\times W}$，GN 将通道分 $G$ 组，每组 $C/G$ 通道。对样本 $n$、组 $g$ 内元素集合 $\mathcal{S}_{n,g}$：

$$\mu_{n,g} = \frac{1}{|\mathcal{S}_{n,g}|}\sum_{i\in\mathcal{S}_{n,g}} x_i, \qquad \sigma_{n,g}^2 = \frac{1}{|\mathcal{S}_{n,g}|}\sum_{i\in\mathcal{S}_{n,g}}(x_i-\mu_{n,g})^2$$

$$\hat{x}_i = \frac{x_i-\mu_{n,g}}{\sqrt{\sigma_{n,g}^2+\epsilon}}, \qquad y_i = \gamma_i \hat{x}_i + \beta_i$$

IN 即 $G=C$（每组仅 1 通道）。可见三者统一于「归一化维度选择」：BN 跨 batch、LN 跨全部通道、GN 跨部分通道、IN 跨单通道。

## 四、代码实现

```python
import torch.nn as nn

# GroupNorm：num_groups 须能整除通道数
gn = nn.GroupNorm(num_groups=32, num_channels=256)
x = torch.randn(2, 256, 32, 32)
out_gn = gn(x)

# InstanceNorm（2D 图像）
in2d = nn.InstanceNorm2d(num_features=256, affine=True)
out_in = in2d(x)
```

GN 的 `num_groups` 常取 32；IN 在风格迁移中常 `affine=False` 以去除内容统计。

## 五、与其他技术对比

| 方法 | 归一化维度 | 依赖 batch | 典型场景 |
|------|------------|------------|----------|
| BatchNorm | 跨 batch 同通道 | 是 | 大 batch CNN |
| LayerNorm | 单样本全通道 | 否 | Transformer |
| GroupNorm | 单样本分组通道 | 否 | 小 batch 检测 |
| InstanceNorm | 单样本单通道 | 否 | 风格迁移 |

## 六、常见误区

- 误区一：GN 一定优于 BN。大 batch 下 BN 通常略优，GN 优势在小 batch。
- 误区二：IN 仅用于风格迁移。它也在某些生成/视频任务中做归一化。
- 误区三：分组数随意。分组需整除通道，且分组太少近似 LN、太多近似 IN，需按任务调。

## 七、与开源书·权威来源对应

- Wu & He, *Group Normalization*, ECCV 2018.
- Ulyanov et al., *Instance Normalization: The Missing Ingredient for Fast Stylization*, 2016.
- d2l-zh 归一化相关章节；Detectron2 / MMDetection 默认采用 GN。

## 八、面试题

- GN 为何不受 batch size 影响？它与 LN、IN 的数学关系是什么？
- 为何风格迁移常用 InstanceNorm？它起到了什么作用？
- 在目标检测等小 batch 场景，为什么 GN 比 BN 更稳？

## 九、演进与趋势

(1) GN 成为检测/分割骨干（ResNet+GN）在小 batch 下的默认选择。(2) 与 Weight Standardization、激活函数组合形成稳定训练配方。(3) 在 Transformer 视觉模型（ViT 类）中常与 LN 并用。(4) IN 在生成式图像/视频风格化中持续使用。归一化族已按「归一化维度」被统一理解。

## 十、小结

GroupNorm 与 InstanceNorm 通过把归一化移到「单样本内部」，彻底摆脱对 batch 统计的依赖，从而在小 batch 与风格化场景表现出色。它们与 BN、LN 共同构成一个连续谱——区别仅在「对哪些维度求均值/方差」。理解这一统一视角，便能按任务与 batch 大小合理选型。
