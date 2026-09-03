# PagedAttention与其他KV管理对比

> 对应 FasterTransformer、HuggingFace 静态 KV 与 vLLM 分页对比。

## 一、背景与挑战

不同引擎 KV 管理策略差异大，选型需知取舍。

## 二、核心原理

FasterTransformer 用预分配连续 KV + 滑动窗口；HF 默认随序列增长拼接；vLLM 分页按需。连续方案简单但碎片高，分页省显存但需块表。

## 三、数学形式

碎片率 $\phi=1-\frac{\sum_s \ell_s B}{\sum_s (\lceil \ell_s/B\rceil B)}$；分页使 $\phi$ 仅含末块。

## 四、代码实现

```python
# 静态：预留 max_len
k_cache = torch.empty(batch, layers, max_len, h, d)
```

## 五、与其他对比

- 与 迭代级批处理调度深入：分页解耦长度，调度解耦生命周期。
- 与 FlashAttention（不存全 KV）互补于训练场景。

## 六、常见误区

- 认为分页总是更优（极小 batch 时块表开销占比上升）。
- 混用不同引擎的 KV 格式。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 分页 KV 相对静态优势？答：按需分配、低碎片、支持共享与抢占。

## 九、演进

静态 → 预分配连续 → 分页共享。

## 十、小结

PagedAttention 在显存效率上显著优于静态 KV 管理，是服务化首选。
