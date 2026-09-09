# 自动提示工程 APE

> 对应 Zhou et al., *Large Language Models Are Human-Level Prompt Engineers (APE)*, 2022。

## 一、背景与挑战

手写提示依赖经验与反复试错，费时且难保证最优。当任务规模变大、需要对齐稳定指标时，人工调 prompt 的可扩展性差。自动提示工程（Automatic Prompt Engineer, APE）把「找好提示」本身变成**可自动搜索的优化问题**：用模型生成候选指令、在验证集上量化评分、选最优并可迭代，把提示工程从手艺变为可复现的工程方法。

## 二、核心原理

APE 的流程是一个「生成—评估—选优」循环：

1. **生成候选（propose）**：给模型若干输入/输出样本，让它产出一批候选任务指令（prompt 候选）；
2. **评估（score）**：把每个候选 prompt 套用到验证集，汇总任务指标（准确率、F1、奖励等）得分数；
3. **选优（select）**：按分数排序，保留 Top-K；
4. **迭代（refine）**：可让模型基于「高分候选 + 失败样例」再生成改进版，循环直至收敛。

APE 与后来的 **OPRO（用模型做优化器）**、**DSPy（把提示当可训练参数）** 一脉相承，都是「提示即程序、可优化」的思想。

## 三、形式化与数学基础

设候选提示空间 $\mathcal P$，验证集 $\mathcal D=\{(x_i,y_i^*)\}$，模型 $M$，指标 $f$。APE 求：

$$p^* = \arg\max_{p\in\mathcal P}\ \frac{1}{|\mathcal D|}\sum_{(x,y^*)\in\mathcal D} f\big(M(y\mid p,x),\,y^*\big).$$

因 $\mathcal P$ 巨大，APE 用模型采样近似搜索：$p_{k+1}\sim M(\cdot\mid \text{top-}K(p_k), \text{failures})$。目标函数可含正则（如长度、成本），形成受约束优化。这与强化学习中「策略搜索」同构，只是策略即自然语言提示。

## 四、代码实现

概念伪代码：

```python
def ape(model, train, valid, iters=3):
    candidates = model.propose_prompts(train, n=10)   # 生成候选指令
    for _ in range(iters):
        scored = [(p, eval_on(valid, p)) for p in candidates]
        scored.sort(key=lambda t: t[1], reverse=True)
        top = [p for p, _ in scored[:3]]
        fails = collect_failures(valid, top[0])
        candidates = model.refine(top, fails, n=10)    # 基于高分+失败再生成
    return best(scored)

def eval_on(dataset, prompt):
    return mean(f(model(x|prompt), y_star) for x, y_star in dataset)
```

DSPy 风格（把提示当模块参数，以官方 API 为准）：

```python
import dspy
gen = dspy.Predict("question -> answer")
# 用 optimizer 在带标注数据上自动搜最优指令与示例
optimizer = dspy.BootstrapFewShot(metric=accuracy)
compiled = optimizer.compile(gen, trainset=trainset)
```

## 五、与其他技术对比

| 方法 | 是否自动 | 需标注 | 输出 |
|------|---------|-------|------|
| 人工提示 | 否 | 否 | 手写文本 |
| APE | 是 | 是（验证集） | 优化后指令 |
| OPRO | 是 | 是 | 优化后指令 |
| DSPy | 是 | 是 | 可编译管线 |

## 六、常见误区

- **以为 APE 不需要验证集**：没有可量化评分就无法客观选优，验证集是前提。
- **把高分候选当永久最优**：数据分布漂移或换模型后需重搜。
- **忽略成本**：多轮生成+评估消耗大量 token，应设预算与早停。
- **混淆 APE 与微调**：APE 不改权重，只优化输入提示。

## 七、与开源书·权威来源对应

- Zhou et al., *Large Language Models Are Human-Level Prompt Engineers (APE)*, 2022。
- OPRO（Google, *Large Language Models as Optimizers*, 2023）。
- DSPy：https://github.com/stanfordnlp/dspy
- 基础：本系列「提示工程基础与原则」。

## 八、面试题

- 自动提示工程为何需要验证集？没有会怎样？
- APE 与人工提示工程的本质区别？与微调的区别？
- APE 如何迭代改进候选提示？

## 九、演进与趋势

APE 演化为「提示优化」子系统：OPRO 用 LLM 当优化器迭代出指令；DSPy 把提示/示例编译进可训练管线；生产平台内置「提示评测 + 自动搜索」。与 **RLHF/DPO** 思路呼应——都是用可量化奖励驱动自然语言策略优化。

## 十、小结

自动提示工程（APE）把「找好提示」形式化为可自动搜索的优化问题：模型生成候选指令、在验证集上量化评分、选优并迭代，使提示工程从人工试错变为可复现工程；前提是具备可量化评估的验证集，且需控制搜索成本。
