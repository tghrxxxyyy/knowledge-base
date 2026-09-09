# 测试时计算 Test-Time Compute

> 对应 Snell et al.(2024, "Scaling LLM Test-Time Compute") 与 OpenAI o1 类工作。

## 一、背景与挑战

传统 scaling law 关注训练算力与参数量。但 Snell 等人（2024）指出：在困难任务上，**增加推理阶段的计算量（test-time compute）** 带来的准确率提升，可能超过同等地增大模型参数。这意味着「聪明地花更多时间思考」与「用更大的模型」之间存在可替代性。挑战在于：单纯多采样并不自动变好，必须配合可靠的「判断对错」机制（verifier），否则只是把错误答案多生成几遍，浪费算力且可能放大错误答案的出现概率。

## 二、核心原理

测试时计算指推理阶段通过更多采样、搜索或验证来提升质量。其收益可理解为：

$$
\text{质量} = f(\text{模型能力}, \text{推理计算量}, \text{验证器质量})
$$

两种典型用法：

- **并行搜索（best-of-n / 自洽性）**：采样 $n$ 条，用 verifier 或投票选最优。
- **顺序搜索（树/迭代修正）**：逐步展开、评估、回溯，把思考预算花在探索好路径上。

关键结论：在难样本上，分配更多 test-time compute 的边际收益高于加参数；而在易样本上，继续加计算收益递减。因此「按难度动态分配思考预算」是核心思想，而非对所有问题无差别多想。

### 工程落地要点

- **验证器选型**：数学用结果解析校验、代码用执行、开放题用奖励模型或 LLM-judge，按域选 verifier。
- **预算分级**：简单题 best-of-4、难题 best-of-16/32，用路由动态定 n，避免一律大 n。
- **并行与异步**：best-of-n 可并行采样，搜索树可分批扩展，配合批处理提吞吐。
- **早停机制**：verifier 已高置信选出优解时可提前终止剩余采样，省算力。
- **与 RL 协同**：后训练让模型学会「何时多想、何时停」，比固定预算更省。
- **成本护栏**：设单请求最大 token 与超时，防止难题把 test-time compute 烧穿预算。

## 三、形式化与数学基础

设对 prompt $x$ 采样 $n$ 条候选 $y_1,\dots,y_n$，由验证器给分 $v(y_i)$，best-of-n 取：

$$
\hat y = \arg\max_{i} v(y_i)
$$

若单条正确率 $p$，验证器把正确项排第一的概率近似为 $1-(1-p)^n$（理想 verifier）。更一般地，顺序搜索在树中扩展节点，每层用值函数 $V$ 剪枝：

$$
\text{选路：} a^* = \arg\max_{a} V(\text{child}(s,a))
$$

计算预算 $C$ 与最终错误率 $\epsilon$ 常呈幂律下降：$\epsilon(C)\propto C^{-\alpha}$，直到受模型能力上限约束，再多预算也无济于事。

## 四、代码实现

best-of-n 配合 verifier（如数学用结果校验）：

```python
import random
def best_of_n(problem, n, verifier):
    cands = [llm.generate(problem) for _ in range(n)]
    scored = [(verifier(c, problem), c) for c in cands]
    scored.sort(reverse=True, key=lambda t: t[0])
    return scored[0][1]          # 取验证分最高者

# verifier 可为：答案数值可解析校验 / 代码执行 / 奖励模型打分
correct = best_of_n(math_q, n=8, verifier=check_answer)
```

## 五、与其他技术对比

| 维度 | 增大模型 | 测试时计算 |
|------|----------|------------|
| 成本类型 | 训练/部署贵 | 推理贵 |
| 收益曲线 | 幂律放缓 | 难样本上更陡 |
| 可控性 | 固定 | 按难度调预算 |
| 依赖 | 数据/算力 | 验证器质量 |

## 六、常见误区

- **以为多采样必变好**：没有好 verifier，多数投票在难题上仍会选错。
- **忽视延迟**：test-time compute 直接拉长响应时间，需用户容忍或异步处理。
- **预算均摊**：对简单题也花大预算是浪费，应路由分流。
- **验证器永对**：verifier 自身有误，可能把错误答案评为最高分。
- **与训练无关**：RL 训练可显著提升模型「善用 test-time compute」的能力。

## 七、与开源书·权威来源对应

- Snell, Brown, et al., *Scaling LLM Test-Time Compute Optimally Can be More Effective than Scaling Parameters*, 2024。
- 与「过程奖励与结果奖励」「链式与树式搜索」「GRPO」章节联动。

## 八、面试题

1. 为何 test-time compute 的效果高度依赖验证器（verifier）？
2. 在何种任务上「加推理计算」比「加参数」更划算？
3. best-of-n 的失效场景有哪些？
4. 为何「按难度分配思考预算」优于统一大预算？

## 九、演进与趋势

从 best-of-n、自洽性（self-consistency）演进到「学习式验证器 + 自适应预算」：用 PRM 做逐步剪枝，用路由器决定每个问题该花多少 token。o1 类模型把 test-time compute 内化为「思考时长」超参。未来可能训练「计算预算调度器」，在延迟-准确率 Pareto 前沿上自动寻优，并结合工具调用把搜索外部化。

## 十、小结

测试时计算揭示了一条与参数量互补的 scaling 路径：在难任务上，多花推理算力（搜索、验证、修正）可换取高于加参数的准确率提升。其成败系于验证器质量——没有可靠判官，更多采样只是重复错误。工程上应以难度路由动态分配思考预算，在成本与质量间取得平衡，而非盲目堆叠采样数。
