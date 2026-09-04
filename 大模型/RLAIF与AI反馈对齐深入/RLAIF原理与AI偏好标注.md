# RLAIF原理与AI偏好标注

> 对应 Lee 2023 RLAIF 与 Bai 2022 宪法AI。

## 一、背景与挑战
RLHF 依赖人类标注偏好，成本高、易瓶颈。RLAIF(RL from AI Feedback)用现成 LLM 生成偏好标签，大幅降低标注开销。

## 二、核心原理
给定问题 $x$ 与一对回答 $y_w,y_l$，用标注模型 $M$ 依据原则或指令判断优劣，得到偏好数据，再训练奖励模型或直接强化。

## 三、形式化与数学基础
AI 标注的偏好概率常由标注模型对数概率推出：
$P(y_w\succ y_l)=\sigma(r(x,y_w)-r(x,y_l))$
其中 $r$ 可由奖励模型给出，也可由 LLM 自评分数差近似。

## 四、代码实现
# 用 LLM 打分生成偏好
def ai_preference(prompt, a, b, judge):
    s_a = judge.score(prompt, a)
    s_b = judge.score(prompt, b)
    if s_a > s_b:
        return (a, b)   # (chosen, rejected)
    return (b, a)

## 五、与其他技术对比
RLAIF 替代人类标注但可能继承标注模型偏差；RLHF 质量高但贵。二者常混合使用。

## 六、常见误区
以为 AI 标注无偏——标注模型自身偏好会被放大；直接用自评分数当奖励易过优化。

## 七、与开源书/权威来源对应
Lee 2023 提出 RLAIF 并在摘要任务验证；Bai 2022 宪法AI给出原则式自标注；huggingface/trl 支持自定义 reward。

## 八、面试题
问：RLAIF 相比 RLHF 最大风险？答：标注模型偏差被强化循环放大，且缺乏人类价值校准。

## 九、演进与趋势
多模型委员会标注、人类在环校验关键样本。

## 十、小结
RLAIF 用 AI 标注换成本，但需警惕偏差传播，宜与少量人类数据混合。
