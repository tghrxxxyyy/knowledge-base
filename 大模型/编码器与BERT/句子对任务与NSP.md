# 句子对任务与 NSP

> BERT 的第二预训练目标。

## 一、核心概念

NSP(Next Sentence Prediction)：判断句 B 是否为句 A 的下一句，学习句子级关系(适用于问答/蕴含)。后续研究(RoBERTa)发现 NSP 收益有限，可去掉。

## 二、关键要点

- NSP 帮助句子关系任务，但 RoBERTa 证明非必需。
- 现代模型多用单段长文本预训练取代 NSP。

## 三、面试题

- 为何 RoBERTa 去掉 NSP 反而更好？
