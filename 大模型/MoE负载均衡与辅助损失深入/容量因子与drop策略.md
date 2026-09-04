# 容量因子与drop策略

> 对应 Fedus 2021 Switch Transformer; gshard 论文。

## 一、背景与挑战
即使有辅助损失，瞬时仍可能某些专家过载。容量因子（capacity factor）$C$ 限制每个专家最多处理 $C \cdot B/N$ 个 token。

## 二、核心原理
$C$ 是超参，$C=1$ 严格均衡，$C=1.25$ 留 25% buffer。过载的 token 被丢弃（router dropping）或绕过（no-token-left-behind）。

## 三、形式化与数学基础
专家 $i$ 容量 $c_i = \lceil C \cdot B/N \rceil$。若分配 token 数 $> c_i$，超出部分按策略处理。Switch Transformer 用 drop，超出 token 直接路由到下一层。

## 四、代码实现
```python
def cap_routing(scores, topk, cap_factor=1.25):
    B, N = scores.shape
    cap = int(cap_factor * B / N)
    # 仅保留每个专家 top-cap 个 token
    ...
```

## 五、与其他技术对比
- vs 无容量限制：更稳定但浪费专家。
- vs 严格均衡：留 buffer 适应尖峰。

## 六、常见误区
- $C$ 太小致大量 token 被 drop，性能下降。
- $C$ 太大失去保护作用。

## 七、与开源书/权威来源对应
- google/switch-transformer。
- d2l-ai/d2l-zh。

## 八、面试题
- 为何要设容量因子？答：防止个别专家过载成为瓶颈。

## 九、演进与趋势
固定容量 → 动态容量 → Expert Choice 替代。

## 十、小结
容量因子是 MoE 工程实践中不可或缺的稳定性保障。
