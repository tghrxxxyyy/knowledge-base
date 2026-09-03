# CLIP架构与训练

> 对应 Radford et al., *CLIP: Learning Transferable Visual Models From Natural Language Supervision*, ICML 2021。

## 一、背景与挑战

传统视觉模型依赖固定标签体系，难以泛化到开放概念；CLIP 用自然语言作为监督，从海量图文对学习可迁移表示。

## 二、核心原理

双塔结构：图像编码器（ViT 或 ResNet）与文本编码器（Transformer），对批次内 N 个图文对做 N 路对比分类，正对角线、负为其余组合。预训练后可用文本提示做零样本分类。

## 三、数学形式

对称对比损失（图像侧与文本侧各一次）：

$$\mathcal L = \frac12\left[\mathcal L_i(I,T)+\mathcal L_t(I,T)\right],\quad \mathcal L_i = -\log\frac{e^{s_{ii}/\tau}}{\sum_j e^{s_{ij}/\tau}}$$

$s_{ij}$ 为图像 i 与文本 j 的相似度。

## 四、代码实现

```python
logits = (image_emb @ text_emb.T) * exp_logit_scale
labels = torch.arange(B)
loss = (F.cross_entropy(logits, labels) +
        F.cross_entropy(logits.T, labels)) / 2
```

## 五、与其他对比

- 与 视觉语言对齐对比学习深入 共享对比范式，CLIP 是工程化落地。
- 与 跨模态生成扩散深入 互补（理解 vs 生成条件）。

## 六、常见误区

- 认为 CLIP 理解语义；其实学到的是图文共现的统计对齐，易受文本表面词影响。
- 忽略模板提示对零样本结果敏感。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- CLIP 为何能零样本？答：文本编码器把类别名映射到与图像对齐的语义空间，相似度即分类。

## 九、演进

固定标签 → 弱监督检测 → CLIP 对比 → 更大规模 ALIGN/Florence。

## 十、小结

CLIP 以自然语言为弱监督，用对称对比把图文映射到共享空间，开启开放词汇视觉。
