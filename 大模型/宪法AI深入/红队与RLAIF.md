# 红队数据与RLAIF

> 对应 Bai et al., 2022 中 RLHF via AI Feedback（RLAIF）。

## 一、背景与挑战

人类红队成本高、覆盖窄；需以 AI 生成对抗样本与偏好标签扩规模。

## 二、核心原理

用一模型生成有害红队提示，另一模型据宪法判分并给出偏好对；以 AI 反馈训练奖励模型，再 PPO 微调，减少人类标注占比。

## 三、数学形式

AI 偏好概率 $\hat P(y_w\succ y_l)=\sigma(r_{AI}(x,y_w)-r_{AI}(x,y_l))$；整体目标同标准 RLHF。

## 四、代码实现

```python
red = redteam_llm(prompt)
pref = judge(cons, red_a, red_b)
rm.train_on(pref)
```

## 五、与其他对比

- 与 奖励模型深入（人类反馈 RM）对照数据来源。
- 与 安全红队深入（若新增）共享攻防思路。

## 六、常见误区

- AI 反馈自我强化偏见（模型偏好像自己的回答）。
- 红队提示分布窄致过拟合特定攻击。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- RLAIF 风险？答：AI 判分可能放大自身偏见，需人类校验与多样性。

## 九、演进

人类红队 → AI 红队+AI 判分 → 混合反馈。

## 十、小结

RLAIF 以模型替代部分人类反馈，扩规模但须防偏见自循环。
