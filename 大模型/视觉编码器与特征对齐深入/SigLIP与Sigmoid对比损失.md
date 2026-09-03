# SigLIP与Sigmoid对比损失

> 对应 Zhai et al. 2023 「Sigmoid Loss for Language Image Pre-training」(SigLIP)。

## 一、背景与挑战

CLIP 的 InfoNCE 依赖同 batch 内的负样本，batch 受限时负样本不足，且损失对 batch 大小敏感、需同步大量样本。SigLIP 提出用 pairwise sigmoid 损失替代 softmax 式对比损失，使每个图文对独立判断正负，解耦对 batch 规模的依赖，并在小 batch 下仍保持强性能。

## 二、核心原理

把图文对视为二分类问题：正对标签为 1，负对标签为 0。对 batch 中全部 N^2 个配对计算 sigmoid 二分类损失（含真实正对与构造负对），不再做 softmax 归一化。训练目标等价于让正对相似度高于某个边界、负对低于边界，优化更稳定且对 batch 不敏感。

## 三、数学形式

对相似度矩阵 S_{i,j}=\langle z_i^I,z_j^T\rangle，二值标签 y_{i,j}=1_{i=j}，sigmoid 损失：
L = -\sum_{i,j} \left[ y_{i,j}\log\sigma(S_{i,j}) + (1-y_{i,j})\log(1-\sigma(S_{i,j})) \right]
其中 \sigma 为 sigmoid。相比 CLIP 的归一化分母，此处无跨样本归一，可用全局负对与更高分辨率。

## 四、代码实现

```python
import torch, torch.nn.functional as F

def siglip_loss(z_img, z_txt):
    logits = z_img @ z_txt.t()                 # [N, N]
    labels = torch.eye(len(z_img), device=z_img.device)
    return F.binary_cross_entropy_with_logits(logits, labels)
```

## 五、与其他对比

相比 CLIP InfoNCE，SigLIP 不依赖 batch 内负样本归一化，单卡小 batch 即可训练；与 ALIGN 的 pairwise 思路类似但更简洁；常与 ViT 大骨干配合，在检索与 zero-shot 上略优于 CLIP，且下游 MLLM 接入更稳。

## 六、常见误区

误以为 sigmoid 损失无需负样本，实则 N^2 配对中隐含大量负对；忽略标签矩阵构造（除对角外全 0）；混淆 sigmoid 与 softmax 适用范围；以为学习率可照搬 CLIP 配置。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Q：SigLIP 相比 CLIP 的核心改进？答：用 sigmoid 二分类损失替代 InfoNCE，解耦 batch 规模依赖。
- Q：为何小 batch 更稳？答：损失不依赖跨样本 softmax 归一，负样本由矩阵内所有非对角对提供。
- Q：标签如何构造？答：对角为正、其余为负。

## 九、演进

SigLIP 扩展至 SigLIP 2（含定位与 OCR 数据）、多语言文本塔；作为视觉编码器用于 PaliGemma 等；与校正后的分辨率策略结合提升细粒度对齐。

## 十、小结

SigLIP 用简单且可扩展的 sigmoid 损失统一了正负对建模，降低对超大 batch 的依赖，已成为高质量视觉编码器的主流预训练目标之一。
