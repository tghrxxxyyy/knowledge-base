# BERT 架构解析

> 对应 Devlin et al.(2018) 与 d2l-zh「自然语言处理：预训练」。

## 一、核心概念

BERT(Bidirectional Encoder Representations from Transformers) 是**仅编码器**的预训练模型，用**掩码语言建模(MLM)** 与**下一句预测(NSP)** 在大规模语料上双向预训练，得到强力的通用文本表示，再微调到下游 NLU 任务。

输入 = `Token Embedding + Segment Embedding + Position Embedding`，以 `[CLS]` 起始、`[SEP]` 分隔。

## 二、数学形式

MLM：随机遮盖 15% token(其中 80% 换 `[MASK]`，10% 随机，10% 不变)，预测原词：

```
L_MLM = - Σ_{i∈masked} log P(x_i | x_{\\masked})
```

## 三、代码实现

```python
from transformers import AutoModel, AutoTokenizer
tok = AutoTokenizer.from_pretrained("bert-base-chinese")
model = AutoModel.from_pretrained("bert-base-chinese")
ids = tok("你好世界", return_tensors="pt")
out = model(**ids)              # last_hidden_state, pooler_output
```

## 四、关键要点

| 项 | BERT |
|----|------|
| 结构 | encoder-only |
| 预训练 | MLM + NSP |
| 注意力 | 双向 |
| 任务 | 理解/NLU |

## 五、常见误区

- 把 BERT 用于自回归生成(不擅长)。
- 忽略 `[CLS]` 向量的任务适配。

## 六、与开源书的对应

- Devlin et al., *BERT*, 2018.
- d2l-zh「自然语言处理：预训练」：https://zh.d2l.ai/chapter_pretraining/index.html

## 七、面试题

- BERT 的 MLM 为何要混合 80/10/10 策略？
- BERT 为何不适合生成任务？
