# ControlNet可控生成

> 对应 Zhang et al. 2023 「Adding Conditional Control to Text-to-Image Diffusion Models」(ControlNet)。

## 一、背景与挑战

文本难以精确控制构图、姿态、边缘。ControlNet 在预训练扩散模型上添加可训练副本分支，以边缘/姿态/深度等条件图引导生成，同时保持原模型质量。挑战是零卷积设计与训练稳定性。

## 二、核心原理

ControlNet 复制 U-Net 编码器为可训练分支（trainable copy）与锁定原分支（locked copy），用零卷积（zero convolution）连接，初值为零保证训练起点不变。条件图编码后与主干特征加和，实现空间精确控制。

## 三、数学形式

零卷积：\mathcal{Z}(x)=W x，初始 W=0,b=0，故训练初输出为 0，不破坏原模型。控制分支输出 c=\mathcal{Z}_2(\Phi(\mathcal{Z}_1(c_{map}); \theta_c))，加到主 U-Net 对应层：
h = h_{base} + c
其中 \theta_c 为可训练副本参数。

## 四、代码实现

```python
import torch.nn as nn

class ZeroConv(nn.Module):
    def __init__(self, dim):
        super().__init__()
        self.conv = nn.Conv2d(dim, dim, 1)
        nn.init.zeros_(self.conv.weight)
        nn.init.zeros_(self.conv.bias)
    def forward(self, x):
        return self.conv(x)
```

## 五、与其他对比

相比 CFG 仅文本引导，ControlNet 提供空间结构控制；相比 T2I-Adapter 更重但更强；可多 ControlNet 叠加（姿态+深度）。训练数据只需条件图（可合成）。

## 六、常见误区

以为需重训整个模型，实则锁主干；忽略零卷积初始化致崩；混淆条件图分辨率；多控制权重需调。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Q：ControlNet 关键？答：锁主干 + 可训练副本 + 零卷积。
- Q：零卷积作用？答：初值零，训练起点不破坏原模型。
- Q：多条件？答：可叠加多个 ControlNet。

## 九、演进

从单控制到多控制；轻量版 ControlNet-Lite；与 LoRA 组合；视频 ControlNet 扩展。

## 十、小结

ControlNet 以优雅的零卷积设计把空间条件控制引入扩散模型，是可控生成工程化的里程碑。
