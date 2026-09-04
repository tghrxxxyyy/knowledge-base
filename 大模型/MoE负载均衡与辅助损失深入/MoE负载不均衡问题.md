# MoE负载不均衡问题

> 对应 Shazeer 2017 *Outrageously Large Neural Networks*; Fedus 2021 Switch Transformer。

## 一、背景与挑战
MoE 用 top-k 路由选专家，若路由集中到少数专家，大部分专家闲置，浪费参数；过载专家成为瓶颈，限制吞吐。

## 二、核心原理
负载不均衡源自路由网络的 softmax 输出偏斜。少数专家得分高，多数得分低。训练中"赢者通吃"导致强化。

## 三、形式化与数学基础
设 $f_i$ 为分配到专家 $i$ 的 token 比例，理想 $f_i = 1/N$。实际中 $f$ 分布方差大。辅助损失通过惩罚偏离均匀分布来缓解。

## 四、代码实现
```python
# 监控负载
importance = scores.sum(0)  # (N,)
load = (topk_idx.bincount(minlength=N)).float() / topk_idx.numel()
print(f'load std: {load.std():.3f}')
```

## 五、与其他技术对比
- vs 专家并行：专家并行解决计算分布，不解决路由偏斜。
- vs 哈希路由：哈希路由天然均衡但表达力弱。

## 六、常见误区
- 仅靠辅助损失不够，需配合容量因子（capacity factor）与 drop policy。
- 监控 $f_i$ 方差是首要指标。

## 七、与开源书/权威来源对应
- google/switch-transformer。
- mistralai/mixtral。

## 八、面试题
- 为何 MoE 会出现负载不均？答：路由的 softmax 倾向于放大已偏斜的分布。

## 九、演进与趋势
top-k → Switch（k=1）→ 专家选择损失（Expert Choice）→ 共享专家。

## 十、小结
负载不均是 MoE 训练的核心挑战，需辅助损失、容量因子等组合手段。
