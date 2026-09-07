# NWR模型

> 对应 DeCandia et al. 2007（Dynamo：N,R,W 参数）与 Kleppmann DDIA 第5章（replication）。

## 一、背景与挑战
Dynamo 把复制参数化为 (N, R, W)：N 为副本数，R 为读所需副本数，W 为写所需副本数。通过调参在一致性与延迟间灵活权衡。

## 二、核心原理
- N：每个对象的副本总数（通常 3）。
- W：写需确认的副本数。
- R：读需查询的副本数。
- 当 $W + R > N$ 时为强一致读；否则为最终一致。

## 三、形式化与数学基础
耐久性概率（副本独立故障率 p）：
$P_{loss} = \sum_{k=W}^{N} \binom{N}{k} p^k (1-p)^{N-k}$
提高 W 增大写延迟但降低数据丢失概率。读一致条件仍是 $W+R>N$。

## 四、代码实现
# 依据 N/R/W 判定一致级别
def consistency_level(N, R, W):
    return "strong" if R + W > N else "eventual"

## 五、与其他技术对比
- 对比固定主从：NWR 可在请求级调强弱。
- 对比 Paxos：NWR 不保证线性一致，仅顺序一致视图。

## 六、常见误区
1. 把 N=3,W=1,R=1 当作强一致。
2. N 小于期望容错数。

## 七、与开源书/权威来源对应
- DeCandia et al. 2007, Dynamo §4。
- Kleppmann, DDIA, Ch.5。
- Vonng/ddia。

## 八、面试题
1. N=3,W=2,R=2 是一致还是最终一致？
2. 如何提高写的耐久性？

## 九、演进与趋势
按数据重要度动态设 N/R/W，冷热分层。

## 十、小结
NWR 把一致性与可用性变成可调旋钮，是 AP 系统的灵活性来源。
