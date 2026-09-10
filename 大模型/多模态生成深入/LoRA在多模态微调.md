# LoRA 在多模态微调

> 对应 Hu et al. (2021) LoRA: Low-Rank Adaptation of Large Language Models；此处聚焦在扩散模型（Stable Diffusion / DiT）中的图像风格与角色定制。

## 一、背景与挑战

为特定画风、角色或概念定制文生图模型，若做全参数微调需更新数十亿权重、显存高昂，且每换一个风格就训练一份完整模型，存储与切换成本不可承受。更糟的是全参数微调易灾难性遗忘，破坏原模型通用生成能力。

LoRA（低秩适配）在图像生成场景同样成立：用极小的可训练低秩矩阵承载风格差异，主干冻结，从而「一个底座、多个小适配器随意切换」。这与文本 LLM 的 LoRA 数学同构，只是作用层从注意力投影换到 U-Net/DiT 的卷积或线性层。

## 二、核心原理

标准微调更新权重 $\Delta W$；LoRA 将其分解为低秩乘积：

$$
W' = W_0 + \Delta W = W_0 + B A,\quad B\in\mathbb{R}^{d\times r},\; A\in\mathbb{R}^{r\times k},\; r\ll \min(d,k)
$$

图像 LoRA 训练时只优化 $A,B$，常施加在 U-Net 的 `to_q/to_v` 或 DiT 的注意力/MLP 投影层。推理时把 $BA$ 合并回原权重（或运行时旁路相加），零额外延迟。多个 LoRA 可加权融合（merge / weighted sum）实现风格混搭。

训练数据工程上，图像 LoRA 对「质量 + 多样性 + 正则」三角尤为敏感：几十张高质图即可定风格，但需混入少量原模型域图作正则防止过拟合到 peculiar 背景；概念类（如某角色）常用「打标 + 触发词」让模型把新概念绑定到特定 token，推理时靠触发词召回。这也是 DreamBooth+LoRA 流水线流行的根因。

## 三、形式化与数学基础

设扩散去噪网络某线性层原权重 $W_0\in\mathbb{R}^{d\times k}$，前向变为：

$$
h = W_0 x + \frac{\alpha}{r} B A x
$$

其中 $\alpha$ 为缩放因子，控制 LoRA 影响强度；$r$ 为秩，决定可学容量。训练目标是扩散损失对该层 LoRA 参数的梯度：

$$
\nabla_{A,B} \mathbb{E}_{x_t,t,\epsilon}\big[\|\epsilon - \epsilon_\theta(x_t + \tfrac{\alpha}{r}BA\,\text{ctx}, t)\|^2\big]
$$

因只训 $A,B$，参数量由 $d\times k$ 降至 $r(d+k)$，常压缩百倍以上。

## 四、代码实现

Diffusers 中加载与融合图像 LoRA 的精简示例：

```python
from diffusers import StableDiffusionPipeline
pipe = StableDiffusionPipeline.from_pretrained("base/sd-1.5")
pipe.load_lora_weights("lora/style_anime.safetensors")
# 多 LoRA 加权融合
pipe.set_adapters(["style_a", "char_b"], adapter_weights=[0.8, 0.4])
image = pipe("a cat in anime style", num_inference_steps=25).images[0]
```

训练侧用 `Dreambooth + LoRA` 仅几十张图即可固化角色。

## 五、与其他技术对比

| 方法 | 参数量 | 切换成本 | 遗忘风险 | 图像适用 |
|------|--------|----------|----------|----------|
| 全参数微调 | 全量 | 高 | 高 | 否(贵) |
| LoRA | 极小 | 低 | 低 | 是(主流) |
| Textual Inversion | 极微 | 低 | 低 | 是(单概念) |
| DreamBooth | 中 | 中 | 中 | 是(角色) |

## 六、常见误区

- **「LoRA 只能用于文本」**：图像 U-Net/DiT 同样适用，数学完全同构。
- **「秩越大越好」**：过高秩易过拟合与风格脏，常见 $r=8\sim64$。
- **「几十张图必过拟合」**：配合恰当学习率与正则化，小数据正是 LoRA 强项。
- **混淆 LoRA 与 ControlNet**：LoRA 调风格/概念，ControlNet 控结构，二者正交可叠加。

## 七、与开源书·权威来源对应

- Hu et al., *LoRA: Low-Rank Adaptation of Large Language Models*, 2021（ICLR）。
- HuggingFace Diffusers 文档的 LoRA / Dreambooth 章节。
- Kohya 脚本是社区训练图像 LoRA 的事实标准工具链。

## 八、面试题

1. 为何 SD 风格定制常用 LoRA 而非全参数微调？
2. 图像 LoRA 与文本 LoRA 在数学上有何异同？
3. LoRA 的秩 $r$ 与缩放 $\alpha$ 分别起什么作用？
4. 多个 LoRA 如何实现风格融合？

## 九、演进与趋势

从基础 LoRA 到 DoRA、LoHA、LoKr 等结构化变体，再到与量化模型结合的 QLoRA 推理。图像侧出现「即时 LoRA」（训练即服务）与多概念解耦。未来方向是按需动态路由多个 LoRA 与统一多模态适配框架。

## 十、小结

LoRA 把图像定制从「全量重训」降为「训练小矩阵」，数学与文本侧同构、作用于 U-Net/DiT 投影层。它以极低遗忘与存储成本支撑多风格共存，是文生图个性化生产的基础设施。
