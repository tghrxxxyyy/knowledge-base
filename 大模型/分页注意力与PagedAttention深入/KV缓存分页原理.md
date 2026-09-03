# KV缓存分页原理

> 对应 vLLM PagedAttention（Kwon et al., 2023）；与 迭代级批处理调度深入 共享显存管理视角。

## 一、背景与挑战

不同序列长度差异大，按最大长度预留显存使显存利用率常低于 40%，无法服务更多并发请求。

## 二、核心原理

将每层每序列的 KV 按 token 分块，块大小固定（如 16 token）；新 token 到来时分配新物理块并登记块表，序列长度即逻辑块数，无需连续。

## 三、数学形式

显存占用 $M=\sum_s b_s\cdot \text{block\_bytes}$，其中 $b_s=\lceil \ell_s/B\rceil$；利用率较连续预留提升约 1/碎片率。

## 四、代码实现

```python
block = free_blocks.pop()
table.append(block)
cache[block].write(kv_new)
```

## 五、与其他对比

- 与 权重内存分页与卸载深入 思路类似（均分页），但对象分别是 KV 与权重。
- 与 连续批处理 配合解耦序列生命周期。

## 六、常见误区

- 块大小固定却忽视注意力跨块依赖，需块表正确串联。
- 误以为分页消除全部碎片（仍有末块未用满的外部碎片）。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 块大小如何选？答：太小元数据开销大、太大碎片多，常取 16/32 token 实测折中。

## 九、演进

整段预留 → 固定块分页 → 自适应块大小。

## 十、小结

KV 分页把显存分配粒度降到块级，配合按需增长显著提升利用率与并发。
