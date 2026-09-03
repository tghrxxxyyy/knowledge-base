# KV缓存与前缀缓存

> 对应 Transformer KV Cache（Vaswani et al., 2017）；注意力机制基础。

## 一、背景与挑战

自回归每步需历史 K/V，前缀缓存把历史 KV 持久化复用。

## 二、核心原理

注意力中 $Attention(Q,K,V)=softmax(QK^T/\sqrt d)V$；前缀 token 的 K/V 可在请求间共享，不必重算。

## 三、数学形式

单步注意力 $o_t = \sum_{j\le t} \alpha_{tj} v_j$；前缀 $j\le m$ 的 $k_j,v_j$ 缓存复用。

## 四、代码实现

```python
# 伪代码：前缀 KV 复用
past_kv = cache.get(prefix_hash)
logits = model(input_ids, past_key_values=past_kv)
```

## 五、与其他对比

- 与 连续批处理深入（共享批次）互补提升吞吐。
- 与 提示缓存深入 同用 KV 但层级不同。

## 六、常见误区

- 混淆解码缓存（同请求内）与跨请求前缀缓存。
- 忽略不同温度/采样不影响 KV 复用。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 为何 KV 可跨请求共享？答：前缀 token 的 K/V 只依赖自身与前缀，与后续新 token 无关。

## 九、演进

每步重算 → 单请求 KV → 跨请求前缀 KV。

## 十、小结

前缀缓存建立在 KV Cache 之上，复用前缀 K/V 省 prefill。
