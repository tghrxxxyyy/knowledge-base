# Quorum原理

> 对应 Gifford 1979（Weighted Voting for Replicated Data）与 Kleppmann DDIA 第8章（quorum reads/writes）。

## 一、背景与挑战
在复制系统中，如何既保证读写能看到彼此，又容忍部分副本故障？Quorum 通过“读写所需的最小副本数”给出通用答案。

## 二、核心原理
- 系统有 N 个副本。
- 写需获得 W 个副本确认才算成功。
- 读需读取 R 个副本。
- 约束 $W + R > N$ 保证任意读都能与最近写相交。

## 三、形式化与数学基础
核心不等式：
$N \ge W + R - 1$ 即 $W + R > N$
由此，任意读集合与写集合必有交集，读必包含至少一份最新写。读延迟约 $R_{slowest}$，写延迟约 $W_{slowest}$。

## 四、代码实现
# 计算法定数
def quorum(N, read_strong=True):
    if read_strong:
        W = N // 2 + 1
        R = N - W + 1
    else:
        W = 1
        R = 1
    return W, R

## 五、与其他技术对比
- 对比全副本同步：quorum 容忍部分慢/故障副本。
- 对比主从异步：quorum 可读到一致视图。

## 六、常见误区
1. 设 W=1,R=1 以为强一致——实际是弱一致。
2. 忽略 N 为偶数时的边界。

## 七、与开源书/权威来源对应
- Gifford 1979, Weighted Voting。
- Kleppmann, DDIA, Ch.8。
- Vonng/ddia quorum 章节。

## 八、面试题
1. 为什么 W+R>N 能保证一致读？
2. W/R 如何选择影响延迟与可用？

## 九、演进与趋势
加权 quorum 让重要副本拥有更高投票权重。

## 十、小结
Quorum 用集合相交把“可见性”与“可用性”参数化，是复制系统的核心抽象。
