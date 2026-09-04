# RLAIF与RLHF对比分析

> 对应 Lee 2023 RLAIF 与 Ouyang 2022 InstructGPT。

## 一、背景与挑战
实践中需权衡成本、质量与可扩展性，明确 RLAIF 与 RLHF 的边界。

## 二、核心原理
RLHF：人类标注偏好→训练奖励模型→PPO 优化。RLAIF：AI 模型标注→训练奖励模型或直接偏好优化，省去人类标注环节。

## 三、形式化与数学基础
两者最终都优化带 KL 约束的策略目标：
$\max_\theta\mathbb{E}_{x\sim D}[\mathbb{E}_{y\sim\pi_\theta}[r(x,y)]]-\beta\mathbb{D}_{KL}(\pi_\theta\|\pi_{ref})$
区别仅在 $r$ 的获取方式。

## 四、代码实现
# 统一训练循环，仅数据来源不同
def train(prefs, optimizer):
    for x, yw, yl in prefs:        # 人类或AI生成
        loss = dpo_loss(model, x, yw, yl)
        loss.backward(); optimizer.step()

## 五、与其他技术对比
RLAIF 扩展性优、质量略逊；RLHF 质量高、成本高。DPO 可基于任一类偏好数据训练。

## 六、常见误区
认为 RLAIF 完全不需要人类——关键安全样本仍建议人工；忽视标注模型与策略模型同源导致的自偏好。

## 七、与开源书/权威来源对应
Ouyang 2022 InstructGPT 描述 RLHF 流水线；Lee 2023 对比 RLAIF 与 RLHF 效果。

## 八、面试题
问：何时优先 RLAIF？答：标注预算有限且任务目标可由强模型可靠评判时。

## 九、演进与趋势
混合数据配比搜索、课程式从 AI 到人类标注过渡。

## 十、小结
RLAIF 与 RLHF 共享优化框架，差异在标注来源，混合使用最务实。
