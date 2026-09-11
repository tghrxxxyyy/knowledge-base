# 思维链提示与零样本CoT

> 对应 Wei 2022 chain-of-thought prompting 与 Brown 2020 in-context learning。

## 一、背景与挑战

大模型面对多步推理题直接给答案准确率低，因为一次性解码难以在内部完成多步搜索。few-shot 与零样本提示技术通过诱导模型显式展开中间步骤，把复杂推理拆成可逐步生成、可校验的链，从而显著提升复杂题表现。Brown 2020 奠定的少样本学习是 few-shot CoT 的基础。难点在于：示范的质量直接决定效果，弱示范会带偏格式；零样本触发句对模型规模敏感，小模型常无效；且在非推理类任务上 CoT 可能无增益甚至因「过度思考」而下降。

## 二、核心原理

- few-shot CoT：在提示中给出若干「问题—推理链—答案」示范，模型模仿该格式展开推理。
- 零样本 CoT：不提供示范，仅追加一句「Let us think step by step.」触发链式生成。零样本 CoT 成本低、通用性强，但要生效依赖模型已具备推理能力。
- 二者都把答案生成分解为步骤条件概率的链式分解。工程上可混合：用少量示范定格式，用触发句保通用，并对超长链做截断与校验。还可配合「先规划后执行」等进阶提示策略提升稳定性。

## 三、形式化与数学基础

引入推理链 $z=(z_1,\dots,z_T)$，答案生成分解为：

$$
P(y\mid x)=P(z\mid x)\,P(y\mid x,z)\approx\prod_{t=1}^{T}P(z_t\mid x,z_{<t})\,P(y\mid x,z)
$$

零样本 CoT 通过固定后缀 $p=$「Let us think step by step.」改变条件分布：

$$
P_{\text{CoT}}(y\mid x)=P(y\mid x\oplus p)
$$

其中 $\oplus$ 表示拼接。few-shot 则把示范集合 $D$ 纳入上下文：

$$
P_{\text{fs}}(y\mid x)\approx P(y\mid x, D)
$$

当示范链质量高且与目标题同分布时，$P_{\text{fs}}$ 的推理质量显著优于直接回答。

## 四、代码实现

```python
def cot_generate(model, q, prompt_suffix="\nLet us think step by step."):
    # 零样本 CoT 触发链式生成
    full = q + prompt_suffix
    return model.generate(full, max_new_tokens=512)

def few_shot_cot(model, demos, q):
    # demos: [(q_i, chain_i, ans_i)] 示范
    ctx = "\n".join(f"Q:{d[0]}\nA:{d[1]} answer: {d[2]}" for d in demos)
    return model.generate(ctx + "\nQ:" + q + "\nA:", max_new_tokens=512)

def build_prompt(q, demos=None, zero_shot=True):
    # 混合策略: 有示范走 few-shot, 否则零样本
    if demos:
        return few_shot_cot(None, demos, q)
    return cot_generate(None, q)
```

## 五、与其他技术对比

| 方式 | 直接回答 | few-shot CoT | 零样本 CoT |
| --- | --- | --- | --- |
| 准确率 | 低 | 高 | 中高 |
| 成本 | 低 | 高(示范) | 低 |
| 可解释 | 弱 | 强 | 强 |
| 模型依赖 | 无 | 中 | 强(需大模型) |

## 六、常见误区

- 认为 CoT 对所有任务都有效：简单模式匹配或纯知识题增益有限甚至为负。
- 忽略推理链错误累积：一步错后续全错。
- 把触发句当万能：弱模型零样本 CoT 可能生成无效链。
- 示范格式不一致：few-shot 中示范链风格混杂会降低稳定性。
- 对无推理需求的题也加 CoT：徒增时延与成本。

## 七、与开源书·权威来源对应

- Wei 2022《Chain-of-Thought Prompting》首次系统展示 CoT 增益与零样本变体。
- Brown 2020《Language Models are Few-Shot Learners》奠定少样本基础。
- 进阶提示（如 self-consistency）可参考本板块其他文档。

## 八、面试题

- 零样本 CoT 为何能起作用？哪些任务无效？
- few-shot 与零样本 CoT 的工程取舍？
- 为什么示范质量对 few-shot CoT 影响巨大？哪些任务不适合加 CoT？

## 九、演进与趋势

从手动示范到自动推理路径搜索、验证器筛选与「调优版」推理提示（如 self-consistency、隐式 CoT），降低对人工示范依赖。提示工程逐渐自动化，CoT 触发句也被更鲁棒的变体替代，并结合检索增强提供事实依据。

（补充续）零样本 CoT 的脆弱点在于触发句依赖：不同说法（「请一步步想」与「Let's think step by step」）效果差异明显，且对多语、低资源语言不稳定。生产环境建议把触发句纳入提示模板的 A/B 测试，固定最优表述并监控其随模型版本的变化。

few-shot CoT 则需防范「示范污染」：若示范恰好覆盖测试分布，评测会高估泛化。稳健做法是用与下游分布错位的示范，或采用检索式动态示范，让每一步推理都能引用支撑事实。

## 十、小结

CoT 是释放大模型推理潜力的关键提示技术：以链式分解把复杂推理外化，few-shot 更强、零样本更省，需按任务与成本选择。示范质量与模型规模共同决定其成败，非推理任务应谨慎使用。
