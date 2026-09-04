# RLAIF奖励模型的构建与校准

> 对应 Lee 2023 RLAIF 与 Ziegler 2019 奖励建模。

## 一、背景与挑战
RLAIF 仍需把 AI 偏好转成可优化的奖励信号，奖励模型的标定影响训练质量。

## 二、核心原理
用 AI 标注的偏好对训练 Bradley-Terry 奖励模型，或直接用标注模型输出分数差作为奖励。

## 三、形式化与数学基础
奖励模型损失：
$\mathcal{L}_R=-\mathbb{E}_{(x,y_w,y_l)}[\log\sigma(r(x,y_w)-r(x,y_l))]$
推理时 $r(x,y)$ 作为策略优化奖励。

## 四、代码实现
# 奖励模型训练一步
import torch.nn.functional as F

rw = reward(x, yw); rl = reward(x, yl)
loss = -F.logsigmoid(rw - rl).mean()
loss.backward()

## 五、与其他技术对比
用现成 LLM 直接打分省去训练但偏差固定；训练奖励模型更灵活但需防过优化。

## 六、常见误区
直接复用标注模型当奖励导致分布内过自信；未对奖励做长度归一化引发长度偏差。

## 七、与开源书/权威来源对应
huggingface/trl RewardTrainer 支持 BT 损失；Lee 2023 给出 RLAIF 奖励构建实验。

## 八、面试题
问：AI 标注训练的奖励模型与 RLHF 奖励模型本质区别？答：监督信号来源不同，模型结构完全一致。

## 九、演进与趋势
奖励集成、不确定性加权降低偏差。

## 十、小结
RLAIF 奖励构建复用 RLHF 工具链，关键是标注质量与校准。
