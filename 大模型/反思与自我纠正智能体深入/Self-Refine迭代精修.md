# Self-Refine迭代精修

> 对应 Madaan et al., *Self-Refine: Iterative Refinement with Self-Feedback*, NeurIPS 2023。

## 一、背景与挑战

很多生成任务（改写、代码可读性、对话回应）没有唯一正确答案，也没有现成验证器，但人类明显能通过多轮打磨提升质量。
Self-Refine 探索的是：同一个模型既当作者又当审稿人，能否在无监督、无额外训练的情况下逐轮提升输出。

## 二、核心原理

- 流程为 生成 → 自反馈 → 精修，三步用同一模型不同提示实现，循环直到反馈判定无需修改或达到轮数上限。
- 反馈必须具体且可执行（指出哪句冗余、哪个变量命名不清），泛泛的「可以更好」无法驱动有效修订。
- 该方法在偏好型、风格型任务上收益明显；在需要事实或逻辑正确性的任务上，缺乏外部信号时收益不稳定。

## 三、数学形式

设质量函数 $Q$，迭代过程期望满足 $Q(y^{(k+1)})\ge Q(y^{(k)})$，但实际只有噪声估计 $\hat Q$。

单调性只有在 $\hat Q$ 与 $Q$ 正相关且修订被 $\hat Q$ 门控时才近似成立；否则迭代成为随机游走，$\mathbb E[Q(y^{(k)})]$ 可能随 $k$ 下降。

## 四、代码实现

```python
def self_refine(llm, task, k=3):
    y = llm(f"完成任务: {task}")
    for _ in range(k):
        fb = llm(f"任务: {task}\n草稿: {y}\n列出3条具体可改之处，若无则输出OK")
        if fb.strip().startswith("OK"):
            break
        y = llm(f"任务: {task}\n草稿: {y}\n反馈: {fb}\n据反馈重写")
    return y
```

## 五、与其他对比

- 与 Reflexion：Self-Refine 在单个样本内部打磨输出；Reflexion 跨试次改进策略，面向决策任务。
- 与 best-of-N 采样：best-of-N 依赖排序器挑最好的一个，Self-Refine 试图把同一个改到更好，二者可叠加（先精修再择优）。

## 六、常见误区

- 让模型「自评分」再据分数改：自评分校准差，容易在高分自满或反复摇摆。
- 不保留历史版本，最后一轮变差就无法回退；应把各轮候选一起做最终择优。
- 在数学与事实任务上高期待：这类任务需要计算器、检索或测试等外部裁判。

## 七、与开源书对应

- dair-ai/Prompt-Engineering-Guide（自我反馈与迭代提示）：https://github.com/dair-ai/Prompt-Engineering-Guide
- datawhalechina/llm-universe（生成质量与提示工程实践）：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Self-Refine 为什么在写作类任务更有效？答：这类任务的质量维度（清晰、简洁、结构）模型能可靠识别，自反馈与真实质量相关性高。
- 如何避免越改越差？答：保留全部轮次候选并最终择优，同时用门控条件（有具体证据才改）限制无谓修订。

## 九、演进

单次生成 → 固定模板润色 → 自反馈迭代（Self-Refine）→ 外部裁判混合反馈 → 多候选精修加择优。

## 十、小结

Self-Refine 的适用边界由自反馈的可信度划定：主观质量维度收益稳定，客观正确性需要外部裁判。
