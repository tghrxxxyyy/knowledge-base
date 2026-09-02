# RAG 应用开发实战

> 对应 llm-universe「构建 RAG 应用」。把 RAG深入 的知识落地为代码。

## 一、核心概念

完整链路：加载 → 切分 → 嵌入 → 入库 → 检索 → 拼提示 → 生成 → 后处理。LangChain/LlamaIndex 提供端到端封装，但生产常需自研关键件(切分、重排、评估)。

## 二、代码实现（简化）

```python
from langchain.chains import RetrievalQA
from langchain_community.vectorstores import FAISS
qa = RetrievalQA.from_chain_type(llm, retriever=db.as_retriever(k=4))
ans = qa.invoke("公司年假政策是什么？")
```

## 三、关键要点

- 先评估再上线，定位检索 or 生成瓶颈。
- 缓存高频 query 结果。

## 四、与开源书的对应

- llm-universe「动手搭建 RAG 应用」：https://datawhalechina.github.io/llm-universe/

## 七、面试题

- 一个最小可用 RAG 应用需要哪些模块？
