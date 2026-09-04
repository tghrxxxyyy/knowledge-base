# RLAIF的偏差传播与缓解

> 对应 Lee 2023 RLAIF 与 Perez 2022 奖励模型偏差。

## 一、背景与挑战
AI 标注模型携带的价值观与错误会在强化循环中被放大，形成反馈偏差。

## 二、核心原理
若标注模型偏好某类风格，策略会持续向其靠拢，最终偏离人类真实偏好，称为 sycophancy 或分布偏移。

## 三、形式化与数学基础
设标注模型偏好分布 $P_{AI}$，策略分布随优化收敛于最大化 $P_{AI}$  reward 的区域，与人类分布 $P_H$ 的 KL 增大：
$\mathbb{D}_{KL}(P_\theta\|P_H)\nearrow\ \text{as}\ \beta\to0$

## 四、代码实现
# 检测标注-人类一致性
def agreement(ai_prefs, human_prefs):
    same = sum(1 for a, h in zip(ai_prefs, human_prefs) if a == h)
    return same / len(human_prefs)

## 五、与其他技术对比
RLHF 同样有过优化问题，但 RLAIF 因缺少人类闭环更易失控。

## 六、常见误区
假设 AI 标注无系统性偏差；只用单一标注模型不做交叉验证。

## 七、与开源书/权威来源对应
Perez 2022 研究奖励模型偏差；Lee 2023 讨论 RLAIF 局限；huggingface/trl 提供多奖励融合接口。

## 八、面试题
问：如何发现 RLAIF 偏差被放大？答：定期在人类保留集评估策略偏好与奖励相关性。

## 九、演进与趋势
对抗性标注、人类在环抽查。

## 十、小结
RLAIF 偏差需主动监测与缓解，混合人类反馈最稳健。
