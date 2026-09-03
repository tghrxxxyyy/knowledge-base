# 潜空间扩散LatentDiffusion

> 对应 Rombach et al. 2022 「High-Resolution Image Synthesis with Latent Diffusion Models」(LDM/Stable Diffusion)。

## 一、背景与挑战

像素空间扩散计算昂贵、难做高分辨率。LDM 把扩散搬到压缩潜空间，大幅降算力且保持质量。挑战是自编码器压缩损失与潜空间语义一致性。

## 二、核心原理

先用 VAE 把图像编码到低维潜空间 z=\mathcal{E}(x)，在 z 上做扩散去噪，最后解码回像素 \hat{x}=\mathcal{D}(z_0)。文本条件经 cross-attention 注入 U-Net。潜空间维度远小于像素，使高分辨率生成可行。

## 三、数学形式

编码 z_0=\mathcal{E}(x)，前向加噪 q(z_t|z_{t-1})=\mathcal{N}(\sqrt{1-\beta_t}z_{t-1},\beta_t I)。训练目标：
L = \mathbb{E}_{z_0,\epsilon,t}\left[\|\epsilon-\epsilon_\theta(z_t,t,c)\|^2\right]
条件 c 经 cross-attn：\mathrm{Attention}(Q,K_c,V_c)。

## 四、代码实现

```python
import torch

def ldm_loss(model, z, t, cond, eps=None):
    eps = torch.randn_like(z) if eps is None else eps
    zt = sqrt_alphas[t]*z + sqrt_one_minus[t]*eps
    pred = model(zt, t, cond)
    return ((pred - eps)**2).mean()
```

## 五、与其他对比

相比 DDPM 像素扩散，LDM 省算力且支持高分辨率；相比 GAN，训练更稳、多样；VAE 压缩是质量关键，压缩比过大损细节。

## 六、常见误区

以为潜空间无损，实则 VAE 有损；忽略 tokenizer 与分辨率耦合；混淆 U-Net 与 VAE 角色；直接调像素参数无效。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Q：LDM 为何高效？答：扩散在压缩潜空间，降维度算力。
- Q：VAE 作用？答：图像<->潜空间编解码。
- Q：条件如何注入？答：cross-attention 注入文本。

## 九、演进

从 LDM 到 SDXL、SD3；潜空间视频/3D 扩散；与 DiT 架构结合。

## 十、小结

潜空间扩散通过 VAE 压缩把扩散生成推向高分辨率实用化，是 Stable Diffusion 系列的方法论基石。
