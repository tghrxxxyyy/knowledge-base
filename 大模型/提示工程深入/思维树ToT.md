# 思维树 Tree-of-Thoughts

> 对应 Yao et al., *Tree of Thoughts: Deliberate Problem Solving with LLMs*, 2023。

## 一、背景与挑战

Chain-of-Thought 是**线性**推理：一条思路走到底，一旦中途走偏便无法回头，且缺乏对不同可能性的探索。但许多真实任务（规划、搜索、博弈、需试错的谜题）需要**多条候选思路、评估、回溯与择优**。Tree-of-Thoughts（ToT）把推理组织成**树结构**，让模型像人一样「多想几条路、判断哪条更有希望、不行就退回来」，从而胜任需要探索与规划的难题。

## 二、核心原理

ToT 把问题求解建模为在树上的搜索：

- **节点（thought）**：一个「中间思考步骤」的状态；
- **扩展**：在某节点用模型生成多个候选下一步 thought（分支）；
- **评估（self-evaluation）**：让模型对每个候选打分或给「可行/可能/不可能」等标签，作为搜索启发；
- **搜索**：用 BFS 或 DFS 在树上推进，保留高分分支、剪枝低分、并可回溯；
- **终止**：到达能给出答案的节点，或搜索预算耗尽。

相比线性 CoT，ToT 引入了** deliberate search（有意识的搜索）**，用更多推理算力换取正确率。

## 三、形式化与数学基础

把状态空间视作树 $\mathcal T$，根 $s_0$ 为问题。转移由模型生成候选：

$$s' \sim P_\theta(\cdot\mid s),\qquad \text{每步采 } b \text{ 个分支}.$$

状态价值由模型自评 $V(s)\in[0,1]$ 或分类标签。BFS 维护宽度 $B$ 的 frontier，按 $V$ 排序保留前 $B$；DFS 沿高 $V$ 路径深入至叶或答案。最终答案：

$$\hat y = \arg\max_{s\in\text{leaves}} V(s)\ \text{s.t.}\ s\text{ 含答案}.$$

搜索预算（分支数 $b$、深度 $d$、宽度 $B$）控制推理开销，正确率随合理探索提升。

## 四、代码实现

概念伪代码（BFS 版）：

```python
frontier = [root]
for depth in range(max_depth):
    candidates = []
    for s in frontier:
        for _ in range(branch):
            candidates.append(expand(s))      # 模型生成下一步 thought
    scored = [(c, evaluate(c)) for c in candidates]   # 模型自评
    frontier = [c for c, v in top_k(scored, B) if v > threshold]
    if any(is_answer(s) for s in frontier):
        return best_answer(frontier)
```

每个 `expand` 与 `evaluate` 都是一次 LLM 调用，示例提示：

```text
已有思路：{state}
请给出 3 个可能的下一步思路，并分别用一句话说明可行性。
```

## 五、与其他技术对比

| 维度 | 直接答 | CoT | ToT |
|------|-------|-----|-----|
| 结构 | 无 | 链 | 树 |
| 搜索 | 无 | 无 | BFS/DFS |
| 回溯 | 否 | 否 | 是 |
| 成本 | 低 | 中 | 高 |
| 适用 | 简单 | 线性推理 | 探索/规划 |

## 六、常见误区

- **认为 ToT 总比 CoT 好**：成本高数倍，简单任务不值当，应看问题是否需探索。
- **自评不可靠当真值**：模型打分只是启发，需配合阈值与预算，非绝对正确。
- **分支/深度无上限**：会爆炸式耗 token，必须设预算。

## 七、与开源书·权威来源对应

- Yao et al., *Tree of Thoughts: Deliberate Problem Solving with LLMs*, 2023。
- Prompt-Engineering-Guide（ToT）：https://www.promptingguide.ai/zh/techniques/tot
- 基础：本系列「思维链 CoT」「ReAct 范式」。

## 八、面试题

- ToT 相比 CoT 解决了什么？何时该用 ToT？
- ToT 中的「评估」与「搜索」分别起什么作用？
- 为什么 ToT 成本高？如何控制预算？

## 九、演进与趋势

ToT 启发了 **Graph-of-Thoughts（图结构共享子思路）**、**Tree-of-Table/Code** 等；也与 ReAct 结合（边搜边用工具验证）、与自洽 CoT 结合（叶节点多采样）。在 Agent 规划、数学证明、代码生成中被广泛采用，是大模型「系统性思考」的代表范式。

## 十、小结

Tree-of-Thoughts 把推理从线性链升级为可分支、可评估、可回溯的树搜索，用模型自评做启发、BFS/DFS 做探索，显著增强需规划与试错的任务表现；代价是数倍推理成本，适合复杂探索型问题而非简单问答。
