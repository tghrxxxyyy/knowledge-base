# 句子对任务与 NSP

> 对应 Devlin et al., *BERT*, 2018（NSP）；Liu et al., *RoBERTa*, 2019（NSP 必要性重审）。

## 一、背景与挑战

许多自然语言理解任务本质是「句子间关系」：自然语言推断（NLI，蕴含/矛盾/中立）、问答（判断是否答案所在段落）、语义相似度等。BERT 为此引入**下一句预测（Next Sentence Prediction, NSP）** 作为第二预训练目标，让模型显式学习句对关系。但 NSP 是否真的有用，后续研究（尤其 RoBERTa）给出惊人结论：去掉它反而更好。这引发对「句对预训练目标」的深入反思。

## 二、核心原理

NSP 在预训练时构造句对 $(A,B)$：50% 来自语料中真实相邻句（label=IsNext），50% 从别处随机抽句（label=NotNext），把拼接后的 `[CLS]` 表示送入二分类头预测。其意图是让模型获得「句子级连贯性/关系」的先验，迁移到 NLI、QA 等任务。

RoBERTa 的对照实验发现：在更大语料、更长训练、动态掩码下，去掉 NSP、改用「连续长段（full-sentences / doc-segments）」预训练，多项下游任务反而更优。原因推测：NSP 的负例「太简单」（随机句明显不连贯），模型易走捷径，未能学到细粒度句间推理。

## 三、形式化与数学基础

NSP 为二分类，对 `[CLS]` 表示 $h_{[\text{CLS}]}$ 经线性层 + sigmoid：

$$
\hat{y} = \sigma(W_{\text{nsp}}\,h_{[\text{CLS}]} + b), \qquad
\mathcal{L}_{\text{NSP}} = -\big[y\log\hat{y} + (1-y)\log(1-\hat{y})\big]
$$

与 MLM 联合训练：$\mathcal{L} = \mathcal{L}_{\text{MLM}} + \mathcal{L}_{\text{NSP}}$。RoBERTa 改为仅 $\mathcal{L}_{\text{MLM}}$，并采用「跨文档连续段」输入（segment 可含多句、不强制成对）。

## 四、代码实现

构造 NSP 训练样本（示意）：

```python
import random

def make_nsp_pair(sentences, doc_boundaries):
    a = random.choice(sentences)
    if random.random() < 0.5:
        b = next_sentence_of(a)          # 真实下一句
        label = 1
    else:
        b = random.choice(sentences)     # 随机句
        label = 0
    return f"[CLS] {a} [SEP] {b} [SEP]", label
```

## 五、与其他技术对比

| 预训练目标 | 句子关系信号 | RoBERTa 结论 |
|------------|--------------|--------------|
| NSP | 强（显式） | 收益有限/负作用 |
| 无 NSP + 长段 | 弱（隐式） | 更优 |
| SOP（ALBERT） | 强（同文档内顺序） | 优于 NSP |

ALBERT 提出 **SOP（Sentence Order Prediction）**：用「同文档两段的顺序正误」替代「是否相邻」，比 NSP 更难作弊，效果更稳。

## 六、常见误区

- 「NSP 总是提升句对任务」：RoBERTa 证明非必需，甚至可能因负例过易而拖累。
- 「去掉 NSP 就失去句间能力」：长段连续预训练隐式保留了段落连贯性。
- 「NSP 负例越随机越好」：过易负例让任务退化，SOP 用更细粒度顺序信号改进。
- 「BERT 全部思想都值得保留」：NSP 是被后续证伪的典型「直觉正确、实证存疑」目标。

## 七、与开源书·权威来源对应

- Devlin et al., *BERT*, 2018（NSP 提出）。
- Liu et al., *RoBERTa: A Robustly Optimized BERT Pretraining Approach*, 2019（去掉 NSP）。
- Lan et al., *ALBERT*, 2019（SOP 替代 NSP）。
- d2l-zh「预训练」相关章节。

## 八、面试题

- 为何 RoBERTa 去掉 NSP 反而更好？NSP 的负例设计有什么问题？
- NSP 与 SOP（ALBERT）的区别？为何 SOP 更合理？
- NSP 对哪些下游任务本应有帮助？实证为何落空？
- 若不用 NSP，模型从哪里获得句间关系能力？

## 九、演进与趋势

NSP 作为 BERT 标志性目标，经 RoBERTa 证伪后被主流放弃，代之以「长段连续预训练」或 ALBERT 的 SOP。这体现预训练研究的方法论转折：**训练规模与数据质量常比架构/目标细节更关键**。现代 decoder-only 模型大多不再显式句对目标，靠大规模自回归隐式习得关系。

## 十、小结

NSP 试图给 BERT 注入句子关系先验，但负例过易使其收益有限，RoBERTa 去掉后反而更优；ALBERT 的 SOP 提供了更稳健替代。该案例说明「数据规模 + 训练充分性」常压倒目标设计细节。具体结论以 BERT/RoBERTa/ALBERT 论文为准。
