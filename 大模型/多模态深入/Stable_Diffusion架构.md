# Stable Diffusion 架构

> 对应 Rombach et al., *High-Resolution Image Synthesis with Latent Diffusion Models*, CVPR 2022（Latent Diffusion / LDM）；CompVis/stable-diffusion 与 Stability AI 发布的 SD 1.5 / SDXL 权重；Rombach *High-Resolution Image Synthesis with Latent Diffusion Models* 教程与 Diffusers 库 `StableDiffusionPipeline` 实现；与「多模态深入/扩散模型基础」「CLIP对比学习」互为前置。

## 一、背景与挑战

像素空间扩散（如原始 DDPM）在 $512\times512\times3$ 上每步都要对整幅图去噪，算力与显存开销大，训练往往需要多卡数周。**核心矛盾**：扩散模型需要大量去噪步数 $\times$ 每步都处理全分辨率张量，而人类语义其实集中在低维流形上——天空的渐变、皮肤的纹理在压缩后几乎不损失生成质量。

Stable Diffusion（LDM）的回答是三件事：

1. **把扩散搬到潜空间**：用 VAE/自编码器把图像压到 $\frac{H}{f}\times\frac{W}{f}\times C$（SD 常见 $f=8, C=4$），在潜变量 $z$ 上做扩散，像素空间只做一次编解码。
2. **条件注入而非拼接**：文本经 CLIP Text Encoder 得到 token embedding，通过 U-Net 的 **cross-attention** 注入，不破坏图像分支的卷积结构。
3. **交叉注意力作为通用接口**：同一接口可注入文本、图像（IP-Adapter）、姿态（ControlNet）、语义分割等多条件，催生整个可控生成生态。

训练与推理成本因此下降到「单卡可玩、消费级显卡可出图」，这是 SD 相对 DALL·E 闭源路线开源爆红的工程原因。

## 二、核心原理

### 2.1 组件链路

```text
训练：
  x --VAE Encode--> z0 --加噪--> zt --U-Net(zt, t, c_text)--> eps_hat
  loss = MSE(eps_hat, eps)   # 或 v-prediction / flow 目标

推理：
  z_T ~ N(0,I) --迭代去噪 t=T..1--> z0 --VAE Decode--> x_hat
  条件 c_text = CLIP(text)  （每步都参与 cross-attn）
```

- **VAE（KL/感知）**：压缩率 $8\times8\times4=256$，负责「把像素搬进/搬出潜空间」。SD 的 VAE 若损坏或选错（SDXL 与 SD1.5 VAE 不通用），会出现色块、噪点、颜色漂移。
- **U-Net**：编码-解码 + skip connection 的去噪主干；注入 **时间步 embedding**（sinusoidal → MLP，加到 ResBlock）与 **文本 cross-attn**。
- **CLIP Text Encoder**：SD1.5 用 OpenCLIP ViT-L/14 的 text tower（77 token 上下文）；SDXL 额外并联 OpenCLIP ViT-bigG，两路拼接后进 U-Net。
- **噪声调度**：DDPM 的 $\bar\alpha_t$ 或 v-prediction；推理用 DDIM / DPM-Solver++ 把 1000 步压到 20～50 步。

### 2.2 Cross-Attention 注入

U-Net 中每个注意力块把空间特征展平为序列 $z\in\mathbb{R}^{hw\times d}$，与文本 $c\in\mathbb{R}^{L\times d}$ 做标准注意力：

$$ \text{Attn}(Q,W_z,K=W_c c,V=W_c c)=\text{softmax}\!\left(\frac{Q (W_c c)^\top}{\sqrt{d}}\right) W_c c $$

图像 query 关注文本 key，实现「空间位置读哪句提示词」。CFG（classifier-free guidance）训练时随机丢弃文本条件（$p\approx 0.1$ 置空），推理时

$$ \hat{\epsilon}=\epsilon_\theta(z_t,\emptyset)+s\cdot\big(\epsilon_\theta(z_t,c)-\epsilon_\theta(z_t,\emptyset)\big) $$

$s$ 常用 7～12：越大越贴提示词，过大则过饱和、构图崩坏。

### 2.3 SDXL 与版本差异

| 维度 | SD 1.5 | SDXL | SD3 / Flow 系 |
| --- | --- | --- | --- |
| 基座分辨率 | 512 | 1024（原生） | 多分辨率 |
| VAE 通道 | 4 | 4（更大） | 16（更大潜空间） |
| 文本编码器 | CLIP-L | CLIP-L + OpenCLIP-bigG + 可选 T5 | T5 + CLIP 等 |
| U-Net 规模 | ~860M | ~2.6B | DiT（MM-DiT） |
| 预测目标 | eps | eps/v 混合 | Flow matching |

SD 1.5 生态（ControlNet、LoRA、采样器）最丰富；SDXL 质量与构图更好但显存更高；SD3/Flux 系转向 **DiT + flow matching**，代表下一阶段架构。

## 三、形式化与数学基础

潜空间前向扩散（方差保持）：

$$ q(z_t\mid z_0)=\mathcal{N}\big(z_t;\sqrt{\bar\alpha_t}z_0,(1-\bar\alpha_t)I\big) $$

训练目标（eps 预测）：

$$ \mathcal{L}=\mathbb{E}_{z_0,\epsilon,t,c}\Big[\big\|\epsilon-\epsilon_\theta(z_t,t,c)\big\|_2^2\Big] $$

VAE 同时优化重构与 KL：

$$ \mathcal{L}_{\text{VAE}}=\|x-\hat x\|_1+\beta\,D_{KL}\big(q(z\mid x)\,\|\,p(z)\big) $$

潜空间维度账：$512\times512\times3$ 像素 $\to$ $64\times64\times4$ 潜变量，空间计算量约降 $f^2=64$ 倍——这就是「扩散在 latent 上做」的定量收益。

DDIM 确定性更新（无随机性时）：

$$ z_{t-1}=\sqrt{\bar\alpha_{t-1}}\,\hat{z}_0+\sqrt{1-\bar\alpha_{t-1}}\;\frac{z_t-\sqrt{\bar\alpha_t}\,\hat{z}_0}{\sqrt{1-\bar\alpha_t}} $$

## 四、代码实现

```python
# Diffusers：SD1.5 文生图 + CFG（示意）
import torch
from diffusers import StableDiffusionPipeline, DPMSolverMultistepScheduler

pipe = StableDiffusionPipeline.from_pretrained(
    "runwayml/stable-diffusion-v1-5",
    torch_dtype=torch.float16,
    safety_checker=None,          # 研究环境可关，产品需自建审核
).to("cuda")

pipe.scheduler = DPMSolverMultistepScheduler.from_config(
    pipe.scheduler.config, use_karras_sigmas=True
)

prompt = "a red panda reading a book, forest library, detailed"
image = pipe(
    prompt,
    negative_prompt="blurry, low quality, extra fingers",
    num_inference_steps=28,
    guidance_scale=7.5,
    height=512, width=512,
).images[0]
```

```python
# 理解 U-Net 条件输入：t 与 text 同时进
# eps = unet(sample=zt, timestep=t, encoder_hidden_states=clipped_ids).sample
# CFG 推理伪代码：
#   e_u = unet(z, t, null_cond); e_c = unet(z, t, text_cond)
#   e = e_u + s * (e_c - e_u)
```

常见排障：VAE 下采样过猛导致颜色块 → 换兼容 VAE；中文提示词不生效 → CLIP 英文为主，需中文双塔或先译英文；出图糊 → 检查 steps、CFG、是否误用 x0 预测调度。

## 五、与其他技术对比

| 维度 | 像素扩散 (DDPM) | Latent Diffusion (SD) | GAN | Flow Matching / DiT |
| --- | --- | --- | --- | --- |
| 训练稳定性 | 好 | 好 | 模式崩塌风险 | 好 |
| 计算量 | 高 | **低（潜空间）** | 中 | 中高（随 DiT） |
| 模式覆盖 | 好 | 好 | 差 | 好 |
| 可控性 | 弱 | **cross-attn + ControlNet 强** | 弱 | 结构化条件灵活 |
| 推理步数 | 25～1000 | 20～50（蒸馏可 1～4） | 1 | 1～20（rectified flow） |

与 **Imagen / DALL·E 2**：同样用扩散，但条件多在像素或级联超分，且闭源；SD 选择「开源权重 + latent + CLIP 条件」形成社区生态。与 **GPT/ViT 自回归生成图像**：路线不同，当前出图质量与效率上扩散仍占优。

## 六、常见误区

1. **SD 在像素上去噪**——错，主去噪在 latent；像素只经 VAE 编解码（除部分超高分方案）。
2. **CLIP 只参与训练**——错，每一步推理都要 text embedding 做 cross-attn。
3. **CFG 越大越好**——过大导致过饱和与肢体错误；需与 steps、negative prompt 联调。
4. **VAE 可以随便换**——通道数、归一化、训练分布不同会直接花屏，跨版本 VAE 必须匹配。
5. **seed 固定就完全复现**——还会受 GPU、kernel、采样器版本、VAE 实现影响；精确复现需固定全套数值栈。
6. **ControlNet 是换模型**——它是旁路可训练副本，注入 U-Net encoder 特征，底模可共享。

## 七、与开源书·权威来源对应

- Rombach et al., CVPR 2022（LDM 原论文）。
- Ho et al., *Denoising Diffusion Probabilistic Models* (DDPM)；Song et al. DDIM。
- Dhariwal & Nichol, *Diffusion Models Beat GANs*（分类器引导；后演进 CFG）。
- Stable Diffusion / SDXL 官方模型卡与 Diffusers 文档。
- Hugging Face Diffusers 教程、CompVis 教程 slides。
- 李宏毅生成式 AI 课程中扩散模型与 ControlNet 讲解。

## 八、面试题

**1. 为何 SD 在潜空间而非像素空间扩散？**  
要点：latent 维度约为像素的 $1/f^2$（$f=8$ 时空间计算降约 64 倍），语义低维流形上生成损失小；训练与单步去噪成本大幅下降，消费级 GPU 可用。

**2. U-Net 中的交叉注意力如何接收文本条件？**  
要点：空间特征作 query，CLIP 文本 embedding 作 key/value；每个空间位置按注意力权重「读」提示词，与时间步 ResBlock 并联进入去噪主干。

**3. CFG 是什么，训练时为何要丢弃条件？**  
要点：训练时以一定概率把条件置空，得到有条件/无条件两个预测；推理按 $s$ 做外推放大条件方向，$s$ 控制贴合度与质量的折中。

**4. VAE 坏了会怎样？**  
要点：解码色块、噪点、整体偏色；SD1.5/SDXL VAE 不通用，需按基座选择。

**5. SD 与 GAN 生成图像的本质差别？**  
要点：扩散/流模型逐步去噪、目标函数简单稳定、模式覆盖好；GAN 单步但训练易模式崩塌、可控性弱；扩散在开放域生成上已成为主流。

## 九、演进与趋势

- **更快采样**：DPM-Solver、LCM、Turbos、一致性蒸馏 → 1～4 步出图。
- **更强条件**：ControlNet 全家桶、IP-Adapter、区域提示词、T5 长文本。
- **架构换代**：SD3 / Flux 用 **MM-DiT + flow matching**，把文本与图像 token 放进同一 Transformer 交替注意力，弱化「U-Net 只当去噪器」的旧分工。
- **视频与多模态**：SVD、Wan、Sora 类模型把时间轴引入扩散/流；与 LLM 打通的统一 token 模型在快速迭代。
- **端侧与蒸馏**：一步/少步模型 + 小 U-Net，让手机与笔记本可本地生成。

## 十、小结

Stable Diffusion = **潜空间扩散 × CLIP 条件 × U-Net 交叉注意力**。它不是单一算法突破，而是「压缩感知 + 注意力条件注入 + 开源权重」的系统组合。理解时抓住三本账：**latent 维度账（为何省）**、**cross-attn 条件账（为何可控）**、**CFG 引导账（为何贴提示词）**。读代码以 Diffusers 的 `StableDiffusionPipeline` 为主线，对照原论文图 1 与 U-Net forward，即可把训练目标、采样器与工程模块对齐。
