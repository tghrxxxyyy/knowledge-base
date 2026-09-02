# CLIP 对比学习

> 对应 Radford et al., *CLIP*, 2021。

## 一、核心概念

CLIP(Contrastive Language-Image Pre-training) 用 4 亿图文对，通过**对比学习**训练图像编码器与文本编码器，使匹配图文对嵌入相近、不匹配的远离。预训练后可用自然语言零样本分类。

## 二、数学形式

对 batch 内 `N` 个图文对，构造 `N×N` 相似度矩阵，目标是对角线(正样本)得分高、其余低（对称的 InfoNCE）：

```
L = (1/2N) Σ_i [ -log exp(s_i,i/τ)/Σ_j exp(s_i,j/τ)
                  -log exp(s_i,i/τ)/Σ_j exp(s_j,i/τ) ]
```

`τ` 为温度。

## 三、关键要点

- 零样本：把类别名拼成 prompt，选相似度最高的类。
- 文本编码器即现成「分类器生成器」。

## 四、与开源书的对应

- Radford et al., *Learning Transferable Visual Models From Natural Language Supervision*, 2021.

## 七、面试题

- CLIP 如何实现零样本分类？
- 温度 τ 的作用？
