# 加权投票WeightedVoting

> 对应 Gifford 1979（Weighted Voting for Replicated Data，MIT）与 Coulouris《Distributed Systems: Concepts and Design》投票章节。

## 一、背景与挑战
普通 quorum 给每个副本一票，但副本可能异构（有的磁盘大、有的在网络中心）。加权投票让关键副本拥有更高权重，更贴近真实容错与性能需求。

## 二、核心原理
- 每个副本 i 有投票权重 $v_i$，总权重 $V = \sum v_i$。
- 写需获得权重和 $\ge W$ 的确认。
- 读需读取权重和 $\ge R$ 的副本。
- 约束 $W + R > V$ 保证相交。

## 三、形式化与数学基础
设总权重 V，权重阈值满足：
$W + R > V$
典型取 $W = R = \lceil V/2 \rceil + 1$。某副本故障仅损失其权重，不必达到数量多数。

## 四、代码实现
# 加权法定判定
def has_quorum(acks_weights, threshold):
    return sum(acks_weights) >= threshold

## 五、与其他技术对比
- 对比等权 quorum：加权反映节点重要性/容量。
- 对比主从：仍是去中心投票。

## 六、常见误区
1. 权重分配不当导致单点权重大。
2. 忽略权重总和变化（扩缩容）。

## 七、与开源书/权威来源对应
- Gifford 1979。
- Coulouris, Distributed Systems, Ch.16。
- Kleppmann, DDIA。

## 八、面试题
1. 加权投票如何修改 quorum 不等式？
2. 权重如何反映节点异构？

## 九、演进与趋势
动态调整权重随负载/健康度变化。

## 十、小结
加权投票把“票数”换成“权重”，使 quorum 适应异构与分级容错。
