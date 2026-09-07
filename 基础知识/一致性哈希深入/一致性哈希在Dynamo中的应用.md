# 一致性哈希在Dynamo中的应用

> 对应 DeCandia et al. 2007（Amazon Dynamo 论文，第4.2节 Partitioning）与 Kleppmann DDIA 第6章。

## 一、背景与挑战
Dynamo 需要把数据 key 均匀分布到大量节点，同时节点会频繁上下线。一致性哈希天然契合这一需求，使扩容/缩容只迁移局部数据。

## 二、核心原理
- 每个 key 通过一致性哈希定位到 token 环上的一个 vnode。
- 该 vnode 负责节点及其顺时针后续 N-1 个节点构成副本链（preference list）。
- 节点加入时，它从相邻节点接管部分 vnode 区间。

## 三、形式化与数学基础
设副本因子 R，每个 key 的副本落在环上连续 R 个 vnode 对应的物理节点。迁移量约为 $O(K/N)$，扩容对整体影响可控。

## 四、代码实现
# 构造 preference list
def preference_list(ring, key, R):
    h = hash(key) % (2**32)
    ordered = sorted(k for k in ring if k >= h)
    ordered += sorted(k for k in ring if k < h)
    return [ring[h2] for h2 in ordered[:R]]

## 五、与其他技术对比
- 对比 HDFS 固定块映射：Dynamo 动态、无中心。
- 对比 Bigtable：Bigtable 用 tablet 分裂而非哈希环。

## 六、常见误区
1. 认为副本一定在不同物理机——需显式去重同机。
2. 忽略 preference list 跨机架分散。

## 七、与开源书/权威来源对应
- DeCandia et al. 2007, §4.2。
- Kleppmann, DDIA, Ch.6。
- Vonng/ddia。

## 八、面试题
1. Dynamo 的 preference list 如何保证副本分散？
2. 扩容时数据如何迁移？

## 九、演进与趋势
Kubernetes 上有状态服务用类似 Ring 做分片调度。

## 十、小结
一致性哈希 + vnode 是 Dynamo 高可用、易扩展分区方案的核心。
