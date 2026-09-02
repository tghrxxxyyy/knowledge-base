# BLIP 与图文理解

> 见「多模态对齐深入/CLIP对比对齐」。

## 一、背景与挑战

CLIP 擅长检索但不善生成。BLIP 兼顾理解与生成。

## 二、核心原理

BLIP 用多模态混合目标（ITC/ITM/LM）与「图文编码器-解码器」结构，并用 Captioner+Filter 清洗网络噪声图文。

## 三、关键要点

- ITC 对齐、ITM 匹配、LM 生成三任务联合。
- 数据过滤提升质量。

## 四、代码实现

```python
from transformers import BlipForConditionalGeneration
m = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base")
```

## 五、与其他对比

- CLIP 偏表征；BLIP 偏 captioning/VQA。

## 六、常见误区

- 以为 BLIP 等同 CLIP——目标与结构不同。

## 七、与开源书对应

- BLIP: https://github.com/salesforce/BLIP
- Li et al., 2022.

## 八、面试题

- BLIP 的三个预训练目标分别作用？

## 九、演进

BLIP → BLIP-2（Q-Former 接 LLM） → InstructBLIP。

## 十、小结

BLIP 系列架起图文理解与生成的桥。
