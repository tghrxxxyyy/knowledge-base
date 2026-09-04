# lm-evaluation-harness 架构与任务注册

> 对应 Gao 2021 lm-evaluation-harness (EleutherAI)。

## 一、背景与挑战
不同评测集各有加载与计算方式，缺乏统一入口导致结果不可比、难以复现。

## 二、核心原理
harness 以 Task 为抽象：每个任务负责数据加载、few-shot 构造、生成与指标计算，由统一的 evaluator 调度。

## 三、形式化与数学基础
准确率以样本级 0/1 聚合：
$ \text{Acc} = \frac{1}{N}\sum_{i=1}^{N} \mathbb{1}[\hat{y}_i = y_i] $

## 四、代码实现
```python
from lm_eval.api.task import Task
class MyTask(Task):
    def aggregation(self):
        return {'acc': mean}
    def higher_is_better(self):
        return {'acc': True}
```

## 五、与其他技术对比
相比手工脚本，harness 统一接口、支持多后端与缓存，降低复现成本。

## 六、常见误区
忽略任务版本导致结果不可比；误用训练集分布做 few-shot。

## 七、与开源书/权威来源对应
Gao 2021 描述 harness 的设计与覆盖的百余个基准。

## 八、面试题
harness 中 Task 抽象解决了什么问题？

## 九、演进与趋势
任务市场与可组合评测套件成为社区标准。

## 十、小结
统一任务抽象是大规模、可复现评测的工程基石。
