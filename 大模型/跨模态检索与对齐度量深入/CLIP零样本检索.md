# CLIP零样本检索

> 对应 Radford et al. 2021 「Learning Transferable Visual Models From Natural Language Supervision」(CLIP) 检索应用。

## 一、背景与挑战

传统检索需特定标签训练，难以应对开放词汇查询。CLIP 在共享嵌入空间内直接计算图像与文本相似度，支持 zero-shot 检索与任意自然语言查询。挑战是相似度校准与长尾查询。

## 二、核心原理

图像与文本分别编码为归一化向量，检索即计算余弦相似度排序。zero-shot 分类可视为特殊检索：把类别名构造成文本，取最高相似度类。实际多用 prompt 集成（如「a photo of a {class}」多模板平均）提升鲁棒。

## 三、数学形式

相似度 s(i,t)=\langle \tilde{z}_i^I, \tilde{z}_t^T\rangle（已归一化）。检索排序按 s 降序。分类：
\hat{c}=\arg\max_c \frac{1}{K}\sum_{k=1}^K s(i, t_c^{(k)})
其中 K 为 prompt 模板数。

## 四、代码实现

```python
import torch.nn.functional as F

def clip_retrieve(img_emb, text_embs, topk=5):
    img_emb = F.normalize(img_emb, dim=-1)
    text_embs = F.normalize(text_embs, dim=-1)
    sim = img_emb @ text_embs.t()         # [1, N]
    return sim.topk(topk)
```

## 五、与其他对比

相比 BM25/文本检索，CLIP 跨模态直接匹配；相比传统分类模型，无需固定标签；但细粒度组合查询（「红车」）较弱，需重排序或属性解耦。

## 六、常见误区

以为相似度即概率，实则需校准；忽略 prompt 工程影响；未归一化导致量纲错；误用单个模板。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Q：CLIP 检索原理？答：共享空间余弦相似度排序。
- Q：为何 prompt 集成？答：平滑模板差异，提鲁棒。
- Q：相似度需校准吗？答：是，否则阈值难设。

## 九、演进

从 CLIP 到 SigLIP 更强检索；长文本编码、区域级检索；与 RAG 结合做多模态检索。

## 十、小结

CLIP 零样本检索把开放词汇查询变为嵌入空间相似度计算，是跨模态检索的事实标准起点。
