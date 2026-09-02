# PagedAttention 深入

> 见「推理优化/分页注意力PagedAttention」与「推理引擎深入/推理引擎选型」。

## 一、背景与挑战

KV 缓存碎片与预留浪费显存，限制并发。

## 二、核心原理

仿 OS 分页：KV 缓存分块（page）按需分配，序列共享前缀页（SGLang 的 RadixAttention），消除碎片、提并发。

## 三、关键要点

- 显存利用率近 100%。
- 前缀共享省重复计算。

## 四、代码实现

```python
# 伪：KV 按 block 分配
block = allocator.alloc(); kv_cache[seq].append(block)
```

## 五、与其他对比

- 连续预留浪费；分页按需。

## 六、常见误区

- 分页慢——实际更快更省。

## 七、与开源书对应

- vLLM PagedAttention 论文.
- llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- PagedAttention 如何解决显存碎片？

## 九、演进

预留 → 分页 → 前缀共享。

## 十、小结

PagedAttention 是服务引擎核心。
