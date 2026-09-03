# GPT4V标注与数据增强

> 对应 多模态标注研究（如 LLaVA-1.5 数据改进、ShareGPT4V 用 GPT-4V 生成高质量描述）。

## 一、背景与挑战

纯文本 GPT-4 合成看不到图，限制描述真实性。GPT-4V 可直接看图生成更准确、细粒度的 caption 与指令数据，但成本高、需批量策略与质量把控。挑战是成本、速率与一致性。

## 二、核心原理

用 GPT-4V 对图像生成详细描述（dense caption）或围绕图像生成多轮指令对话，作为高质量监督。ShareGPT4V 即以此造 10 万高质量描述并蒸馏到小模型。可先用 GPT-4V 标少量，再训练本地 MLLM 放大标注其余。

## 三、数学形式

标注函数 a = \mathrm{GPT4V}(I, q_{template})。蒸馏：用生成数据微调学生 M_\phi 逼近：
L = -\sum_t \log p_\phi(a_t\mid I, q_{<t})
以高质量 a 监督，提升学生描述能力，再用于大规模造数据。

## 四、代码实现

```python
def gpt4v_caption(client, image_b64, prompt):
    resp = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role":"user","content":[
            {"type":"image_url","image_url":{"url":image_b64}},
            {"type":"text","text":prompt}]}])
    return resp.choices[0].message.content
```

## 五、与其他对比

相比文本 GPT-4 合成，GPT-4V 更准确、少幻觉；成本高但可蒸馏放大；适合造「种子」高质量数据。组合「少量 GPT-4V + 大量本地模型」最经济。

## 六、常见误区

全量调用 GPT-4V 致成本爆炸；不蒸馏放大；忽略一致性校验；直接信其零幻觉。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：GPT-4V 标注优势？答：真看图，描述准、少幻觉。
- Q：如何降本？答：少量种子 + 蒸馏到本地模型放大。
- Q：ShareGPT4V 思路？答：GPT-4V 造高质量描述并蒸馏。

## 九、演进

从文本合成到视觉模型直接标注；种子蒸馏范式普及；自动化质量评分闭环。

## 十、小结

GPT-4V 标注以更高真实性提升指令数据质量，配合蒸馏放大，是构建高质量多模态语料的高效路径。
