# LangChain 核心概念

> 对应 llm-universe 与 LangChain 官方文档；最流行的 LLM 应用编排框架（LangChain / LangChain Core）。

## 一、背景与挑战

直接调模型 API 能跑通 demo，但生产应用需要把「prompt 模板、模型、检索、工具、记忆、回调」等组件可靠地串起来，并支持流式、并行、批处理与可观测。手写胶水代码易碎且难维护。LangChain 提供了一套抽象与组合原语，让编排更工程化。

挑战：(1) 组件繁多需统一抽象；(2) 版本迭代快、API 易变；(3) 过度抽象反而难调试；(4) 简单场景用框架反而更重；(5) 链式错误难以定位。

## 二、核心原理

LangChain 的支柱抽象：

- Model：封装 LLM / ChatModel / Embedding 调用。
- Prompt：PromptTemplate / ChatPromptTemplate 管理模板与变量注入。
- Chain：用 LCEL（LangChain Expression Language）以管道符 `|` 把组件串成 `Runnable`，天然支持流式、并行、`invoke`/`batch`/`stream`。
- Retriever：把向量库/搜索引擎抽象为「查询→文档」接口。
- Tool / Agent：把外部函数暴露给模型调用。
- Memory：管理对话历史（虽新版本更推荐直接用消息列表）。
- Callback：钩子用于日志、流式、追踪（配合 LangSmith）。

## 三、形式化与数学基础

LCEL 把管线视为可组合函子，组件 $f,g$ 用 `|` 组合：

$$h = f \mid g, \quad h(x) = g(f(x))$$

对批处理有：

$$\text{batch}(h, X) = [h(x_i)]_{i=1}^{n}$$

流式则把输出建模为增量序列的折叠：

$$\text{stream}(h, x) = \bigoplus_{t} g_t(f_t(x))$$

其中 $\oplus$ 表示增量拼接。Runnable 的统一接口使组合具有代数性质，便于并行与复用。

## 四、代码实现

用 LCEL 组合 prompt 与模型：

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

prompt = ChatPromptTemplate.from_messages(
    [("system", "你是助手"), ("user", "{q}")])
chain = prompt | ChatOpenAI(model="gpt-4o-mini")

# 统一接口：invoke / batch / stream
print(chain.invoke({"q": "你好"}).content)
for chunk in chain.stream({"q": "什么是RAG"}):
    print(chunk.content, end="", flush=True)
```

Runnable 主要接口：`invoke`（单条）、`batch`（批量）、`stream`（流式）、`ainvoke`（异步），构成一致的调用契约。

## 五、与其他技术对比

| 方案 | 适用 | 特点 |
|------|------|------|
| 直接调 SDK | 简单/可控 | 轻量但胶水多 |
| LangChain | 复杂编排 | 组件全、生态大 |
| LlamaIndex | 以检索为中心 | RAG 更强 |
| 自研编排 | 高度定制 | 灵活但成本高 |

经验：简单场景直接 SDK，复杂多组件才上框架。

## 六、常见误区

- 过度抽象导致调试困难，简单场景直接用 SDK 更清晰。
- 版本迭代快，旧教程 API 易过时，需看官方最新文档。
- 把 Memory 当黑盒，不了解其如何存/取消息，导致上下文错乱。
- 忽视 Callback/LangSmith 可观测性，线上问题难定位。
- 在链中混用不同大版本 API，引发隐性不兼容。

## 七、与开源书·权威来源对应

- llm-universe「LangChain 入门」：https://datawhalechina.github.io/llm-universe/
- LangChain 官方文档：https://python.langchain.com/
- 本知识库「大模型应用开发 / RAG 应用开发」「Agent 应用开发」章节。

## 八、面试题

- 何时用 LangChain、何时直接调 SDK？
- LCEL 的 `|` 组合有什么好处？
- LangChain 的 Retriever / Tool / Memory 分别解决什么问题？
- Runnable 的统一接口（invoke/batch/stream）带来什么价值？

## 九、演进与趋势

从「链（Chain）类」到 LCEL 声明式组合； Runnable 统一接口成为核心；与 LangGraph 配合做有状态多步 Agent；LangSmith 提供评测与追踪；生态分化：LangChain 偏通用编排、LlamaIndex 偏检索。框架趋于「轻内核 + 可组合」。

## 十、小结

LangChain 用统一抽象（Model/Prompt/Chain/Retriever/Tool/Memory）与 LCEL 组合原语，降低多组件编排成本。但需权衡抽象代价，简单场景直接 SDK 更清晰，复杂编排再上框架，并善用可观测性。
