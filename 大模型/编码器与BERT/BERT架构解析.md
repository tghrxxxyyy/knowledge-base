# BERT 架构解析

> 对应 Devlin et al., *BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding*, 2018；d2l-zh「自然语言处理：预训练」章节。

## 一、背景与挑战

2018 年前，NLP 主流是单向语言模型（如 GPT 从左到右），下游任务各自从头训，难以利用大规模无标注语料。BERT 的突破在于：用**仅编码器（encoder-only）**的 Transformer，在大规模语料上做**双向**预训练，得到可迁移的通用文本表示，再以轻量任务头微调，刷新 11 项 NLP 任务 SOTA。其挑战是把「双向上下文」融入预训练目标而不泄露答案。

## 二、核心原理

BERT 堆叠 $L$ 层 Transformer 编码器（base 12 层 / large 24 层），每层双向自注意力 + 前馈。输入为三种嵌入之和：

$$
x = \text{TokenEmbed} + \text{SegmentEmbed} + \text{PositionEmbed}
$$

以特殊符 `[CLS]` 开头（其最终向量用于句级分类）、`[SEP]` 分隔句对。预训练用两个目标：**MLM**（随机遮盖部分 token 让其预测）与 **NSP**（判断两句是否相邻）。微调时接任务头（分类/抽取/问答）。

## 三、形式化与数学基础

MLM：随机选 15% 位置遮盖，其中 80% 替换为 `[MASK]`、10% 随机词、10% 不变，对遮盖位置算交叉熵：

$$
\mathcal{L}_{\text{MLM}} = -\sum_{i\in\mathcal{M}} \log P(x_i \mid x_{\setminus i})
$$

NSP：句对 $(A,B)$ 标签 $y\in\{0,1\}$（B 是否为 A 下一句）：

$$
\mathcal{L}_{\text{NSP}} = -\log P(y \mid [\text{CLS}]\text{ 的表示})
$$

总损失 $\mathcal{L} = \mathcal{L}_{\text{MLM}} + \mathcal{L}_{\text{NSP}}$。最终句子表示常取 `[CLS]` 经池化/投影后的向量。

## 四、代码实现

用 HuggingFace `transformers` 取句向量：

```python
from transformers import AutoModel, AutoTokenizer
import torch

tok = AutoTokenizer.from_pretrained("bert-base-chinese")
model = AutoModel.from_pretrained("bert-base-chinese")

ids = tok("你好世界", return_tensors="pt")
with torch.no_grad():
    out = model(**ids)
last_hidden = out.last_hidden_state        # [1, seq, 768]
cls_vec = out.pooler_output                # [1, 768]，[CLS] 经池化
mean_pool = last_hidden.mean(dim=1)        # 均值池化句向量
```

## 五、与其他技术对比

| 项 | BERT | GPT（单向） | ELMo |
|----|------|-------------|------|
| 结构 | encoder-only | decoder-only | 双向 LSTM |
| 注意力 | 双向 | 因果 | 双向 |
| 预训练 | MLM+NSP | CLM | 双向 LM |
| 任务 | 理解/NLU | 生成/NLG | 表示 |

## 六、常见误区

- 「BERT 适合自回归生成」：错误，encoder-only 无因果掩码，不擅长逐词生成。
- 「`[CLS]` 向量天然适合语义检索」：原生 `[CLS]` 各向异性严重，需 SBERT 式微调（见相关章节）。
- 「NSP 总是有益」：RoBERTa 证明去掉反而更好。
- 「遮盖比例任意」：约 15% 是经验平衡，过高/过低伤训练。

## 七、与开源书·权威来源对应

- Devlin et al., *BERT*, 2018（arXiv:1810.04805）。
- 李沐等, *d2l-zh「自然语言处理：预训练」*：https://zh.d2l.ai/chapter_pretraining/index.html
- HuggingFace Transformers 文档 BERT 模型页。

## 八、面试题

- BERT 的 MLM 为何要混合 80/10/10 策略？直接全用 `[MASK]` 会怎样？
- BERT 为何不适合生成任务？encoder-only 与 decoder-only 的根本区别？
- `[CLS]` 向量如何用于句级任务？为什么原生不适合检索？
- NSP 的作用与局限？后续研究如何处置它？

## 九、演进与趋势

BERT 开启「预训练 + 微调」范式，催生 RoBERTa、ALBERT、ELECTRA、DistilBERT 等改进；其表示思想延续到 SBERT、句向量检索与 RAG。但随着 decoder-only 大模型兴起，纯编码器在生成时代角色收缩为「表示/检索专家」，常与生成模型配合（如 RAG 的检索器）。

## 十、小结

BERT 以 encoder-only + 双向 MLM/NSP 预训练，开创了通用文本表示与「预训练—微调」范式。其强项在理解类（NLU）任务，弱项在生成。现代应用中常作为检索/句向量底座。细节（层数、隐藏维、训练数据）以 BERT 论文与 HuggingFace 文档为准。
