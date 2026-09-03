# CLIP图像塔与对比对齐

> 对应 Radford et al. 2021 「Learning Transferable Visual Models From Natural Language Supervision」(CLIP)。

## 一、背景与挑战

传统视觉模型依赖固定类别标签，难以泛化到开放词汇。CLIP 提出用自然语言监督替代人工标注：图文对海量采集，训练图像塔与文本塔将二者映射到同一嵌入空间，实现 zero-shot 分类与跨模态检索。挑战在于对比目标设计、batch 规模与负样本效率。

## 二、核心原理

图像塔采用 ViT 或 ResNet 提取图像表征，文本塔采用 Transformer 提取文本表征。两塔分别投影到共享维度的嵌入空间，通过对比损失拉近正图文对、推远负对。推理时把类别名构造成 prompt 集合，计算图像与各文本嵌入相似度完成 zero-shot 预测。

## 三、数学形式

对 batch 内 N 对图文，相似度 s_{i,j}=\langle z_i^I, z_j^T\rangle/\tau，温度 \tau 可学习。对称 InfoNCE 损失：
L = \frac{1}{2N}\sum_{i=1}^N \left[ -\log\frac{e^{s_{i,i}}}{\sum_j e^{s_{i,j}}} -\log\frac{e^{s_{i,i}}}{\sum_j e^{s_{j,i}}} \right]
其中分子为正对，分母为 batch 内所有负对加正对。

## 四、代码实现

```python
import torch.nn.functional as F

def clip_loss(z_img, z_txt, tau=0.07):
    z_img = F.normalize(z_img); z_txt = F.normalize(z_txt)
    logits = z_img @ z_txt.t() / tau          # [N, N]
    labels = torch.arange(len(z_img), device=z_img.device)
    return (F.cross_entropy(logits, labels) +
            F.cross_entropy(logits.t(), labels)) / 2
```

## 五、与其他对比

相比纯视觉自监督（MoCo），CLIP 用语言提供语义监督；相比 SigLIP 的 sigmoid 损失，CLIP 依赖 batch 内负样本、batch 越大越好；相比 ALIGN，CLIP 语法更干净。其表征线性可分性高，是许多 MLLM 初始化来源。

## 六、常见误区

以为 CLIP 能理解细粒度组合关系，实则对属性绑定较弱；以为 zero-shot 不需 prompt 工程，实则模板与集成影响巨大；忽略 image tower 输出需经 project 才能与文本对齐；误用余弦相似度时忘记归一化。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：CLIP 的 zero-shot 原理？答：图像嵌入与用类别名构造的文本嵌入算相似度，取最大者。
- Q：温度 \tau 作用？答：缩放 logits，控制分布锐度，通常设为可学习参数。
- Q：batch 大小为何重要？答：负样本越多，对比估计越准，表征越好。

## 九、演进

OpenCLIP 开源复现与放大；CLIPA 提数据-计算分配；EVA、SigLIP 改进目标与数据；CLIP 图像塔被广泛用作 LLaVA 等 MLLM 的冻结/微调视觉编码器。

## 十、小结

CLIP 用自然语言作为可扩展监督信号，建立了图文统一嵌入空间，奠定了多模态对齐的方法论基础，其图像塔成为视觉语言模型的通用视觉骨干。
