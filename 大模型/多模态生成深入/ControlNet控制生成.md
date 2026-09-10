# ControlNet 控制生成

> 对应 Zhang et al. (2023) Adding Conditional Control to Text-to-Image Diffusion Models (ControlNet)；亦见 Stable Diffusion 架构。

## 一、背景与挑战

文生图扩散模型（如 Stable Diffusion）用文本提示控制生成，但自然语言难以精确约束构图、姿态、边缘、深度等空间结构——写「一个人抬起左手」远不如直接给一张姿态骨架图来得准。如何在保留预训练生成能力的同时，注入像素级空间条件，是可控生成的核心难题。

朴素做法是在输入直接拼接条件图，但会破坏原模型已学的语义，且需从头训练、显存昂贵。ControlNet 给出了「锁定主干、训练旁支」的优雅解。

## 二、核心原理

ControlNet 把预训练 U-Net 的编码器（含中间层）复制出一个**可训练副本**与一个**锁定副本**：

1. **锁定副本（Locked Encoder）**：参数冻结，保留预训练知识，防止灾难性遗忘。
2. **可训练副本（Trainable Encoder）**：接收额外条件图（canny、openpose、depth、hed 等），学习把空间约束编码进特征。
3. **零卷积桥接（Zero Convolution）**：用权重初始化为零的 $1\times1$ 卷积连接两分支，训练初期零输出保证不干扰主干，随训练逐步注入控制信号。

最终 U-Net 解码器融合主干与时间步特征与 ControlNet 分支特征，实现「文本+条件」双控。

## 三、形式化与数学基础

设锁定编码输出为 $c^L$，可训练分支输出为 $c^T$，零卷积参数为 $W_z$（初始为 0）。注入到 U-Net 第 $i$ 层的特征：

$$
F_i = F_i^{base} + \mathcal{Z}_i(c_i^T)
$$

其中 $\mathcal{Z}_i$ 为第 $i$ 层零卷积。因初始化 $W_z=0$，训练初刻：

$$
\mathcal{Z}_i(c_i^T) = W_z * c_i^T = 0
$$

故初始与原模型行为一致，梯度稳定；随 $W_z$ 学出非零值，控制信号逐步生效。

## 四、代码实现

零卷积桥接的精简示意：

```python
class ZeroConv(nn.Module):
    def __init__(self, c):
        super().__init__()
        self.conv = nn.Conv2d(c, c, 1)   # 1x1 卷积
        nn.init.zeros_(self.conv.weight)  # 权重初始化为零
        nn.init.zeros_(self.conv.bias)

def control_step(unet, ctrl, cond, x, t):
    base = unet(x, t)
    c_feat = ctrl(x, t, cond)            # 可训练分支
    return base + ctrl.zero_conv(c_feat) # 零卷积注入
```

多 ControlNet 可并行取多个条件并加权求和。

## 五、与其他技术对比

| 方法 | 是否锁主干 | 条件类型 | 显存 | 代表 |
|------|------------|----------|------|------|
| 直接拼接条件 | 否 | 任意 | 高 | 早期尝试 |
| ControlNet | 是 | 空间图 | 中 | SD 控制生成 |
| T2I-Adapter | 是 | 轻量 | 低 | 轻量控制 |
| IP-Adapter | 是 | 参考图 | 低 | 风格参考 |

## 六、常见误区

- **「必须全参数训练」**：锁定主干既保知识又省显存，全训反而易遗忘。
- **「零卷积多余」**：零初始化是训练稳定关键，跳过会导致初期扰动崩溃。
- **「一个 ControlNet 控一切」**：不同条件需各自分支，多条件应并行叠加。
- **混淆 ControlNet 与 LoRA**：前者控结构、后者调风格，可叠加使用。

## 七、与开源书·权威来源对应

- Zhang et al., *Adding Conditional Control to Text-to-Image Diffusion Models*, 2023（ControlNet 原论文）。
- HuggingFace Diffusers 提供 `ControlNetModel` 与多种预训练条件模型。
- 亦见本知识库「LoRA 在多模态微调」了解风格控制互补。

## 八、面试题

1. ControlNet 为何要锁定原 U-Net 只训控制分支？
2. 零卷积（Zero Convolution）的作用与初始化为何关键？
3. ControlNet 与 T2I-Adapter、IP-Adapter 的核心区别？
4. 多 ControlNet 如何同时施加多种条件？

## 九、演进与趋势

ControlNet 催生了庞大的条件生态（openpose、depth、canny、seg、scribble 等）。后续出现轻量化的 T2I-Adapter、解耦的 IP-Adapter，以及 ControlNet++ 等增强多条件一致性。趋势是「即插即用」的模块化控制器与视频/3D 扩散的控制扩展。

## 十、小结

ControlNet 用「锁定主干+可训练旁支+零卷积桥接」实现像素级可控生成，兼顾保真与省显存。它是文本到图像精确构图控制的事实标准，与 LoRA 等风格适配器互补。
