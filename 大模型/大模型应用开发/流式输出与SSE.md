# 流式输出与 SSE

> 对应 llm-universe 流式章节；协议参考 HTML5 Server-Sent Events (SSE) 与 OpenAI Streaming API。

## 一、背景与挑战

大模型是逐 token 自回归生成的，一次完整回答可能要数秒甚至更久。若等服务端生成全部再一次性返回，用户面对空白页会以为卡死，体感极差。流式（Streaming）让模型「边生成边推」，首字延迟低、体验顺滑，已成为聊天产品的标配。

挑战：(1) 前后端需约定增量传输协议；(2) 中断/超时/错误的处理；(3) 流式下做结构化输出（JSON）需拼接后再解析；(4) 成本与计费不受流式影响，但需正确累计 token；(5) 背压——前端慢导致服务端缓冲堆积。

## 二、核心原理

- 后端：模型以 generator 形式逐 chunk 产出，每个 chunk 携带增量文本 `delta.content`；用 SSE（`text/event-stream`）或 WebSocket 推给前端。
- 前端：用 `EventSource`（SSE）或 `fetch` + `ReadableStream` 接收，把增量文本追加到 DOM。
- 终止：客户端可发送取消信号，后端停止生成以省算力。
- 注意：流式不改变计费——按生成的 token 总数计，与是否流式无关。

## 三、形式化与数学基础

设完整输出为 token 序列 $y=(y_1,\dots,y_n)$，流式在第 $t$ 步已产出前缀：

$$Y_t = (y_1,\dots,y_t), \quad t=1,\dots,n$$

前端在时间 $t$ 显示的累积文本为 $\text{concat}(Y_t)$。首字延迟即产出 $y_1$ 的耗时；总时延接近完整生成时间，但用户「感知时延」因边看边等而显著降低。计费仅依赖 $n=|y|$，与分块方式无关。

## 四、代码实现

后端（OpenAI 兼容，Python）：

```python
from openai import OpenAI
client = OpenAI()
stream = client.chat.completions.create(
    model="gpt-4o-mini", messages=msgs, stream=True)
for chunk in stream:
    delta = chunk.choices[0].delta.content
    if delta:
        print(delta, end="", flush=True)   # 逐块推给前端
```

前端（浏览器 SSE）：

```javascript
const es = new EventSource("/chat/stream");
es.onmessage = (e) => { document.body.append(e.data); };
es.onerror = () => es.close();  // 处理中断
```

## 五、与其他技术对比

| 方式 | 适用 | 特点 |
|------|------|------|
| 阻塞返回 | 批处理 | 简单但体感差 |
| SSE | 单向推送 | 标准、自动重连 |
| WebSocket | 双向交互 | 灵活但复杂 |
| 长轮询 | 旧环境 | 兼容但低效 |

聊天场景首选 SSE（单向、标准、易实现）。

## 六、常见误区

- 认为流式会增加 token 成本——计费只看总 token 数。
- 前端未处理中断，用户关闭页面后端仍生成浪费算力。
- 在流式里直接返回完整 JSON，未等流结束就解析导致报错。
- 忽略超时与错误事件，网络抖动时界面卡死。
- 不处理背压，前端卡顿导致服务端内存堆积增量。

## 七、与开源书·权威来源对应

- llm-universe「流式输出」章节：https://datawhalechina.github.io/llm-universe/
- HTML5 SSE 规范；OpenAI Streaming 文档。
- 本知识库「大模型应用开发 / 大模型 API 调用」章节。

## 八、面试题

- 流式输出为何不增加 token 成本？
- SSE 与 WebSocket 各自适用什么场景？
- 流式下如何可靠地做 JSON 结构化输出？
- 用户中途断开，服务端应如何处理以省算力？

## 九、演进与趋势

从「逐字打印」到「结构化流式」：支持增量 JSON（边生成边校验字段）、思考过程（reasoning）与正文分离推送；前端结合 markdown 流式渲染；服务端用 LLM 网关统一做背压与限流；以及 token 级计费与用量可观测。

## 十、小结

流式输出是体感优化的关键，用 SSE/WebSocket 把逐 token 生成实时推向前端。它不改变计费与正确性，但必须处理好中断、超时、背压与结构化拼接，才能既顺滑又稳健。
