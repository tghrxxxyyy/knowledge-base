# 宪法 AI 与 RLAIF

> 对应 Bai et al., *Constitutional AI: Harmlessness from AI Feedback*, 2022；与 Ouyang et al., NeurIPS 2022 的人类反馈路线对照。

## 一、背景与挑战

人类反馈在安全场景上尤其昂贵：标注者需长期暴露于有害内容，且不同标注者对边界的理解不一致，导致标签噪声高、不可复现。宪法 AI 的出发点是把「隐含在标注者脑中的规则」显式写成可审阅的原则清单，然后让模型依据这些原则自我批评与修订。

## 二、核心原理

两阶段。监督阶段（SL-CAI）：模型对有害提示先给出回答，再依据随机抽取的宪法原则对自己的回答做批评，最后据批评重写；用重写后的回答做 SFT。强化阶段（RL-CAI）：对同一提示的两个候选回答，让模型依据原则判断哪个更符合，从而生成偏好标签，再训偏好模型或直接做偏好优化。关键机制是「原则显式化」带来的三个好处：可审计（规则可被人审阅与版本化）、可扩展（标签生产不受人力限制）、可控（改规则即可调整边界，无需重标）。代价是把人类判断替换成了模型判断，模型的盲区会被系统性放大。

## 三、数学形式

设宪法原则集合 $\mathcal P$，AI 裁判在原则 $p\sim\mathcal P$ 下给出偏好概率 $q_p(y_1\succ y_2|x)$，聚合后的偏好标签为

$$q(y_1\succ y_2|x)=\mathbb E_{p\sim\mathcal P}\big[q_p(y_1\succ y_2|x)\big]$$

随后按 BT 似然训练奖励模型或直接做 DPO。由于 $q$ 是估计量，实际标签相当于真实偏好加上裁判偏差 $b$ 与噪声：$q=q^*+b+\varepsilon$，其中 $b$ 不随样本量减小——这是 RLAIF 与 RLHF 的本质差别。

## 四、代码实现

```python
import random

def cai_self_revision(model, prompt, principles, rounds=2):
    answer = model(prompt)
    for _ in range(rounds):
        p = random.choice(principles)
        critique = model(f"原则：{p}\n请指出下面回答违反该原则之处：\n{answer}")
        answer = model(f"原则：{p}\n批评：{critique}\n请据此重写回答，保持有帮助且安全：\n{answer}")
    return answer

def ai_preference_label(model, prompt, y1, y2, principles, k=5):
    votes = 0
    for p in random.sample(principles, k=min(k, len(principles))):
        v = model(f"原则：{p}\n问题：{prompt}\nA：{y1}\nB：{y2}\n哪个更符合该原则？只答 A 或 B。")
        votes += 1 if v.strip().upper().startswith("A") else 0
    return votes / k          # 多原则投票，降低单一原则的偏置
```

## 五、与其他对比

- 相对 RLHF：标签成本大幅降低、一致性更高、规则可审计；但引入不可随样本量消除的裁判偏差。
- 与 安全偏好数据构建：CAI 是其中最可规模化的一条数据来源。
- 与 奖励模型集成与不确定性：多原则投票在思想上等价于集成，降低单点偏置。

## 六、常见误区

- 原则写得过于抽象（如「要有帮助」），模型无法据此产生可区分的批评，修订流于形式。
- 只用单一原则生成全部标签，导致模型对该原则过拟合，其他风险面无改善。
- 完全去掉人工环节。人工抽检是发现裁判系统性盲区的唯一手段，必须保留采样比例。

## 七、与开源书对应

- mlabonne/llm-course（RLAIF 与对齐方法概览）：https://github.com/mlabonne/llm-course
- dair-ai/Prompt-Engineering-Guide（批评—修订类提示范式）：https://github.com/dair-ai/Prompt-Engineering-Guide

## 八、面试题

- 宪法 AI 的核心机制是什么？答：把安全规则显式化为原则清单，用模型依据原则自我批评、修订并生成偏好标签，替代大部分人工反馈。
- RLAIF 的偏差为什么不随数据量消失？答：偏差来自裁判模型自身的系统性倾向，与样本量无关，只能靠原则设计、多裁判与人工抽检缓解。

## 九、演进

人工安全标注 → 宪法原则显式化 → 自我批评与修订（SL-CAI） → AI 偏好标签（RL-CAI） → 多原则投票与人机混合裁判。

## 十、小结

宪法 AI 把安全边界从「标注者的默会知识」变成「可版本化的文本规则」，是安全对齐可规模化、可审计的关键一步，但必须保留人工校准回路。
