# Agent 状态与记忆

> 见「智能体工程深入/Agent记忆」与「上下文工程深入」。

## 一、背景与挑战

长任务需跨步骤保存中间结果与历史，否则每步「失忆」。

## 二、核心原理

分层记忆：**短期**（当前上下文窗口）、**工作记忆**（本轮任务状态）、**长期**（向量库/键值存储）。框架以 State 或 Memory 模块承载。

## 三、代码实现

```python
memory = {"facts":[], "scratch":{}}
memory["facts"].append(extracted_fact)
```

## 四、关键要点

- 记忆需去重、时效管理与检索。
- 过度记忆撑爆上下文。

## 五、与其他对比

- 上下文工程偏单次提示组织；Agent 记忆偏跨步持久。

## 六、常见误区

- 把全部历史塞进 prompt——应检索相关片段。

## 七、与开源书对应

- llm-universe 记忆章: https://github.com/datawhalechina/llm-universe
- MemGPT 论文: https://github.com/cpacker/MemGPT

## 八、面试题

- 如何设计 Agent 的多层记忆以避免上下文爆炸？

## 九、演进

全量历史 → 摘要 → 检索式记忆 → 分层（MemGPT）。

## 十、小结

记忆是 Agent 持续完成任务的基础设施。
