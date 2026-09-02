# 工具调用协议 Function Calling

> 对应 OpenAI tool-calling 与 llm-universe 工具章节。

## 一、核心概念

工具调用让模型输出**结构化调用请求**(函数名+参数 JSON)，由运行时解析并执行，结果回填。协议要素：工具 schema(JSON Schema 描述参数)、模型决策何时调用、运行时执行、结果作为新消息传入。

## 二、代码实现（OpenAI 风格）

```python
tools = [{
  "type": "function",
  "function": {
    "name": "get_weather",
    "description": "查询城市天气",
    "parameters": {"type":"object",
      "properties": {"city": {"type":"string"}}, "required":["city"]}}}]
resp = client.chat.completions.create(model="gpt-4o", messages=msgs, tools=tools)
if resp.choices[0].message.tool_calls:
    call = resp.choices[0].message.tool_calls[0]
    # 解析 call.function.name / arguments，执行后把结果放回 messages
```

## 三、关键要点

- schema 描述越准，调用越稳。
- 需参数校验与失败重试。

## 四、常见误区

- 把工具结果当最终答案直接返回，未让模型综合。
- 忽略并行工具调用的实现。

## 五、与开源书的对应

- llm-universe「使用大模型 API 与工具」：https://datawhalechina.github.io/llm-universe/
- OpenAI Function Calling 文档。

## 七、面试题

- 工具调用结果为何要放回 messages 再让模型生成？
