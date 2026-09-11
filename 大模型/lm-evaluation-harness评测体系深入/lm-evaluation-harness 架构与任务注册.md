# lm-evaluation-harness 架构与任务注册

> 对应 Gao et al. 2021 lm-evaluation-harness（EleutherAI）论文与官方仓库（EleutherAI/lm-evaluation-harness）。

## 一、背景与挑战

大模型评测长期面临碎片化：每个基准（MMLU、GSM8K、HellaSwag…）各有数据格式、few-shot 构造、生成与计分逻辑，研究者常各自写脚本，导致（1）结果不可比——提示模板、采样参数、分词差异都会改变分数；（2）难以复现——缺少统一入口与版本锁定；（3）新模型接入成本高。lm-evaluation-harness（下称 harness）的出现正是为了用统一抽象把「任务」标准化，让不同模型、不同后端在一致协议下被公平评测。

挑战在于：抽象既要足够通用以覆盖百余个任务，又要足够灵活以容纳各任务的特异性（如 CoT、多选、生成式自由作答），同时还需保证可复现与高性能。

## 二、核心原理

harness 的核心抽象是 `Task`：每个任务封装四件事——数据加载（dataset）、few-shot 上下文构造、推理请求生成、结果处理与指标计算。上层的 `Evaluator`/`TaskManager` 负责调度：遍历任务、把文档送进生成接口、收集结果、调用各任务的 aggregation 函数汇总，并输出统一报告。

关键解耦点：

1. 任务与模型解耦：模型只需实现 `generate`/`loglikelihood` 等接口，任务不关心后端。
2. 指标与聚合解耦：任务声明 `aggregation`（如 mean）与 `higher_is_better`，evaluator 统一规约。
3. 缓存：已完成样本的结果可缓存复用，避免重复昂贵推理。

## 三、形式化与数学基础（含 LaTeX）

以最基础的准确率指标为例，样本级 0/1 指示聚合为：

$$
\text{Acc}=\frac{1}{N}\sum_{i=1}^{N}\mathbb{1}[\hat{y}_i=y_i]
$$

对多项选择（loglikelihood 路线），对每个候选 $c$ 计算似然，取最大：

$$
\hat{c}=\arg\max_{c\in\mathcal{C}}\log P(c\mid \text{context})
$$

任务综合分可由各子指标加权：

$$
M=\sum_{t} w_t M_t,\quad \sum_t w_t=1
$$

harness 把上述契约固化到 Task 接口，使分数定义与计算可审计。

## 四、代码实现

```python
# 自定义 Task 最小骨架（结构示意，依据官方 API）
from lm_eval.api.task import Task

class MyTask(Task):
    def has_training_docs(self):
        return False

    def aggregation(self):
        return {"acc": mean, "acc_stderr": stderr}

    def higher_is_better(self):
        return {"acc": True, "acc_stderr": False}

    def process_results(self, doc, results):
        pred = results[0]
        return {"acc": float(pred.strip() == doc["answer"])}
```

## 五、与其他技术对比

- 相比手工评测脚本：harness 统一接口、多后端、缓存与报告，大幅降低复现成本。
- 相比仅跑 HF `evaluate`：harness 更聚焦 LLM 端到端（含 few-shot、生成、多后端），而 evaluate 偏组件级指标。
- 局限：抽象带来学习曲线，极端定制任务仍需理解内部协议。

## 六、常见误区

- 「忽略任务版本导致结果不可比」：同一任务不同版本模板不同，分数不可直接对比。
- 「误用训练集分布做 few-shot」：few-shot 应来自训练/校验拆分，避免数据泄露。
- 「只报总分不报 stderr」：缺少方差，无法判断差异是否显著。
- 「换后端不改采样参数」：不同后端默认 temperature/top_p 不同会漂移分数。

## 七、与开源书·权威来源对应

- Gao et al. 2021「A Framework for Few-Shot Language Model Evaluation」：harness 设计与百余基准覆盖。
- 官方仓库 EleutherAI/lm-evaluation-harness：Task 接口、注册与示例。
- 以官方最新文档为准确认 API 细节（类名/方法可能随版本演进）。

## 八、面试题

- harness 中 Task 抽象解决了什么问题？它如何解耦模型与评测？
- 为什么 few-shot 示例来源必须严谨以避免泄露？
- higher_is_better 的作用？若声明错误会怎样？

## 九、演进与趋势

任务市场与可组合评测套件成为社区标准；声明式 YAML 任务降低贡献门槛；与推理服务（vLLM）共用后端保证「评测=线上」一致性；结果可验证缓存与版本指纹（见「结果复现与版本固化」）被强化。

## 十、小结

harness 以 `Task` 抽象统一数据、few-shot、生成与计分，由 evaluator 调度并输出可复现报告，是大规模公平评测的工程基石。其权威来源是 Gao 2021 与官方仓库，落地关键是锁定任务版本、规范 few-shot 来源、并报告方差。
