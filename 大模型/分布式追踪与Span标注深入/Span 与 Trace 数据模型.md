# Span 与 Trace 数据模型

> 对应 vllm-project/vllm 与 microsoft/DeepSpeed。

## 一、背景与挑战
异构组件产生的事件需要统一数据模型才能关联分析。

## 二、核心原理
Trace 由唯一 id 标识，包含若干有父子关系的 Span；每个 Span 有起止、属性与事件。

## 三、形式化与数学基础
树结构约束：
$ \forall s, \mathrm{parent}(s) \in \mathrm{span} \cup \{\mathrm{root}\} $

## 四、代码实现
```python
class Span:
    def __init__(self, name, trace_id, parent=None):
        self.trace_id = trace_id
        self.parent = parent
        self.attrs = {}
```

## 五、与其他技术对比
相比扁平日志，树模型天然表达嵌套调用。

## 六、常见误区
把并发 span 误认为串行；丢失 trace 上下文传播。

## 七、与开源书/权威来源对应
vllm-project/vllm 的追踪结构；microsoft/DeepSpeed 提供训练侧 span。

## 八、面试题
如何保证跨进程 trace id 正确传播？

## 九、演进与趋势
标准化 LLM span 语义约定。

## 十、小结
统一数据模型是聚合多组件信号的前提。
