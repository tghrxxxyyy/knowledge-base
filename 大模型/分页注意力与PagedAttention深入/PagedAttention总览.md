# PagedAttention总览

> 对应 Kwon et al., *vLLM: Easy, Fast, and Cheap LLM Serving with PagedAttention*, SOSP 2023。

## 一、背景与挑战

自回归生成需缓存历史 K/V（KV Cache），传统实现为每个序列预分配连续大块显存，形状按最大长度预留，造成大量内部碎片与预留浪费，限制并发与吞吐。

## 二、核心原理

PagedAttention 借鉴操作系统虚拟内存分页：把 KV Cache 切成固定大小的块（block/page），序列的逻辑块经块表映射到物理块，物理块可离散分配、按需增长。

## 三、数学形式

单头注意力 $o_i=\sum_{j\le i} \frac{\exp(q_i^\top k_j/\sqrt d)}{\sum_{t\le i}\exp(q_i^\top k_t/\sqrt d)}v_j$；块表 $M:\text{logical}\to\text{physical}$ 决定每个逻辑块对应的物理 K/V。

## 四、代码实现

```python
kv_blocks = [physical[M[l]] for l in range(num_logical)]
k = torch.cat([b.k for b in kv_blocks], dim=0)
```

## 五、与其他对比

- 相比静态连续缓存，显存利用率高、支持共享。
- 与 FasterTransformer 连续 KV 相比，更省碎片但需块表间接寻址。

## 六、常见误区

- 误以为块表无开销；小 batch 时间接寻址略有成本。
- 块太小致管理元数据膨胀，太大致碎片回升。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- PagedAttention 解决什么？答：KV Cache 显存碎片与预留浪费，用分页按需分配提升并发。

## 九、演进

连续缓存 → 分页(KV Cache) → 块级共享/交换。

## 十、小结

PagedAttention 以虚拟内存式分页管理 KV Cache，是提升 LLM 服务吞吐与显存效率的关键。
