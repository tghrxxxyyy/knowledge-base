# RoBERTa 与改进

> 对应 Liu et al., *RoBERTa: A Robustly Optimized BERT Pretraining Approach*, 2019。

## 一、背景与挑战

BERT 发布后，一个问题浮现：BERT 的强是来自「架构创新」还是「训练方式」？许多后续工作小幅改架构却收益有限。RoBERTa 用一组**控制变量实验**给出关键结论：在「更大数据、更长训练、更优目标设定」下，原始 BERT 架构本身就能大幅超越原版 BERT，甚至逼近或超过同期更复杂的模型。它揭示了一个重要方法论：预训练的充分性常被低估。

## 二、核心原理

RoBERTa 对 BERT 做了四项关键调整：

1. **更大规模、更久训练**：用约 10 倍数据（含 CC-NEWS 等）、更大 batch、更长步数。
2. **去掉 NSP**：改用「连续长段（FULL-SENTENCES / DOC-SENTENCES）」输入，跨句但同文档，仅保留 MLM。
3. **动态掩码（dynamic masking）**：每个训练 epoch 重新随机生成掩码，而非像 BERT 那样预计算固定掩码（BERT 在数据重复多 epoch 时会过拟合固定掩码）。
4. **更大 batch 与学习率**：借助大 batch（如 8k）稳定训练。

结果：在 GLUE、SQuAD 等任务上显著超过 BERT-large。

## 三、形式化与数学基础

BERT 的静态掩码：在数据处理阶段固定一组掩码模式 $M$，多个 epoch 重复见到相同 $M$，估计偏差：

$$
\hat{\mathcal{L}}_{\text{static}} = \frac{1}{E}\sum_{e=1}^{E}\mathcal{L}(M)\quad (M\text{ 固定})
$$

RoBERTa 动态掩码：每个 epoch $e$ 重新采样 $M^{(e)}$：

$$
\hat{\mathcal{L}}_{\text{dynamic}} = \frac{1}{E}\sum_{e=1}^{E}\mathcal{L}(M^{(e)})
$$

这使模型在每个 epoch 见到不同遮盖，缓解对固定掩码模式的过拟合，提升数据利用率。损失仅保留 MLM：

$$
\mathcal{L} = \mathcal{L}_{\text{MLM}} \quad (\text{无 } \mathcal{L}_{\text{NSP}})
$$

## 四、代码实现

用 HuggingFace 加载 RoBERTa 并做掩码填充（动态掩码在训练时随机）：

```python
from transformers import AutoModelForMaskedLM, AutoTokenizer
import torch

tok = AutoTokenizer.from_pretrained("roberta-large")
model = AutoModelForMaskedLM.from_pretrained("roberta-large")

text = tok("The scientist <mask> the experiment.", return_tensors="pt")
with torch.no_grad():
    logits = model(**text).logits
    pred = logits[0, text.input_ids[0].tolist().index(tok.mask_token_id)].argmax()
print("预测词:", tok.decode([pred.item()]))
```

## 五、与其他技术对比

| 模型 | NSP | 掩码 | 数据/训练 | 相对 BERT |
|------|-----|------|-----------|-----------|
| BERT | 有 | 静态 | 较小 | 基线 |
| RoBERTa | 无 | 动态 | 大/长 | 显著更优 |
| ALBERT | SOP | 静态 | 参数共享 | 参少、略优 |
| ELECTRA | 无(替换检测) | - | 高效 | 训练更省 |

## 六、常见误区

- 「BERT 架构不够好才被超越」：RoBERTa 几乎不改架构，靠训练改进胜出。
- 「静态掩码无所谓」：多 epoch 下动态掩码能更好利用数据。
- 「NSP 必须保留」：RoBERTa 证明去掉反而更好（见 NSP 章节）。
- 「更大的模型一定更好」：在 RoBERTa 中，训练充分性（数据/步数）贡献常大于参数量。

## 七、与开源书·权威来源对应

- Liu et al., *RoBERTa*, 2019（arXiv:1907.11692）。
- Devlin et al., *BERT*, 2018（对照基线）。
- Lan et al., *ALBERT*, 2019；Clark et al., *ELECTRA*, 2020（同期改进）。
- d2l-zh「预训练」章节。

## 八、面试题

- RoBERTa 相比 BERT 的主要改进是什么？哪个贡献最大？
- 动态掩码解决了静态掩码的什么问题？为何多 epoch 训练时更重要？
- 为什么 RoBERTa 去掉 NSP？这与训练充分性有何关系？
- RoBERTa 给「预训练方法论」带来什么启示（架构 vs 训练）？

## 九、演进与趋势

RoBERTa 确立了「训练充分性优先」的范式，影响后续诸多工作：更大语料、更长训练、去除冗余目标成为标准。它与 ALBERT（参数共享）、ELECTRA（替换令牌检测）、DistilBERT（蒸馏）共同构成 BERT 家族的优化谱系；其思想也延续到现代「先充分预训练、再轻量适配」的实践中。

## 十、小结

RoBERTa 证明 BERT 的强主要源于「训练充分」，而非架构细节——更大更久训练、去 NSP、动态掩码即大幅超越原版。其方法论启示深远：在比较模型时，先确保训练对等。具体数据规模与超参以 RoBERTa 论文与 HuggingFace 配置为准。
