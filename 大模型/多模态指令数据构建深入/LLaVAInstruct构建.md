# LLaVAInstruct构建

> 对应 Liu et al. 2023 「Visual Instruction Tuning」(LLaVA) 与 「LLaVA-Instruct-150K」数据构建。

## 一、背景与挑战

多模态指令数据稀缺，人工标注昂贵。LLaVA 用纯文本 GPT-4 基于图像 caption 与 bounding boxes 合成多样化视觉指令数据，覆盖对话、细节描述、复杂推理三类。挑战是避免幻觉、保证多样性与质量。

## 二、核心原理

流程：先用标注模型（如 COCO caption + 检测框）得到图像符号化描述；再把这些上下文喂给 GPT-4（仅文本接口、看不到图）生成三类指令-回答：对话型、细节描述型、推理型。最后以视觉编码器+LLM 做指令微调。

## 三、数学形式

指令数据三元组 (I, q, a)。监督微调损失为语言建模：
L = -\sum_{t}\log p_\theta(a_t \mid I, q_{<t}, a_{<t})
其中图像 I 经视觉塔与投影转为 token 前置。GPT-4 仅参与离线数据合成，训练时不调用。

## 四、代码实现

```python
def build_prompt(captions, boxes):
    ctx = "Captions:\n" + "\n".join(captions)
    ctx += "\nObjects: " + ", ".join(boxes)
    return ctx + "\nGenerate diverse Q&A about this image."

# 调用 GPT-4 文本接口生成 (q,a)，过滤空/重复
```

## 五、与其他对比

相比人工标注，合成成本低、规模大；相比纯 caption，指令格式更贴合对话；质量受符号化描述限制（GPT-4 未见图）。后续用真实多模态模型（GPT-4V）改进。

## 六、常见误区

以为 GPT-4 真看了图，实则仅文本符号；忽略幻觉污染；未做去重/过滤；混淆数据构建与训练阶段。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：LLaVA 数据如何造？答：符号化图像描述 + GPT-4 文本合成指令。
- Q：三类数据？答：对话、细节描述、复杂推理。
- Q：GPT-4 看得到图吗？答：否，仅文本符号上下文。

## 九、演进

从文本 GPT-4 合成到 GPT-4V 直接标注；更大更多样数据集（LLaVA-1.5/665K）；多语言与视频扩展。

## 十、小结

LLaVA-Instruct 以「符号化 + 强模型合成」低成本造出高质量多模态指令数据，开启了视觉指令微调范式。
