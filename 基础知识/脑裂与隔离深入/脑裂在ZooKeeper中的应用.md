# 脑裂在ZooKeeper中的应用

> 对应 Hunt et al. 2010（ZooKeeper 论文，leader election 与 quorum）与 Kleppmann DDIA 第9章。

## 一、背景与挑战
ZooKeeper 用 ZAB 协议选主并对外提供有序一致性。若发生脑裂且两侧都对外服务，将破坏线性一致。ZK 通过 quorum 与 epoch 防脑裂。

## 二、核心原理
- 选主需获得多数派选票（> N/2）。
- 每个 leader 有递增 epoch，提案带 epoch。
- follower 只接受更大 epoch 的 leader，陈旧 leader 被忽略。

## 三、形式化与数学基础
两个 leader 不可能同时获得 > N/2 选票（因总票 N，两多数派必相交矛盾），故任一时刻至多一个有效 leader。

## 四、代码实现
# 选主多数判定
def elect_ballots(votes, N):
    if len(votes) > N / 2:
        return True
    return False

## 五、与其他技术对比
- 对比 Redis Sentinel：Sentinel 也用 quorum 防脑裂。
- 对比 etcd/Raft：Raft 用 term 等效 epoch。

## 六、常见误区
1. 集群节点数为偶数导致平分。
2. 误以为 observer 也参与投票。

## 七、与开源书/权威来源对应
- Hunt et al. 2010, ZooKeeper。
- Ongaro & Ousterhout 2014, Raft。
- Kleppmann, DDIA, Ch.9。

## 八、面试题
1. ZK 如何保证脑裂下只有一个 leader？
2. epoch 的作用是什么？

## 九、演进与趋势
多 Raft 组（如 TiKV）把 quorum 限制在分片内降低冲突。

## 十、小结
ZK 用 quorum + epoch 把脑裂风险收敛为“少数派静默”。
