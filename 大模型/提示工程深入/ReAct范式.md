# ReAct：推理 + 行动

> 对应 Yao et al., *ReAct*, 2022（亦见本系列「智能体」文档）。

## 一、核心概念

ReAct 让模型交替生成**思考(Thought)**与**行动(Action)**，行动调用外部工具(搜索/API)，观察(Observation)结果再思考，直到给出答案。把推理与工具使用交织，显著提升事实性与复杂任务表现。

```
Thought: 我需要先查X
Action: search(X)
Observation: ...
Thought: 据此可答
Action: Finish(answer)
```

## 二、关键要点

- 思想是隐式推理，行动是工具调用。
- 需定义工具接口与解析。

## 三、与开源书的对应

- Yao et al., *ReAct: Synergizing Reasoning and Acting*, 2022.
- Prompt-Engineering-Guide: https://www.promptingguide.ai/zh/techniques/react

## 七、面试题

- ReAct 如何让模型利用外部知识？
