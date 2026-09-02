# 首 token 延迟优化

> 见「推理优化/连续批处理」与「流式生成与响应优化/流式生成原理」。

## 一、背景与挑战

TTFT 受 prefill（处理 prompt）与排队影响，长 prompt 尤甚。

## 二、核心原理

优化 prefill（分块/并行注意力）、减小排队（continuous batching）、投机解码降低首步耗时。

## 三、关键要点

- 长上下文 prefill 是 TTFT 主因。
- 批处理提高吞吐但可能增延迟。

## 四、代码实现

```python
# 分块 prefill 降低单次峰值
for chunk in chunkify(prompt, 512): run_prefill(chunk)
```

## 五、与其他对比

- 优化吞吐（batching）与优化延迟（TTFT）目标不同。

## 六、常见误区

- 提高并发就降延迟——可能相反。

## 七、与开源书对应

- vLLM: https://github.com/vllm-project/vllm
- llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- 为何长 prompt 首 token 慢？

## 九、演进

整段 prefill → 分块 → 投机 prefill。

## 十、小结

TTFT 是流式体验的第一道关。
