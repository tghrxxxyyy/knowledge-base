# ReAct 范式实现

> 对应 Yao et al.(ReAct, 2022)，深入工程实现。

## 一、核心概念

ReAct 用「Thought / Action / Observation」三步循环：模型先思考(Thought)，决定动作(Action, 如调用工具)，环境返回观察(Observation)，模型据此再思考，直到 Finish。实现需：定义动作空间、解析模型输出、连接环境、最大步数截断。

## 二、代码骨架

```python
messages = [system_prompt, user_msg]
for step in range(max_steps):
    out = llm(messages)
    thought, action = parse(out)
    if action == "Finish":
        return answer
    obs = env.run(action)
    messages.append({"role":"user","content": f"Observation: {obs}"})
```

## 三、关键要点

- 提示需明确输出格式(Thought/Action/Action Input/Observation)。
- 解析失败需重试/修正。

## 四、与开源书的对应

- Yao et al., *ReAct*, 2022.
- 见「提示工程深入/ReAct」文档。

## 七、面试题

- ReAct 的 Thought 是否参与环境交互？有何作用？
