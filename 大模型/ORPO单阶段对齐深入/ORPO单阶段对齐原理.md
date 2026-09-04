# ORPO单阶段对齐原理

> 对应 Hong 2024 ORPO 与 Ouyang 2022 InstructGPT。

## 一、背景与挑战
标准对齐需 SFT 再 RLHF/DPO 两阶段。ORPO(Odds Ratio Preference Optimization)把监督微调与偏好对齐合并为单阶段，省去独立对齐步。

## 二、核心原理
在常规 SFT 负对数似然损失上叠加基于 odds ratio 的偏好项，使模型在学知识同时远离不喜爱回答。

## 三、形式化与数学基础
ORPO 损失为 NLL 与 OR 项之和：
$\mathcal{L}_{ORPO}=\mathcal{L}_{SFT}+\lambda\,\mathcal{L}_{OR}$
其中 $\mathcal{L}_{OR}$ 用所选/拒答的 odds 比构造。

## 四、代码实现
# ORPO 损失骨架
import torch.nn.functional as F

def orpo_loss(nll, logp_chosen, logp_rejected, lam=0.1):
    odds_c = torch.exp(logp_chosen)
    odds_r = torch.exp(logp_rejected)
    or_term = -F.logsigmoid(odds_c - odds_r).mean()
    return nll + lam * or_term

## 五、与其他技术对比
相比 DPO 需先 SFT 再偏好训练，ORPO 一步完成；相比 KTO 仍用配对数据。

## 六、常见误区
误以为可完全跳过 SFT——ORPO 内含 SFT 项；$\lambda$ 过大压制语言建模。

## 七、与开源书/权威来源对应
Hong 2024 ORPO 论文；huggingface/trl 提供 ORPOTrainer。

## 八、面试题
问：ORPO 如何省去独立对齐阶段？答：把偏好 odds 项直接加进 SFT 损失联合优化。

## 九、演进与趋势
与指令混合数据、课程式 $\lambda$ 调度。

## 十、小结
ORPO 以单阶段统一微调与对齐，简化流程且效果可观。
