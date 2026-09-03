# ViT视觉编码器基础

> 对应 Dosovitskiy et al. 2020 「An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale」(ViT)。

## 一、背景与挑战

卷积网络长期主导视觉表征学习，其局部连接与权重共享带来强归纳偏置。ViT 首次证明：在大规模数据上，纯 Transformer 可超越 CNN 且无需手工设计的局部性。核心挑战有三点：一是缺少归纳偏置，小数据下易过拟合；二是位置信息需显式注入；三是计算随 token 数平方增长。

## 二、核心原理

将图像切分为 N 个不重叠 patch，每个 patch 经线性投影映射为 token，前置一个可学习的 [CLS] token 用于聚合全局信息，叠加可学习的一维位置嵌入后送入多层 Transformer encoder。最终取 [CLS] 输出作为整图表征，下游接 MLP 完成分类或对齐任务。

## 三、数学形式

输入划分为 patch 后投影并拼接位置嵌入：
z_0 = [x_{cls}; x_p^1 E; x_p^2 E; \dots; x_p^N E] + E_{pos}
其中 E \in \mathbb{R}^{(P^2 \cdot C) \times D} 为投影矩阵。第 l 层：
z_l' = \mathrm{MSA}(\mathrm{LN}(z_{l-1})) + z_{l-1}
z_l = \mathrm{MLP}(\mathrm{LN}(z_l')) + z_l'
注意力定义为 \mathrm{Attention}(Q,K,V)=\mathrm{softmax}(QK^\top/\sqrt{d_k})V，分类输出 y=\mathrm{LN}(z_L^0)。

## 四、代码实现

```python
import torch, torch.nn as nn

class PatchEmbed(nn.Module):
    def __init__(self, img=224, patch=16, dim=768):
        super().__init__()
        self.n = (img // patch) ** 2
        self.proj = nn.Conv2d(3, dim, patch, patch)
    def forward(self, x):
        x = self.proj(x)            # [B, dim, H/p, W/p]
        return x.flatten(2).transpose(1, 2)  # [B, N, dim]
```

## 五、与其他对比

相比 CNN，ViT 无局部感受野与平移不变性假设，靠数据学习；相比 CLIP 图像塔，ViT 仅是骨干，CLIP 在其上接对比目标训练；相比 MLP-Mixer，ViT 用自注意力建模全局依赖。DeiT 通过蒸馏缓解数据需求，DINOv2 用 ViT-g 做自监督。

## 六、常见误区

误以为 ViT 天然不需要数据，实则小数据集远逊 CNN；误以为 patch 越小越好，忽略计算量随 N 平方增长；混淆 [CLS] 聚合与平均池化；忽略位置嵌入在分辨率变化时的插值处理。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- Q：ViT 为何需要大量预训练数据？答：缺少 CNN 的归纳偏置，需从数据学习局部性与层次结构。
- Q：推理分辨率与训练不一致怎么办？答：对位置嵌入做双线性插值，并可能需微调。
- Q：[CLS] token 作用？答：聚合全局表征，类比 BERT 的句向量。

## 九、演进

DeiT 引入教师蒸馏；ViT-L/14 成为 CLIP、SigLIP 标准骨干；DINOv2 以 ViT-g/14 产出强自监督特征；结合register token 缓解伪特征。视觉编码器从分类骨干走向通用对齐底座。

## 十、小结

ViT 把图像建模为 token 序列，剥离了卷积归纳偏置，是后续几乎所有视觉语言模型视觉编码器的事实标准，其与语言侧的对齐质量直接决定多模态能力上限。
