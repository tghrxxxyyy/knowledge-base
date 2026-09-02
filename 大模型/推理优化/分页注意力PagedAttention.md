# 分页注意力 PagedAttention

> 对应 Kwon et al., *vLLM*, 2023。推理引擎显存管理的里程碑。

## 一、核心概念

传统 KV Cache 为每个请求预留**连续**最大长度显存，造成严重内部碎片(实际用很短)与外部碎片。PagedAttention 借鉴操作系统**虚拟内存分页**：把 KV Cache 分成固定大小的「块(block/page)」，按需分配、可非连续存放，请求间可共享相同前缀(如系统提示)的页，显存利用率大幅提升，吞吐数倍增长。

## 二、关键要点

| 机制 | 收益 |
|------|------|
| 分页 | 消除碎片 |
| 共享前缀页 | 多请求省显存 |
| 按需分配 | 高并发 |

## 三、常见误区

- 误以为 PagedAttention 改变了注意力数学——它只优化显存管理，结果不变。

## 四、与开源书的对应

- Kwon et al., *vLLM: Easy, Fast, and Cheap LLM Serving with PagedAttention*, 2023.
- vLLM: https://github.com/vllm-project/vllm

## 七、面试题

- PagedAttention 如何提升显存利用率？
- 它改变了注意力的计算结果吗？
