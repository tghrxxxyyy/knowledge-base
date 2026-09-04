# MemGPT与分层记忆

> 对应 Packer et al., 2023 *MemGPT: Towards LLMs as Operating Systems*。

## 一、背景与挑战
LLM 上下文有限但应用需长期记忆。MemGPT 把 LLM 视为 OS，引入分层内存（主存 / 外部存），模型通过函数调用管理。

## 二、核心原理
方案：
- 主存（context window）：当前 LLM 可见。
- 外部存（vector store）：长期记忆。
- 工具调用：`memory_search`, `memory_write`, `memory_delete`。
- 模型自主决定何时读/写。

## 三、形式化与数学基础
形式化为有界记忆的图灵机：主存 = 工作磁带，外部存 = 长期磁带，工具调用 = 读写指令。模型是控制器。

## 四、代码实现
```python
# MemGPT 风格的工具
def memory_search(query, k=5):
    return vector_db.search(query, k=k)
def memory_write(text):
    vector_db.add(text)
# 工具描述注入 system prompt，模型调用
```

## 五、与其他技术对比
- vs RAG：MemGPT 模型主动管理记忆，RAG 被动检索。
- vs 长上下文：MemGPT 突破窗口限制。

## 六、常见误区
- 模型必须学会用工具，需 fine-tune 或强 prompt。
- 记忆一致性需精心管理。

## 七、与开源书/权威来源对应
- letta-ai/letta（MemGPT 开源实现）。
- d2l-ai/d2l-zh。

## 八、面试题
- MemGPT 为何要分层？答：模拟 OS 内存层次，主存快但小，外部存大但慢。

## 九、演进与趋势
RAG → 主动记忆 → MemGPT → Agent + 长期记忆。

## 十、小结
MemGPT 用 OS 式分层记忆突破 LLM 上下文限制，是上下文记忆的前沿方案。
