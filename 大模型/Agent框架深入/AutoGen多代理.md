# AutoGen 多代理

> 见「Agent框架深入/Agent框架总览」与「智能体工程深入」。

## 一、背景与挑战

单一 Agent 难兼顾编码、检索、决策。多代理通过角色分工协作完成复杂任务。

## 二、核心原理

AutoGen 以「会话」连接多个 Agent（如 UserProxy、Assistant、GroupChat），消息驱动，支持代码自动执行与环境交互。

## 三、代码实现

```python
from autogen import AssistantAgent, UserProxyAgent
u = UserProxyAgent("user", code_execution_config={"use_docker":False})
a = AssistantAgent("assistant"); u.initiate_chat(a, message="写排序算法")
```

## 四、关键要点

- GroupChat 实现群聊式协作。
- 代码执行需沙箱以防风险。

## 五、与其他对比

- CrewAI 角色更业务化；AutoGen 更偏研究与代码。

## 六、常见误区

- 多代理必然更优——通信开销与失控风险并存。

## 七、与开源书对应

- AutoGen: https://github.com/microsoft/autogen
- Wu et al., *AutoGen*, 2023.

## 八、面试题

- AutoGen 的 UserProxy 与 Assistant 职责如何划分？

## 九、演进

双代理 → GroupChat → 可定制群聊拓扑。

## 十、小结

AutoGen 是多代理研究与代码任务的利器。
