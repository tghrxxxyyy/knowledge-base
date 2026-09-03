# LLaVA类架构

> 对应 Liu et al., *Visual Instruction Tuning (LLaVA)*, 2023；Li et al., *BLIP-2*, 2023（Q-Former）。

## 一、背景与挑战

如何把视觉编码器接入 LLM，又不破坏语言知识、且参数高效？

## 二、核心原理

LLaVA：视觉编码器（CLIP ViT）→ 线性/MLP 投影层 → LLM 词嵌入空间，图像 token 与文本 token 拼接输入 LLM。BLIP-2 用 Q-Former 瓶颈对齐。训练常分两阶段：先对齐投影，再指令微调。

## 三、数学形式

视觉 token 投影：

$$h_v = W\cdot E_{vision}(I),\quad H = [h_v; h_{text}]$$

$H$ 送入 LLM 自回归。

## 四、代码实现

```python
img_tokens = proj(vision_encoder(image))      # [n, D]
inputs = cat([img_tokens, text_emb], dim=1)
out = llm(inputs)
```

## 五、与其他对比

- 与 视觉指令对齐 共享投影对齐。
- 与 多模态对话 构成可对话模型。

## 六、常见误区

- 直接微调整 LLM 算力高；宜先冻 LLM 训投影。
- 投影层过简难对齐模态 gap。

## 七、与开源书对应

- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- LLaVA 如何接视觉？答：CLIP 编码后经投影层映射到 LLM 词嵌入空间，拼接输入。

## 九、演进

Flamingo（gated cross-attn）→ BLIP-2（Q-Former）→ LLaVA（线性投影）。

## 十、小结

LLaVA 类以“编码器+投影+LLM”实现低成本多模态指令模型。
