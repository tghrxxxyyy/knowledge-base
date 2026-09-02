# LLaVA 视觉指令

> 见「多模态深入/多模态大模型」与「多模态对齐深入/CLIP对比对齐」。

## 一、背景与挑战

让 LLM「看懂图」需把视觉特征对齐到语言空间。

## 二、核心原理

LLaVA 用预训练视觉编码器（CLIP）经线性投影接 LLM，先在图文对上做特征对齐预训练，再用视觉指令数据（GPT-4 蒸馏）微调，实现多模态对话。

## 三、代码实现

```python
# 视觉特征投影到词嵌入空间
proj = nn.Linear(visual_dim, llm_hidden)
emb = torch.cat([proj(images), text_emb], dim=1)
```

## 四、关键要点

- 对齐阶段冻结 LLM，仅训投影。
- 视觉指令数据为关键创新。

## 五、与其他对比

- BLIP-2 用 Q-Former 瓶颈；LLaVA 用简单线性投影更轻。

## 六、常见误区

- 直接拼图像像素到 LLM——维度与语义都不匹配。

## 七、与开源书对应

- LLaVA: https://github.com/haotian-liu/LLaVA
- Liu et al., 2023.

## 八、面试题

- LLaVA 如何把图像特征接入 LLM？

## 九、演进

LLaVA → LLaVA-1.5（MLP 投影） → 多模态指令扩展。

## 十、小结

LLaVA 开创了「视觉编码器+投影+LLM」的极简多模态范式。
