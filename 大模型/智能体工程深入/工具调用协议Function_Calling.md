# 工具调用协议 Function Calling

> 对应 OpenAI Function Calling / Tools API，以及 llm-universe「使用大模型 API 与工具」章节；并参考 Anthropic tool use、MCP 协议。属智能体工程深入板块。

## 一、背景与挑战

让 LLM「能办事」的前提是标准化地表达「想调哪个函数、传什么参数」。早期做法是让模型吐出一段约定文本（如 `function:get_weather(北京)`）再由正则解析，脆弱且易错。工具调用协议（Function Calling / Tool Use）把这一过程**结构化**：用 JSON Schema 声明工具签名，模型直接输出机器可解析的调用请求（函数名 + 参数对象），由运行时执行并把结果回填消息列表。挑战在于：协议如何既约束模型输出、又不损失表达力，并处理并行调用、流式与错误。

## 二、核心原理

协议四要素：
1. **工具 schema**：以 JSON Schema 描述每个工具的 `name`、`description`、`parameters`（类型、必填、枚举）。
2. **模型决策**：模型根据上下文判断是否调用、调哪个、参数填什么（不执行）。
3. **运行时执行**：宿主解析 `tool_calls`，调用真实函数/API。
4. **结果回填**：把 `role: tool` 消息（含 `tool_call_id` 与返回内容）追加进对话，模型据此继续生成。

关键点：模型产出的是「意图」而非「结果」；执行与最终综合都由宿主掌控，从而把「不可信生成」与「可信动作」分层。现代协议还支持**并行 tool_calls**、流式增量、以及「强制调某工具」。

## 三、形式化与数学基础

设工具集 $\mathcal{F}=\{f_1,\dots,f_m\}$，每个 $f_i$ 由 schema 限定参数空间 $\Theta_i$。模型在时刻 $t$ 输出调用请求：

$$
\text{call}_t = \big(i^\*, \theta^\*\big), \quad i^\*\in\{1,\dots,m,\text{none}\},\; \theta^\*\in\Theta_{i^\*}
$$

若 $i^\*=\text{none}$，则直接生成自然语言回答；否则执行 $r=\text{run}(f_{i^\*},\theta^\*)$，并把 $r$ 作为观测加入轨迹。约束解码（见结构化输出文档）可保证 $\theta^\*$ 一定满足 schema，等价于：

$$
P(\theta^\*\mid \cdot) \text{ 被限制在 } \Theta_{i^\*}
$$

协议本质是「把自由文本动作空间压缩为受 schema 约束的结构化空间」，既提升可靠性也便于权限网关拦截。

## 四、代码实现（OpenAI 风格）

```python
tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "查询城市天气",
        "parameters": {"type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"]}}}]

resp = client.chat.completions.create(
    model="gpt-4o", messages=msgs, tools=tools, tool_choice="auto")
msg = resp.choices[0].message

if msg.tool_calls:                      # 模型决定调用
    call = msg.tool_calls[0]
    args = json.loads(call.function.arguments)
    result = get_weather(args["city"])  # 运行时执行
    msgs.append(msg)                    # 保留助手请求
    msgs.append({"role": "tool",
                 "tool_call_id": call.id,
                 "content": json.dumps(result)})  # 结果回填
    final = client.chat.completions.create(
        model="gpt-4o", messages=msgs)  # 让模型综合作答
```

## 五、与其他技术对比

| 方式 | 输出形态 | 可靠性 | 标准度 |
|------|---------|--------|--------|
| 自然语言约定 | 文本 | 低 | 无 |
| 正则解析 | 文本 | 中 | 自定义 |
| Function Calling | 结构化 JSON | 高 | 厂商/协议统一 |
| MCP | 协议化服务 | 高 | 跨厂商 |

Function Calling 已成事实标准，MCP 进一步把「工具来源」标准化为可共享服务。

## 六、常见误区

- 把工具结果直接当最终答案返回，未让模型综合，丢失上下文衔接。
- 忽略参数校验与失败重试，坏参数导致运行报错。
- 工具 `description` 过简，模型误判何时该调用。
- 未处理并行调用与 `tool_call_id` 配对，导致回填错位。

## 七、与开源书·权威来源对应

- OpenAI 官方文档：「Tool use / Function calling」。
- Anthropic 文档：「Tool use」。
- llm-universe（Datawhale）「使用大模型 API 与工具」章节。
- MCP（Model Context Protocol）规范，统一工具/数据源接入。

## 八、面试题

- 工具调用结果为何要放回 messages 再让模型生成，而不是直接返回用户？
- 模型输出的是「动作」还是「结果」？执行权在谁？
- 如何用 schema 约束保证参数合法？这与约束解码有何联系？
- 并行工具调用在协议层如何表示与配对？

## 九、演进与趋势

工具调用从「单厂商私有」走向「开放协议」：MCP 把工具定义为可跨模型、跨应用订阅的服务；并出现「工具发现」「工具组合规划」等高级能力。约束解码内建进推理框架，使结构化调用近乎零失败。未来方向包括：模型自省「需不需要工具」、工具结果的流式增量回填、以及把权限网关直接嵌进协议层（见 Agent 安全），让「调什么、能否调」在协议内即可裁决。

## 十、小结

工具调用协议用 JSON Schema 声明工具、让模型输出结构化调用意图、运行时执行后回填结果，从而把「生成」与「动作」分层。它已成 Agent 接入外部能力的标准接口，可靠性远高于文本约定。落地须写好工具描述、做参数校验与结果回填，并借约束解码与权限网关把「格式正确」与「调用安全」一并保障。
