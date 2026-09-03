# 检索增强失效分析总览

> 对应 Barnett et al., *Seven Failure Points in RAG*, 2024；Liu et al., *Lost in the Middle*, 2023。

## 一、背景与挑战

RAG 并非万能：即便检索到正确文档，答案仍可能错误；需系统化定位失效环节。

## 二、核心原理

把 RAG 拆为“检索—上下文融合—生成”三段，逐段诊断：检索不到/检索噪、上下文未被用、生成不忠实。

## 三、数学形式

失败概率 $P_{fail} \approx P_{ret}\cdot(1-R)+P_{use|ret}\cdot(1-U)+P_{faith|use}\cdot(1-F)$；分段归因。

## 四、代码实现

```python
diag = {"retrieval": eval_recall(q, docs),
        "usage": probe_context_used(answer, ctx),
        "faith": check_faith(answer, ctx)}
```

## 五、与其他对比

- 与 检索重排序深入 / 混合检索深入（检索侧）互补。
- 与 上下文压缩深入（去噪）衔接。

## 六、常见误区

- 只测最终答案忽略分段归因。
- 把检索召回高等同于答案对。

## 七、与开源书对应

- dair-ai/Prompt-Engineering-Guide：https://github.com/dair-ai/Prompt-Engineering-Guide
- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- RAG 失败主要分几类？答：检索失败、上下文未用、生成不忠实三大段。

## 九、演进

无诊断 → 分段归因 → 自动失效检测。

## 十、小结

失效分析以分段归因定位 RAG 痛点，是优化前提。
