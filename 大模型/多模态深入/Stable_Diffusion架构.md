# Stable Diffusion 架构

> 对应 Rombach et al.(Latent Diffusion, 2022)。

## 一、核心概念

Stable Diffusion 把扩散放在**潜空间(latent space)**而非像素空间，先用 VAE 把图像压到低维潜变量，再在潜空间扩散，大幅降算力。条件(文本)经 CLIP 文本编码器送入 U-Net 的交叉注意力控制生成。

```
文本 --CLIP Text Enc--> 条件
图像 --VAE Enc--> 潜变量 --U-Net去噪--> 潜变量 --VAE Dec--> 图像
```

## 二、关键要点

- VAE 编解码连接像素与潜空间。
- U-Net 的 cross-attention 注入文本条件。
- ControlNet 可加姿态/边缘等额外控制。

## 三、与开源书的对应

- Rombach et al., *High-Resolution Image Synthesis with Latent Diffusion Models*, 2022.

## 七、面试题

- 为何 SD 在潜空间而非像素空间扩散？
- U-Net 中的交叉注意力如何接收文本条件？
