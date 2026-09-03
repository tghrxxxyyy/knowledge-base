# 增量解码与 KV 缓存增长

> 对应自回归增量解码与 KV Cache 机制（标准 Transformer 推理）。

## 一、背景与挑战

朴素自回归每步重算全部历史注意力，复杂度 $O(t^2)$；增量解码缓存历史 KV 使每步仅增常量计算。

## 二、核心原理

首次前向算并缓存所有历史 K/V；之后每步只对新 token 算 Q/K/V，拼接缓存得注意力，避免重复计算。

## 三、数学形式

注意力 $A_t = \text{softmax}(Q_t K_{1:t}^\top / \sqrt d) V_{1:t}$；缓存 $K_{1:t},V_{1:t}$ 随步增长，显存 $O(t\cdot d\cdot L)$。

## 四、代码实现

```python
logits, past = model(input_ids, past_key_values=past)   # 复用历史 KV
next_id = logits[-1].argmax()
past = update(past, new_kv)
```

## 五、与其他对比

- 是 投机解码 / 前缀缓存 的基础。
- 与 KV缓存优化深入 直接重叠（量化/分页）。

## 六、常见误区

- 长序列 KV 显存爆炸未分页。
- 缓存精度过高（可量化降显存）。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 增量解码为何省算力？答：缓存历史 K/V，每步只算新 token 的 Q/K/V，避免重算全历史。

## 九、演进

全量重算 → KV 缓存 → 分页/量化 KV。

## 十、小结

增量解码以 KV 缓存换取线性时间，是现代推理基石。
