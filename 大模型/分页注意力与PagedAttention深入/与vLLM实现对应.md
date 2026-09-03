# PagedAttention与vLLM实现对应

> 对应 vLLM 开源实现（Kwon et al., 2023）。

## 一、背景与挑战

论文思想需落地为可调度、可抢占的引擎，涉及块管理、调度、内核多组件。

## 二、核心原理

vLLM 以 BlockSpaceManager 管理空闲/占用块，Scheduler 按块表分配，Worker 调 PagedAttention CUDA 内核；KV 以 (seq, block, token) 三维索引。

## 三、数学形式

逻辑长度 $\ell$ 映射物理块数 $\lceil \ell/B\rceil$；剩余可写容量 $B-(\ell\bmod B)$。

## 四、代码实现

```python
mgr.allocate(seq);  # 分配块
worker.forward(tokens, block_tables)
```

## 五、与其他对比

- 与 TensorRT-LLM 的 KV Cache 管理策略不同（后者偏静态/分组）。
- 与 迭代级批处理调度深入 紧耦合（调度以块为单位）。

## 六、常见误区

- 把 vLLM 等同 PagedAttention；后者仅为 KV 管理子模块。
- 忽略抢占时块交换对延迟的影响。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- vLLM 中谁管理块？答：BlockSpaceManager 负责空闲块分配/回收与块表维护。

## 九、演进

原型内核 → 工程化块管理 → 多级缓存/交换。

## 十、小结

vLLM 把 PagedAttention 工程化为块管理+调度+内核的完整系统。
