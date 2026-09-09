# BERT 微调范式

> 对应 Devlin et al., *BERT*, 2018；以及「预训练—微调」范式相关实践（HuggingFace Transformers 文档）。

## 一、背景与挑战

BERT 预训练得到通用文本表示后，如何适配到具体下游任务？直接「从头训任务头」或「全量微调」各有取舍。挑战在于：① 不同任务（分类/抽取/问答/句对）需要不同输出结构；② 大模型全量微调成本高、易过拟合小数据；③ prompt/适配方式影响效果。BERT 时代沉淀出一套「加任务头 + 小学习率微调」的标准范式，并被后续 PEFT（如 LoRA）部分替代。

## 二、核心原理

BERT 微调在预训练主体之上接一个**任务头（task head）**，用下游标注数据端到端训练（通常联合微调骨干与头）。典型映射：

- **单句分类**（情感、主题）：取 `[CLS]` 向量接 MLP/Softmax。
- **句对分类**（NLI、语义相似）：拼接两句，取 `[CLS]` 接分类头。
- **token 级**（NER、词性）：对每个 token 表示接分类层，高级任务可接 CRF。
- **抽取式问答（SQuAD）**：对每段 token 预测「答案起/止位置」两个概率分布。

训练超参经验：学习率 $2\times10^{-5}\sim5\times10^{-5}$、batch 16~32、epoch 2~4、warmup + 线性衰减。全量微调对小数据易过拟合，故学习率要小、轮次要少。

## 三、形式化与数学基础

句对分类头对 `[CLS]` 表示 $h_{[\text{CLS}]}$：

$$
\hat{y} = \text{softmax}(W_c\,h_{[\text{CLS}]} + b_c)
$$

抽取式 QA 对第 $t$ 个 token 的表示 $h_t$ 预测起/止 logits：

$$
s_t = w_s^\top h_t,\quad e_t = w_e^\top h_t,\qquad
\hat{s},\hat{e} = \arg\max_{s\le e} (s_s + e_e)
$$

微调总损失为任务损失对全部参数 $\theta$ 的梯度下降：

$$
\theta^* = \arg\min_\theta \mathcal{L}_{\text{task}}(f_\theta(x), y)
$$

## 四、代码实现

用 HuggingFace `Trainer` 微调文本分类：

```python
from transformers import AutoModelForSequenceClassification, Trainer, TrainingArguments

model = AutoModelForSequenceClassification.from_pretrained(
    "bert-base-chinese", num_labels=2)

args = TrainingArguments(
    output_dir="./bert-clf",
    learning_rate=3e-5,          # 小学习率
    per_device_train_batch_size=32,
    num_train_epochs=3,
    warmup_ratio=0.1,
    weight_decay=0.01,
)
trainer = Trainer(model=model, args=args, train_dataset=train_ds, eval_dataset=eval_ds)
trainer.train()
```

## 五、与其他技术对比

| 适配方式 | 改动量 | 数据需求 | 成本 | 适用 |
|----------|--------|----------|------|------|
| 全量微调 | 全部参数 | 中~大 | 高 | BERT 时代主流 |
| 加线性头(冻结骨干) | 仅头 | 小 | 低 | 快速基线 |
| LoRA/Adapter | 少量参数 | 小~中 | 中 | 现代 PEFT |

## 六、常见误区

- 「必须全量微调才有效」：小数据下冻结骨干只训头/PEFT 反而更稳。
- 「学习率可沿用预训练」：微调学习率应小 1~2 个数量级，否则破坏预训练表示。
- 「epoch 越多越好」：BERT 微调 2~4 轮即饱和，过多易过拟合小数据。
- 「`[CLS]` 头适用所有任务」：序列标注/QA 需用 token 级头。

## 七、与开源书·权威来源对应

- Devlin et al., *BERT*, 2018（微调实验设置）。
- HuggingFace Transformers 文档「Fine-tuning」章节。
- 指令微调/SFT 与 PEFT（LoRA）相关章节（现代替代方案）。

## 八、面试题

- BERT 做抽取式 QA 如何预测答案区间（起止位置）？
- 为何微调学习率要比预训练小？过大有何后果？
- 全量微调与加头/PEFT 在小数据下如何取舍？
- `[CLS]` 向量适用于哪些任务、不适用于哪些？

## 九、演进与趋势

BERT 时代的「全量微调」逐步被参数高效微调（PEFT）取代：LoRA、Adapter、Prompt Tuning 以极少可训练参数逼近全量效果，大幅降低显存与存储。同时，「预训练—微调」整体范式也部分转向「预训练—指令微调（SFT）—对齐」的大模型范式，但「加任务头 + 小学习率」仍是编码器类模型落地的经典做法。

## 十、小结

BERT 微调以「预训练主体 + 任务头 + 小学习率少轮次」为核心范式，按任务选分类/序列/QA 头。全量微调正被 LoRA 等 PEFT 替代以降本增效。具体超参与头结构以 BERT 论文与 HuggingFace 文档为准。
