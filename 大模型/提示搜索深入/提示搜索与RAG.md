# 提示搜索与RAG

> 对应 RAG 中检索示例提示；检索增强生成前沿 衔接。

## 一、背景与挑战

RAG 不仅检文档，也可检“提示/示例”增强指令。

## 二、核心原理

从提示库检最相关 few-shot 或任务模板，拼入系统/用户提示，相当于检索增强的“提示侧”。

## 三、数学形式

最终提示 $p = p_{base} \oplus \text{retrieve}(p_{ex}, k)$；与文档检索并行。

## 四、代码实现

```python
ex = prompt_db.search(task_embed, k=3)
messages = [sys, *ex, {"role":"user","content":q}]
```

## 五、与其他对比

- 与 检索增强生成深入（文档侧）互补为提示侧。
- 与 混合检索深入（双路检索）对照。

## 六、常见误区

- 示例与任务语义不匹配反伤性能。
- 检索示例过多挤占上下文。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- 提示搜索如何服务 RAG？答：检索相关示例/模板注入提示，是提示侧检索增强。

## 九、演进

文档RAG → 提示RAG → 双路联合检索。

## 十、小结

提示搜索可融入 RAG，检索示例增强指令，提升泛化。
