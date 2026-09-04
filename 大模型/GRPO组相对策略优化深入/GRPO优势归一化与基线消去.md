# GRPO优势归一化与基线消去

> 对应 Shao 2024 GRPO 与 Williams 1992 REINFORCE baseline。

## 一、背景与挑战
强化学习中高方差是训练不稳定的主因。GRPO 用组内均值作基线、z-score 作优势，天然实现方差缩减。

## 二、核心原理
对一组奖励 $\{r_i\}_{i=1}^G$，优势 $A_i=(r_i-\bar r)/s_r$。减去均值等价于引入状态价值基线，除以标准差等价于白化，使不同问题奖励尺度可比。

## 三、形式化与数学基础
$\hat A_i=\frac{r_i-\frac{1}{G}\sum_j r_j}{\sqrt{\frac{1}{G}\sum_j(r_j-\bar r)^2+\epsilon}}$
当 $G=1$ 时退化为无基线的 REINFORCE 等价形式，方差最大。

## 四、代码实现
# 组相对优势，带稳定项
import torch

def group_advantage(rewards, eps=1e-6):
    mean = rewards.mean(dim=-1, keepdim=True)
    std = rewards.std(dim=-1, keepdim=True)
    return (rewards - mean) / (std + eps)

adv = group_advantage(torch.tensor([0.7, 0.9, 0.2, 0.5]))

## 五、与其他技术对比
PPO 的 GAE 用 $\lambda$ 折衷偏差方差；GRPO 的白化更直接但要求同组样本可比，对奖励尺度敏感任务需先归一化奖励。

## 六、常见误区
重复奖励相同的组导致 std→0 除零；误用跨组全局归一化破坏组内相对语义。

## 七、与开源书/权威来源对应
d2l-ai/d2l-zh 在策略梯度章节讲解 baseline 降方差；Shao 2024 给出 GRPO 归一化公式。

## 八、面试题
问：组内白化与不白化相比有何收益？答：消除奖励绝对尺度影响，使不同难度问题梯度量级一致。

## 九、演进与趋势
引入长度归一化与分位数裁剪防止离群奖励主导优势。

## 十、小结
均值基线加白化是 GRPO 低方差的核心，工程上须防除零与离群。
