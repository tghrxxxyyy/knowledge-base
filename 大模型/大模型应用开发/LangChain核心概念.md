# LangChain 核心概念

> 对应 llm-universe 与 LangChain 文档。最流行的 LLM 应用编排框架。

## 一、核心概念

LangChain 提供抽象组件：Model(LLM/Chat)、Prompt、Chain(组合)、Retriever、Tool、Agent、Memory、Callback。通过 `Runnable`(LCEL) 把组件串成可流式、可并行的管道。

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
chain = ChatPromptTemplate.from_messages([("system","你助手"),("user","{q}")]) | ChatOpenAI()
chain.invoke({"q":"你好"})
```

## 二、关键要点

| 组件 | 作用 |
|------|------|
| Model | 调用模型 |
| Chain | 编排 |
| Retriever | 检索 |
| Memory | 状态 |

## 三、常见误区

- 过度抽象导致调试困难，简单场景直接用 SDK 更清晰。
- 版本迭代快，API 易过时。

## 四、与开源书的对应

- llm-universe「LangChain 入门」：https://datawhalechina.github.io/llm-universe/
- LangChain: https://python.langchain.com/

## 七、面试题

- 何时用 LangChain、何时直接调 SDK？
