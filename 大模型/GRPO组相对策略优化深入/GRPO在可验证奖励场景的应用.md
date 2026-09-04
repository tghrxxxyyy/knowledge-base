# GRPO在可验证奖励场景的应用

> 对应 Shao 2024 GRPO 与 DeepSeek-R1 技术报告思路。

## 一、背景与挑战
数学与代码任务有客观判分(答案正确、单测通过)，可用可验证奖励(verifiable reward)替代奖励模型，规避奖励黑客。

## 二、核心原理
对问题 $q$ 采样 $G$ 个解答，用规则判分得到 $r_i\in\{0,1\}$ 或更细分数，再走标准 GRPO 更新。由于奖励来自环境而非可作弊的奖励模型，对齐更鲁棒。

## 三、形式化与数学基础
奖励函数 $R(q,o_i)$ 为确定规则：
$R(q,o_i)=\mathbb{I}[\text{verify}(o_i,q)]$
优势仍按组内归一化计算，目标沿用 GRPO 目标式。

## 四、代码实现
# 可验证奖励示例：数学答案匹配
import re

def extract_and_check(pred, gold):
    m = re.search(r"####\s*(-?\d+)", pred)
    if not m:
        return 0.0
    return 1.0 if m.group(1) == gold else 0.0

rewards = [extract_and_check(p, gold) for p in sampled]
adv = group_advantage(torch.tensor(rewards))

## 五、与其他技术对比
相比基于奖励模型的 RLHF，可验证奖励无奖励模型偏差但仅限可客观判分领域；常与格式奖励结合引导结构化输出。

## 六、常见误区
仅用 0/1 奖励导致信号稀疏；未对格式错误单独惩罚使模型学会乱答。

## 七、与开源书/权威来源对应
huggingface/trl 的 GRPO 支持自定义 reward 函数；Shao 2024 强调规则奖励在数学中的应用。

## 八、面试题
问：可验证奖励为何能缓解奖励黑客？答：奖励由不可微规则决定，策略无法在内循环内欺骗可训练奖励模型。

## 九、演进与趋势
多维度可验证奖励(正确性+简洁性+效率)与课程式难度调度。

## 十、小结
可验证奖励是 GRPO 最契合的场景，兼顾成本与抗作弊。
