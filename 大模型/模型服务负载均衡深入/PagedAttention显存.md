# PagedAttention显存管理

> 对应 Kwon et al., *PagedAttention*, 2023（vLLM）。

## 一、背景与挑战

KV 缓存随序列增长，预分配大块致碎片与浪费（常占 60%+ 显存）。

## 二、核心原理

借鉴操作系统虚拟内存：KV 分固定页（block），逻辑连续、物理不连续，按需分配；请求间可共享前缀页。

## 三、数学形式

显存节省来自消除预留：$\text{frag} = \text{reserved} - \text{used}$；分页后 $\text{frag}\approx 0$。

## 四、代码实现

```python
# vLLM 自动分页，无需手动；概念：
block_table[req] = [phys_0, phys_3, ...]   # 逻辑->物理
```

## 五、与其他对比

- 与 连续批处理深入 配合（slot 级管理）。
- 与 成本优化与资源调度深入（显存=成本）相关。

## 六、常见误区

- 以为 KV 可无限增长；仍受物理块上限。
- 忽视 prefix 共享需相同 tokenizer/上下文。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- PagedAttention 省显存原理？答：KV 分块按需分配、物理不连续，消除预留碎片、支持共享。

## 九、演进

预分配 → 缓存复用 → 分页（vLLM）→ 前缀共享。

## 十、小结

PagedAttention 把显存当虚拟内存，提利用率、降碎片。
