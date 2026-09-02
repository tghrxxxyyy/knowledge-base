# Agent 可观测与调试

> 见「大模型工程落地/LLMOps」与「智能体工程深入/Agent评估」。

## 一、背景与挑战

Agent 多步、多工具调用，出错难定位，需全链路追踪。

## 二、核心原理

记录每步：输入/输出、工具调用参数与结果、token 消耗、耗时、错误。借助 LangSmith/Trace 等可视化。

## 三、代码实现

```python
# 在节点入口打点
def traced(node):
    def w(*a,**k): log(node, a, k); return node(*a,**k)
    return w
```

## 四、关键要点

- trace 可按 run_id 串联多步。
- 评估需覆盖「过程正确性」而不仅是结果。

## 五、与其他对比

- 普通 LLM 应用只需请求级日志；Agent 需步骤级。

## 六、常见误区

- 只记最终输出——无法定位哪步工具调用出错。

## 七、与开源书对应

- LangSmith: https://github.com/langchain-ai/langchain
- llm-universe: https://github.com/datawhalechina/llm-universe

## 八、面试题

- Agent 可观测相比普通应用多了哪些维度？

## 九、演进

打印日志 → 结构化 trace → 评测闭环。

## 十、小结

可观测是 Agent 上生产的必备能力。
