# 潜在扩散与Stable Diffusion

> 对应 Rombach et al., *High-Resolution Image Synthesis with Latent Diffusion Models*, CVPR 2022。

## 一、背景与挑战

像素空间扩散计算昂贵；潜在扩散先在压缩的潜空间去噪，再解码回像素，大幅降成本。

## 二、核心原理

用自编码器（VAE）把图像压到低维潜空间，扩散在该空间运行；文本条件经 cross-attention 注入 U-Net。Stable Diffusion 即此架构的开放实现。

## 三、数学形式

潜空间扩散：

$$\mathcal L = \mathbb E_{t,z_0,\epsilon}\big\|\epsilon - \epsilon_\theta(z_t, t, \tau_\theta(y))\big\|^2,\quad z_0 = \mathcal E(x_0)$$

$\mathcal E$ 为编码器，$\tau_\theta$ 为文本编码。

## 四、代码实现

```python
z = vae.encode(x).latent * 0.18215
noise = torch.randn_like(z)
pred = unet(z + noise_scale*noise, t, text_emb)
```

## 五、与其他对比

- 与 文本条件扩散 共享条件机制，多一层 VAE。
- 与 DALL-E自回归生成 对照“扩散 vs 自回归”。

## 六、常见误区

- 忽视 VAE 缩放因子致潜空间尺度错。
- 以为潜空间无损；其实有压缩损失。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 为何用潜空间？答：降维使扩散在更小分辨率运行，显存/速度大幅优化。

## 九、演进

像素扩散 → 潜空间扩散 → 高效采样器（LCM等）。

## 十、小结

潜在扩散以 VAE 压缩前置，使高分辨率文生图在消费级硬件可行。
