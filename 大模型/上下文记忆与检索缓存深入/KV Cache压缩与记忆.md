# KV Cache压缩与记忆

> 对应 StreamingLLM (Xiao 2023); H2O (Zhang 2023); Scissorhands。

## 一、背景与挑战
长序列推理时 KV Cache 显存线性增长，限制批大小与并发。需压缩或淘汰策略。

## 二、核心原理
方案：
- 滑动窗口：仅保留最近 $W$ 个 token 的 KV。
- 注意力汇聚（StreamingLLM）：保留初始几个 anchor + 最近 $W$。
- H2O：按累积注意力分数淘汰低分 token。
- Scissorhands：保留"重要"token。

## 三、形式化与数学基础
H2O 重要性分数 $I_i = \sum_t \text{attn}_{t,i}$（token $i$ 被所有 query 关注的总和）。淘汰分数最低的 $k$ 个 token。

## 四、代码实现
```python
# H2O 简化版
def evict_kv(kv_cache, importance, evict_ratio=0.3):
    n_evict = int(kv_cache.size(0) * evict_ratio)
    idx_to_keep = importance.topk(importance.size(0) - n_evict).indices
    return kv_cache[idx_to_keep]
```

## 五、与其他技术对比
- vs 量化：量化保留所有 token 但降低精度，淘汰减少 token 数。
- vs 滑动窗口：滑动窗口简单但断长程依赖。

## 六、常见误区
- 重要 token 评估需在推理时计算，开销大。
- 不同任务重要 token 分布不同。

## 七、与开源书/权威来源对应
- mit-han-lab/streaming-llm。
- ForwardLabs/H2O 仓库。

## 八、面试题
- 为何要保留 anchor token？答：初始 token 累积了大量注意力权重（attention sink）。

## 九、演进与趋势
滑动窗口 → StreamingLLM → H2O → SnapKV（按注意力模式）。

## 十、小结
KV Cache 压缩是长上下文推理的核心，淘汰策略需结合任务特性。
