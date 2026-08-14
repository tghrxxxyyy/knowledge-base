# 03 工具调用与 MCP

> 工具是智能体「从说话到做事」的跃迁点。本文讲三部分：**Function Calling 原理 → 工具设计（ACI）→ MCP 标准协议 → 结构化输出**，最后给出工具安全红线。

## 一、Function Calling（函数调用）原理

主流大模型原生支持「工具调用」：模型不在文本里瞎编答案，而是**输出结构化的工具调用请求**，由运行时执行并把结果回灌。

### 1. 调用流程

```text
① 系统定义工具清单（name + 描述 + 参数 JSON Schema）
② 用户提问：把问题 + 工具清单一起发给 LLM
③ LLM 输出 tool_calls：{name: "search", arguments: {q: "..."}}
④ 运行时执行该工具，拿到结果
⑤ 把结果作为 tool 消息回灌给 LLM
⑥ LLM 基于结果继续推理 / 回答（或再次调用工具）
```

```python
# 概念示意（以 OpenAI/Anthropic 风格统一抽象）
tools = [{
    "name": "search_web",
    "description": "用关键词检索网页，返回前 5 条结果摘要",
    "parameters": {
        "type": "object",
        "properties": {"query": {"type": "string"}},
        "required": ["query"],
    },
}]
resp = llm.chat(messages, tools=tools)      # ③ 模型请求调用
if resp.tool_calls:
    for call in resp.tool_calls:
        result = run_tool(call.name, call.arguments)   # ④ 运行时执行
        messages.append({"role": "tool", "content": result})  # ⑤ 回灌
    resp = llm.chat(messages, tools=tools)   # ⑥ 继续推理
```

> 关键点：模型**只决定「调什么、传什么参」**，真正执行由你的代码负责。这既是能力来源，也是安全边界（见第五节）。

### 2. 解析与校验

- 框架通常**自动从函数签名生成 JSON Schema**（如 OpenAI Agents SDK 的 `@function_tool` 从 Python 类型提示 + docstring 生成）。
- 执行前做 **Pydantic / JSON Schema 校验**，避免脏参数进入工具。
- 失败要**返回明确错误**而非崩溃，让模型有机会重试。

## 二、工具设计：ACI（Agent-Computer Interface）

Anthropic 提出一条金句级原则：

> **像做 HCI（人机界面）一样，认真做 ACI（Agent-Computer Interface）。** 你在工具设计上投入的精力，应该和人机界面工程一样多。

好的工具设计要点：

- **清晰命名 + 详尽说明**：工具名、参数名、描述写清楚——模型靠描述决定何时调用。
- **参数少而准**：避免过多可选参数；用结构化参数而非一大段自由文本。
- **错误处理友好**：返回明确错误信息、提供合理回退，而不是抛异常。
- **充分测试**：模拟各种异常输入，收集使用数据迭代（模型也会「用错」工具）。

```text
❌ 差的工具:  run(cmd: str)            —— 参数模糊，模型易误用
✅ 好的工具:  search_docs(query: str, top_k: int=5)  —— 意图明确、有默认值
```

## 三、MCP：模型上下文协议（Model Context Protocol）

工具越来越多后，每个集成都要写一套适配，碎片化严重。**MCP 是 Anthropic 于 2024-11-25 发布的开放标准**，目标是「一次编写，到处集成」——把 LLM 与工具/数据源的连接标准化。2025-12-09 捐赠给 Linux 基金会下的 Agentic AI Foundation（AAIF）。

> 截至 2026 年，MCP 已成为连接模型与工具/数据的**事实上标准**：月 SDK 下载量 9700 万+，活跃 MCP 服务器 1 万+，并被 OpenAI、Google、Microsoft 采用（ChatGPT、Gemini、Copilot、VS Code 等均集成）。GitHub、Stripe、Notion、Hugging Face、Postman 等均已发布官方 MCP 服务器。

### 1. 架构：Client–Host–Server

MCP 基于 **JSON-RPC 2.0（UTF-8）**，采用三层架构：

- **Host（宿主）**：运行 LLM 的容器应用（如 Claude Desktop、IDE 插件、某 agent 框架）。
- **Client（客户端）**：Host 内每个 MCP 连接对应一个 Client，与**单个 Server 1:1**。
- **Server（服务器）**：暴露能力的独立进程/服务。

初始化时做**双向能力协商（capability negotiation）**，会话在 JSON-RPC 上保持有状态。

```mermaid
flowchart LR
    Host[Host: LLM 应用] --> Client1[MCP Client A]
    Host --> Client2[MCP Client B]
    Client1 <-->|JSON-RPC| Server1[MCP Server: 工具/数据]
    Client2 <-->|JSON-RPC| Server2[MCP Server: 工具/数据]
```

### 2. 三大服务端原语 + 两类客户端特性

| 类别 | 原语 | 作用 |
| --- | --- | --- |
| 服务端 | **Tools（工具）** | 可被执行的能力（如查数据库、发 API） |
| 服务端 | **Resources（资源）** | 可被读取的上下文（文件、记录） |
| 服务端 | **Prompts（提示模板）** | 预置的提示工作流 |
| 客户端 | **Roots（根）** | 客户端告知 server 可访问的本地路径边界 |
| 客户端 | **Sampling（采样）** | server 反向请求 LLM 补全（让 server 也能用模型） |

### 3. 传输方式（Transports）

- **stdio**：本地子进程，换行分隔的 JSON-RPC，适合本机工具。
- **Streamable HTTP**：单端点，可选 SSE，用 `Mcp-Session-Id` 管理会话，`Last-Event-ID` 支持断点续传（取代了早期的独立 SSE 传输）。
- **WebSocket（2025-12 起成为正式传输）**：MCP 规范新增 WebSocket 传输——适合浏览器前端直连、需要双向实时推送（如工具事件流）的场景；服务端同一端口可同时支持 Streamable HTTP 与 WebSocket，客户端自动协商。

### 4. 版本演进（精选）

| 版本 | 时间 | 关键变化 |
| --- | --- | --- |
| 2024-11-05 | 2024-11 | 首次发布；stdio + HTTP/SSE；核心原语 |
| 2025-03-26 | 2025-03 | Streamable HTTP 取代 SSE；会话管理；OAuth 2.1 |
| 2025-06-18 | 2025-06 | 结构化输出、Elicitation（向用户补问）、改进授权 |
| 2025-11-25 | 2025-11 | **Tasks（异步任务）**、Extensions 框架、企业级授权、图标 |
| 2025-12 | 2025-12 | **WebSocket 传输正式化**、Subscriptions（服务端向客户端推送变更） |

> Tasks 是实验性特性：让「调用即返回、稍后取结果」的长时间操作（代码迁移、深度研究、多智能体并发）变得可管理，状态含 `working / input_required / completed / failed / cancelled`。
> Subscriptions：服务端资源/工具变更时主动通知客户端（`resources/subscribe`），MCP 从「客户端拉」走向「服务端推」。

### 5. 实践亮点：用代码调用工具省 token

Anthropic 工程博客（2025-11-04）提出 **code execution with MCP**：当工具很多时，让 agent**写一段代码去调用工具**，而不是逐个直接调用——实测可将 token 从 ~150K 降到 ~2K（**约 98.7% 的 token 削减**）。这对工具爆炸（tool explosion）场景极具价值。

### 5.1 MCP 注册表与远程服务器（2025-2026 生态）

- **MCP 注册表（Registry）**：OpenAI/Anthropic 都在建设官方注册表（modelcontextprotocol 官方 registry、OpenAI MCP registry），作用类似 npm——**可发现、可安装、带版本与信任评级**的 MCP 服务器目录；社区侧有 mcp.so / Glama / PulseMCP 等聚合站；
- **托管 MCP 服务器（Hosted MCP）**：OpenAI Hosted MCP（免运维代管 + 鉴权）、GitHub MCP Server（官方托管）等——「工具即服务」化：注册表装完即用，不必自建进程；
- **A2A 与 MCP 的分工**：**MCP 管「agent 用工具」**（进程内/远程工具），**A2A 管「agent 与 agent 通信」**（跨组织协作）——2025 年业界共识是二者互补而非竞争；
- **企业 MCP 网关**：内部 MCP 服务器统一走网关（统一鉴权 OAuth、审计、限流、版本管理）——工具数量一多，直接连服务器是事故温床。

### 6. 主流框架的 MCP 支持

- **Claude Agent SDK**：原生最深，支持 stdio/SSE/HTTP，还有「进程内 SDK MCP Server」（Python 函数直接变 MCP 工具，无需子进程）。
- **OpenAI Agents SDK**：原生，支持 Hosted MCP / HTTP+SSE / stdio，带工具过滤与缓存。
- **CrewAI**：原生，有专门 MCP 文档（stdio/SSE/HTTP 三种传输、多服务器、安全配置）。
- **Google ADK**：三语言版均集成 MCP SDK（`mcp_tool` 模块）。
- **LangGraph**：通过 `langchain-mcp-adapters` 桥接（非原生）。
- **Microsoft Agent Framework**：通过 Foundry Toolboxes 与 A2A 间接支持。

## 四、结构化输出（Structured Outputs）

需要让 agent 产出**可程序消费**的结果（而非自由文本）时，用结构化输出：

- 给 agent 一个 **output schema（JSON Schema / Pydantic 模型）**，agent loop 会持续直到产出匹配 schema 的结果。
- 用途：信息抽取、分类、作为下一 agent 的输入（链式 agent）。
- 厂商支持：OpenAI Structured Outputs、Anthropic 结构化输出、Gemini 上下文缓存等。

```python
from pydantic import BaseModel

class Ticket(BaseModel):
    category: str
    urgency: int
    summary: str

agent = Agent(name="triager", output_type=Ticket)  # 产出必为 Ticket 结构
```

## 五、工具安全红线

工具让 agent 能「改变世界」，也带来风险。**Lethal Trifecta（致命三重奏）**：当以下三点同时存在即构成漏洞——

1. **可访问私有数据**（邮件、文件、数据库）
2. **会处理不可信输入**（来自外部/用户的内容）
3. **有外发通道**（能把数据发出去）

> 典型后果：提示注入（prompt injection）把私有数据经工具「夹带」出去。防范见 06 篇护栏。

### 规范做法

- **最小权限**：工具只给完成任务所需的权限（NIST AC-6）。
- **白名单执行**：函数调用只在审批过的注册表里放行。
- **影子模式**：早期对写操作先做「模拟执行」（log 不真正发送）。
- **作用域隔离**：限制向量库/记忆的命名空间按用户/角色划分。

### 工具中毒与恶意 MCP 服务器（2025-2026 新威胁面）

MCP 生态爆发后，安全重心从「提示注入」扩展到「**不可信工具本身**」：

| 威胁 | 机理 | 防御 |
| --- | --- | --- |
| **恶意/后门 MCP 服务器** | 注册表第三方服务器可能收集数据、篡改工具输出 | 只用官方/企业自建服务器；装前审计代码；OAuth 范围最小化 |
| **工具中毒（Tool Poisoning）** | 恶意工具**输出被污染的数据**回灌给 LLM（如返回「工具调用成功」假结果或夹带注入指令） | 工具输出按**不可信数据**处理：隔离 + 过滤 + 不直接拼接进系统提示 |
| **工具描述劫持** | 恶意 server 用高优先级描述让 LLM 优先调用它 | 白名单工具注册表 + 工具来源可信评级 |
| **凭证窃取** | 工具请求 OAuth 令牌/API key | 令牌最小范围 + 短期失效 + 网关审计 |
| **Clippy 攻击（2025 命名）** | 工具/插件「好意」地主动做用户没要求的事 | 写操作一律需显式确认；HITL 覆盖 |
| **隐式数据外发** | 工具在「正常功能」里把上下文发到外部端点 | 网络 egress 白名单 + 代理审计 |

> 一句话：**工具即代码，注册表即供应链——2025 年的教训是「装了个工具等于装了个后门」，信任模型必须是『默认不可信 + 白名单放行』。** 更多护栏见「[工程落地/06-可观测性、成本与安全](../工程落地/06-可观测性、成本与安全.md)」。

## 六、参考来源

- Anthropic — Introducing the Model Context Protocol：https://www.anthropic.com/news/model-context-protocol
- MCP 规范仓库：https://github.com/modelcontextprotocol/modelcontextprotocol ｜ 文档：https://modelcontextprotocol.io
- MCP 一周年与 2025-11 规范发布：https://blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary/
- Anthropic — Code execution with MCP（98.7% token 削减）：https://www.anthropic.com/engineering/code-execution-with-mcp
- OpenAI Agents SDK（Function Tools / Structured Outputs）：https://openai.github.io/openai-agents-python/
- OWASP LLM Top 10（2025）：https://owasp.org/www-project-top-10-for-large-language-model-applications/

## 七、工具调用的错误恢复与重试

工具执行会失败（超时、限流、脏参数、下游 5xx）。Agent 必须有「错误恢复」而非一失败就崩。

```python
import time, random
def call_with_retry(tool, args, max_retries=3):
    for i in range(max_retries):
        try:
            return run_tool(tool, args)
        except TransientError as e:                 # 限流/超时等可重试
            if i == max_retries - 1:
                raise
            wait = (2 ** i) + random.random()        # 指数退避 + 抖动
            time.sleep(wait)
    return None

# 把错误回灌给 LLM，让它换参数/换工具重试
def safe_call(llm, tool, args):
    try:
        return run_tool(tool, args)
    except Exception as e:
        return f"工具执行失败: {e}。请换参数或换工具重试。"
```

| 策略 | 做法 | 适用 |
| --- | --- | --- |
| 指数退避 + 抖动 | `2^i + rand` 重试 | 限流/瞬时故障 |
| 熔断（Circuit Breaker） | 错误率超阈值则暂停调用 | 下游不稳定 |
| 错误回灌 LLM | 把异常文本喂回模型 | 让模型自纠参数 |
| 降级 fallback | 失败返回可读兜底 | 非关键路径 |

> ⚠️ 重试要限次，否则 agent 会陷入「调工具→失败→重试」死循环；配合 06 篇的递归思维检测与预算上限。

## 八、MCP 协议细节深化

上文第三节讲了 MCP 架构与原语，这里补「握手/协商/双向能力」的工程细节。

**初始化握手（initialize）**：客户端发 `initialize` 请求，协商协议版本与能力（是否支持 sampling/roots/elicitation），服务器回 `InitializeResult` 后客户端发 `initialized` 通知完成握手。

```json
{"jsonrpc":"2.0","id":1,"method":"initialize",
 "params":{"protocolVersion":"2025-11-25","capabilities":{"roots":{}},"clientInfo":{"name":"my-host"}}}
```

**双向能力**
- **Sampling（服务端反采 LLM）**：server 在处理中可反向请求 host 的 LLM 补全（如让模型总结资源），host 可拒绝——防止 server 滥用模型。
- **Elicitation（向用户补问）**：server 缺参数时经 host 向用户提问补全（2025-06 引入），用于交互式工具。
- **Roots（路径边界）**：客户端声明可访问的本地根目录，server 只能在边界内读资源。

**传输与鉴权**：stdio 走本机子进程；Streamable HTTP 需 `Mcp-Session-Id`，OAuth 2.1 授权；`Last-Event-ID` 支持 SSE 断点续传。

> 💡 MCP 的「能力协商 + 有状态会话」意味着每个连接都要维护 session；服务端要做高并发，需用 `Tasks`（2025-11）把长操作异步化，避免阻塞 JSON-RPC 通道。
