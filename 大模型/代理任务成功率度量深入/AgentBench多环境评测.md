# AgentBench多环境评测

> 对应 Liu et al. 2023 "AgentBench: Evaluating LLMs as Autonomous Agents"。

## 一、背景与挑战

单一环境难全面评代理。AgentBench 统一 8 类环境（OS、DB、知识、卡牌、网络、游戏等），用统一接口测跨环境能力。

## 二、核心原理

每环境有专属任务与验证，汇总为环境级成功率与总体分。揭示模型在"推理型"与"交互型"环境的差异。

## 三、数学形式

总体分（平均）：

$$
S=\frac{1}{E}\sum_{e}\mathrm{SR}_e
$$

跨环境一致性：

$$
\kappa=\frac{2}{E(E-1)}\sum_{e<e'}\mathbf{1}[\mathrm{sign}(\Delta_{ee'})]
$$

## 四、代码实现

```python
def overall(env_scores):
    return sum(env_scores)/len(env_scores)

print(round(overall([0.8,0.6,0.3,0.9]),3))
```

## 五、与其他对比

相比 WebArena/ToolBench 单环境，AgentBench 跨环境综合；相比静态基准，它强调自主决策。

## 六、常见误区

误区一：总分高即全能（可能偏科）。误区二：忽略环境难度差。误区三：跨版本直接比。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：AgentBench 价值？答：统一多环境接口综合评代理能力。
- Q：为何看环境分项？答：揭示推理型 vs 交互型能力错位。

## 九、演进

AgentBench 奠定多环境代理评测框架，后续 GAIA 等补真实任务。

## 十、小结

AgentBench 以多环境统一协议，把代理能力拆解为可比较的维度。
