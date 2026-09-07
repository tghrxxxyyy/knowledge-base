# 脑裂与Quorum

> 对应 Gifford 1979（Weighted Voting for Replicated Data，quorum 概念）与 Gilbert & Lynch 2002（CAP）。

## 一、背景与挑战
Quorum（法定多数）通过“写需 W 票、读需 R 票、W+R>N”约束，使任何两次操作必相交，从而在分区下用多数派天然阻止脑裂双写。

## 二、核心原理
- 把集群视为 N 个投票副本。
- 写成功需获得 W 个副本确认，读需读到 R 个副本。
- 由于 W+R>N，读必能见到最近一次写，分区中少数派无法达成 W 故不能写。

## 三、形式化与数学基础
核心不等式：
$W + R > N$
当网络分为两半，至多一侧副本数 $\ge \lceil (N+1)/2 \rceil$，另一侧 < N/2，无法凑齐 W（若 W > N/2），从而防脑裂。

## 四、代码实现
# 法定多数判定
def quorum_ok(acks, W):
    return acks >= W

def safe_config(N):
    W = N // 2 + 1
    R = N - W + 1
    return W, R   # 满足 W+R>N

## 五、与其他技术对比
- 对比 fencing：quorum 是预防性，fencing 是补救性。
- 对比全副本确认：quorum 容忍部分不可用。

## 六、常见误区
1. 设 W+R<=N 导致读不到最新写。
2. 偶数 N 下平分造成两侧都没多数。

## 七、与开源书/权威来源对应
- Gifford 1979, Weighted Voting。
- Gilbert & Lynch 2002。
- Kleppmann, DDIA, Ch.8。

## 八、面试题
1. 为什么 W+R>N 能保证读到最新？
2. 偶数节点如何防脑裂？

## 九、演进与趋势
动态 quorum 在分区修复时临时调整 W/R。

## 十、小结
Quorum 用集合相交性质从数学上阻止脑裂双写，是强一致的基石。
