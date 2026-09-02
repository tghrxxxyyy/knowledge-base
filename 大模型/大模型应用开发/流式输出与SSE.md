# 流式输出与 SSE

> 对应 llm-universe 流式章节。提升用户体感的关键。

## 一、核心概念

大模型逐 token 生成，若等全部完成再返回，用户等待久。流式(SSE/WebSocket)边生成边推，体感更顺。OpenAI SDK `stream=True` 返回可迭代的 chunk，`choices[0].delta.content` 增量文本。

```python
stream = client.chat.completions.create(model="gpt-4o-mini", messages=msgs, stream=True)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

## 二、关键要点

- 前端用 `ReadableStream`/`EventSource` 接收。
- 需处理中断与超时。
- 成本控制：流式不影响计费，按 token 计。

## 三、面试题

- 流式输出为何不增加 token 成本？
