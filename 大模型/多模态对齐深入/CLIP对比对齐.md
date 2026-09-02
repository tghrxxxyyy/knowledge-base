# CLIP 对比对齐

> 对应 d2l-zh 多模态章与 llm-course；Radford et al., *CLIP*, 2021。

## 一、背景与挑战

图文模态语义空间不同，需统一表征以支持检索/生成。

## 二、核心原理

CLIP 用对比学习：图像编码器与文本编码器分别编码，正样本（匹配图-文对）相似度拉高，负样本拉低。训练于 4 亿图文对。

## 三、数学形式

对比损失（InfoNCE）：

```
L = -log exp(s(i,t)/τ) / Σ_{t'} exp(s(i,t')/τ)
```

## 四、代码实现

```python
import clip
model, _ = clip.load("ViT-B/32")
logits = model(image, text)  # 图文相似度
```

## 五、关键要点

- 零样本分类：文本 prompt 作分类器。
- 表征可迁移到下游。

## 六、与其他对比

- 早期图文用联合 embedding 弱监督；CLIP 大规模对比更通用。

## 七、常见误区

- CLIP 理解「语义」而非「像素细节」。

## 八、与开源书对应

- CLIP: https://github.com/openai/CLIP
- llm-course: https://github.com/mlabonne/llm-course

## 九、面试题

- CLIP 的 InfoNCE 损失如何工作？

## 十、演进

Word2Vec 类比 → VSE → CLIP → 大规模图文基础模型。

## 十一、小结

CLIP 统一的图文表征是现代多模态底座。
