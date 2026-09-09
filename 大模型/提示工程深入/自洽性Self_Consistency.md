# 自洽性 Self-Consistency

> 对应 Wang et al., *Self-Consistency Improves Chain of Thought Reasoning*, 2022（arXiv:2203.11171）。属提示工程深入板块，是思维链 CoT 的集成式增强。

## 一、背景与挑战

零样本或单条思维链（Chain-of-Thought, CoT）提示在面对算术、常识与符号推理任务时，仍会因单条推理路径的随机性而犯下可避免的错误。人类解难题时往往「换一种思路再算一遍」，多条路径若指向同一答案，则可信度更高。自洽性（Self-Consistency, SC）正是把这一直觉形式化的解码策略：用**高温采样**生成多条不同的推理路径，再对最终答案做**多数投票**，而非只贪心取单条最优路径。它不改变模型权重，也不修改提示，仅在推理解码阶段工作，因此是一种「即插即用」的免训练增强方法。

## 二、核心原理

自洽性的执行分三步：
1. **多样采样**：对同一问题，用非零温度（如 $T=0.7$）配合解码参数（top-$k$、top-$p$）生成 $k$ 条（常见 $k=5\sim40$）带 CoT 的回答，鼓励推理路径发散。
2. **答案抽取**：用正则或解析器从每条回答中提取最终答案（数字、选项、表达式等），无法解析的视为无效。
3. **多数投票**：统计答案出现频次，取频率最高的作为最终输出；平票时可退回语义一致性或最长推理链裁决。

其有效性建立在一个经验事实：正确推理路径虽然多样，但往往**收敛到相同答案**；错误路径则彼此分散。因此答案的「一致性」成为正确性的代理信号。

## 三、形式化与数学基础

设问题为 $q$，模型策略为 $\pi_\theta$，采样得到路径集合 $\{z_i\}_{i=1}^{k}$，其中每条 $z_i$ 含推理过程与最终答案 $a_i=\text{ans}(z_i)$。最终预测为：

$$
\hat{a} = \underset{a}{\arg\max} \sum_{i=1}^{k} \mathbb{I}\big[\text{ans}(z_i)=a\big]
$$

其中 $\mathbb{I}[\cdot]$ 为指示函数。若引入路径置信度 $p_i=P_\theta(a_i\mid q,z_i)$，可加权投票：

$$
\hat{a} = \underset{a}{\arg\max} \sum_{i:\, \text{ans}(z_i)=a} \log p_i
$$

温度控制路径多样性：$\text{熵}(\{a_i\})$ 随 $T$ 升高而增大，过低则路径雷同、投票失效，过高则引入噪声。经验上需权衡「多样性」与「质量」。

## 四、代码实现

```python
import re
from collections import Counter

def extract_answer(text: str):
    # 抽取最后一个 "答案是 X" / 行尾数字
    m = re.findall(r"(-?\d+(?:\.\d+)?)", text)
    return m[-1] if m else None

def self_consistency(ask_fn, question: str, k: int = 10, temperature: float = 0.7):
    answers = []
    for _ in range(k):
        resp = ask_fn(question, temperature=temperature)  # 返回带 CoT 文本
        ans = extract_answer(resp)
        if ans is not None:
            answers.append(ans)
    if not answers:
        return None
    # 多数投票，平票回退到出现顺序的首个
    return Counter(answers).most_common(1)[0][0]
```

实际工程中可并行采样并用批处理降低时延，并以 `logprob` 做加权裁决。

## 五、与其他技术对比

| 方法 | 是否改权重 | 推理成本 | 适用任务 | 可靠性 |
|------|-----------|---------|---------|--------|
| 贪心 CoT | 否 | 1× | 通用 | 中 |
| 自洽性 SC | 否 | $k$× | 算术/符号推理 | 高 |
| 集成微调 | 是 | 1×（训练贵） | 通用 | 高 |
| 提示链 | 否 | 多调用 | 复杂分解 | 中高 |

SC 在 GSM8K、MATH、StrategyQA 等任务上相对单条 CoT 普遍提升数个到十余个百分点，但对开放式生成、主观写作帮助有限。

## 六、常见误区

- 认为「采样越多越好」：成本线性增长，到一定 $k$ 后边际收益骤减，需按任务调参。
- 用贪心（$T=0$）采样：路径高度雷同，投票退化为单条。
- 忽视答案抽取鲁棒性：抽取失败会把正确路径丢弃，建议用结构化输出或约束解码配合。
- 在不需要「唯一正确答案」的任务（如创作）上强行投票，反而抹平多样性。

## 七、与开源书·权威来源对应

- Wang et al., *Self-Consistency Improves Chain of Thought Reasoning*, 2022（arXiv:2203.11171）。
- Wei et al., *Chain-of-Thought Prompting*, 2022（SC 的基础 CoT）。
- 开源实践：llm-course（mlabonne）、Prompt-Engineering-Guide 的「Self-Consistency」章节。

## 八、面试题

- 自洽性为何通常优于单条 CoT？其正确性假设是什么？
- 它的代价与收益如何权衡？什么任务上收益有限？
- 若多条路径答案平票，有哪些合理的裁决策略？
- 自洽性与模型集成（ensemble）的本质区别在哪里？

## 九、演进与趋势

SC 催生了一系列「采样+聚合」变体：如将投票对象从答案延伸到「推理步骤」的一致性、与蒙特卡洛树搜索（MCTS）结合、在 Agent 规划中做多轨迹投票。近期工作也探索用奖励模型对路径重排序以替代简单多数。其与「推理时计算（inference-time scaling）」思潮高度契合——在推理阶段投入更多算力换取质量，已成为 o1/R1 类推理模型的重要底层思想之一。

## 十、小结

自洽性是一种免训练、仅靠解码阶段多样采样与多数投票即可显著提升推理可靠性的方法。它把「多条思路汇聚」这一人类直觉形式化，代价是 $k$ 倍推理成本，收益在数学与符号推理上最为显著。工程落地需关注采样温度、答案抽取与成本预算的平衡。
