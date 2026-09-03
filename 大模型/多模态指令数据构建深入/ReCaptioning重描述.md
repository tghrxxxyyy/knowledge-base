# ReCaptioning重描述

> 对应 重描述研究（如 Yu et al. 2022 「COCO-Captions」revision、以及 LLM/MLLM 重写 caption 提升文本质量）。

## 一、背景与挑战

原始 caption 短、含糊或格式不一，限制文本侧语义密度。Re-captioning 用更强模型重写描述，使其更详细、结构化、信息丰富，从而提升图文对齐质量与指令数据价值。

## 二、核心原理

对原始短 caption，用 LLM（结合检测标签）或 MLLM 扩展为含属性、关系、场景的丰富描述。也可统一格式（如「主语-动作-宾语-背景」）。重描述后的数据用于预训练或指令微调，能增强细粒度理解。

## 三、数学形式

重写映射 \tilde{t} = R(t_{orig}, I)（R 为重写模型，可看图或仅文本+标签）。训练目标不变：
L = -\sum_t \log p_\theta(\tilde{t}_t \mid I, \tilde{t}_{<t})
仅替换监督文本为更高质量版本。

## 四、代码实现

```python
def recaption(llm, orig, tags):
    prompt = f"Rewrite richer caption. Tags:{tags}. Original:{orig}"
    return llm(prompt)

def retrain_data(pairs, recaption_fn):
    return [(img, recaption_fn(txt, tag)) for img, txt, tag in pairs]
```

## 五、与其他对比

相比直接用原 caption，重描述语义密度高；相比重新采集，成本低；需防重写引入幻觉（应基于真实标签/图像）。常与过滤配合。

## 六、常见误区

重写凭空加细节致幻觉；忽略格式统一；过度冗长稀释信号；不校验重写质量。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：re-captioning 目的？答：提升文本信息密度与一致性。
- Q：风险？答：凭空加细节引入幻觉。
- Q：配合什么？答：与过滤、去重联合。

## 九、演进

从文本重写到看图重写；大规模重描述（如 DataComp）；与指令合成流水线整合。

## 十、小结

重描述以低成本提升 caption 质量，是增强多模态数据语义密度、改善对齐的有效技巧。
