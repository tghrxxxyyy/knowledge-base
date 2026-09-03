# Voyager具身探索

> 对应 Wang et al., *Voyager: An Open-Ended Embodied Agent with Large Language Models*, 2023（TMLR）。

## 一、背景与挑战

开放世界没有固定任务列表，智能体需要自己提出目标、积累技能并长期进步。
挑战在于目标应与当前能力匹配（太难则永远失败，太易则无成长），且已掌握技能要可复用而非每次重学。

## 二、核心原理

- 自动课程：依据当前状态与库存提出「恰好够难」的下一个目标，形成渐进课程。
- 技能库：把成功的解法沉淀为可执行代码（带描述与向量索引），后续任务通过检索复用与组合。
- 迭代提示机制：用环境反馈、执行异常与自我验证结果反复修正生成的技能代码，直到通过验证。

## 三、数学形式

课程选择可形式化为在成功概率适中处取样：$g^*=\arg\max_g\ \mathbb E[\,\Delta\text{skill}\,]$，近似取 $P(\text{succeed}\mid g)\in[p_l,p_h]$ 的中等难度区间。

技能复用把新任务成功率写为 $P=\!\!\sum_{k}P(\text{retrieve }k)P(\text{succeed}\mid k)$，技能库覆盖度直接抬升上限。

## 四、代码实现

```python
def voyager_loop(llm, env, skills, rounds=50):
    for _ in range(rounds):
        goal = llm.propose_task(env.state(), skills.summary())   # 自动课程
        code = llm.write_skill(goal, retrieved=skills.search(goal, k=3))
        for _ in range(3):                                       # 迭代修正
            ok, err = env.run(code)
            if ok:
                skills.add(goal, code); break
            code = llm.fix(code, err, env.state())
```

## 五、与其他对比

- 与强化学习探索：RL 用内在奖励驱动探索并把技能存进权重；Voyager 用语言提出目标、把技能存成代码，可解释可编辑。
- 与 Reflexion：Reflexion 沉淀语言教训，Voyager 沉淀可执行代码，后者复用性更强但要求环境有编程接口。

## 六、常见误区

- 技能库只存代码不存描述与前置条件，检索命中率低且组合易失败。
- 自动课程缺少难度反馈，反复提出无法完成的目标造成空转。
- 不做技能回归验证，环境或依赖变化后旧技能静默失效。

## 七、与开源书对应

- dair-ai/Prompt-Engineering-Guide（代码生成与迭代提示技巧）：https://github.com/dair-ai/Prompt-Engineering-Guide
- mlabonne/llm-course（Agent 与代码生成实践）：https://github.com/mlabonne/llm-course

## 八、面试题

- 为什么把技能存成代码优于存成文本经验？答：代码可直接执行与组合、可单测回归，复用时不依赖模型重新理解自然语言描述。
- 自动课程如何设定难度？答：以当前能力下成功概率处于中等区间为准，过高或过低都不产生学习增量。

## 九、演进

固定任务列表 → 内在动机探索 → 语言驱动自动课程 → 可执行技能库与检索复用 → 技能回归与版本治理。

## 十、小结

Voyager 给出开放世界智能体范式：自出题、写技能、存代码、可复用，成长被显式沉淀。
