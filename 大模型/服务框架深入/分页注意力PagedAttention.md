# 分页注意力PagedAttention

> 对应 Kwon et al., *vLLM: PagedAttention*, 2023；与 服务框架深入 衔接。

## 一、背景与挑战

KV Cache 随序列增长，朴素连续分配产生内部/外部碎片，限制并发。

## 二、核心原理

借鉴 OS 虚拟内存：把 KV 分块（block）并用块表映射，按需分配、请求间共享前缀块，消除碎片。

## 三、数学形式

注意力 $o_i=\sum_j \frac{\exp(q_i k_j^\top/\sqrt d)}{\sum_l \exp(q_i k_l^\top/\sqrt d)}v_j$，按 block 取 $k,v$；显存由 $B\times L\times 2hd$ 降为按需块数。

## 四、代码实现

```python
# vLLM 以 block table 索引 KV
attn = paged_attention(q, key_cache, value_cache, block_tables)
```

## 五、与其他对比

- 与 连续批处理（动态批需弹性 KV）配合。
- 与 内核调优深入（注意力融合 kernel）底层呼应。

## 六、常见误区

- 块大小过小增管理开销，过大降共享粒度。
- 前缀共享需显式 cache 复用机制。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer

## 八、面试题

- PagedAttention 解决什么？答：KV 分块按需分配，消除碎片并支持前缀共享，提升并发。

## 九、演进

连续 KV → 分页块 → 前缀/显存共享。

## 十、小结

PagedAttention 以 OS 思想管理 KV，是 vLLM 高并发的核心。
