# KV缓存显存成本

> 对应 KV 显存占比（PagedAttention 背景）；显存即成本。

## 一、背景与挑战

长上下文 KV 常占主要显存，限制并发与吞吐，直接关联成本。

## 二、核心原理

KV 显存 $\propto$ 序列长×层数×隐藏维×2(K/V)×精度；分页/前缀共享/滑动窗口降占用。

## 三、数学形式

$KV_{bytes} = 2 \cdot L \cdot n_{layers} \cdot d_{model} \cdot \frac{b}{8} \cdot S$（S 序列数）。

## 四、代码实现

```python
kv_gb = 2*seq*L*dmodel*(b/8)*n / 1e9
if kv_gb > gpu_mem*0.8: reject_long()
```

## 五、与其他对比

- 与 PagedAttention深入（管理）衔接（本节算账）。
- 与 模型服务负载均衡深入（并发上限）相关。

## 六、常见误区

- 忽略 KV 随并发线性涨致 OOM。
- 长上下文无上限放开。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- KV 为何占显存大？答：每 token 每层存 K/V，长序列×并发快速累积。

## 九、演进

预分配 → 分页 → 前缀共享降冗余。

## 十、小结

KV 显存是并发与成本瓶颈，分页/共享是关键。
