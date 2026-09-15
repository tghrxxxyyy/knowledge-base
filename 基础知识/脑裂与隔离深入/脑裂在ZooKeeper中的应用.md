# 脑裂在ZooKeeper中的应用

> 对应 Hunt et al. 2010（ZooKeeper 论文，leader election 与 quorum）与 Kleppmann DDIA 第9章。

## 一、背景与挑战
ZooKeeper 用 ZAB 协议对外提供「线性一致的元数据服务」，典型用于选主、配置、分布式锁。若发生脑裂且两侧都对外服务，会出现两个「主」各自批准锁/选主，破坏线性一致。ZK 通过 quorum 选主 + 递增 epoch + 仅接受更大 epoch 提案，从协议层保证「任一时刻至多一个有效 leader」，把脑裂收敛为「少数派静默」。

ZK 的客户端会话（session）、临时节点（ephemeral znode）、顺序节点（sequential znode）都依赖这一保证：锁的实现靠「创建临时顺序节点 + 看自己是否最小」，若脑裂导致两个 leader 都批准锁，这套机制就会崩溃。因此 ZK 自身必须先解决脑裂。

ZK 的三个角色需先分清：Leader（处理所有写、发起提案）、Follower（参与投票与写、可服务读）、Observer（只同步日志、不参与投票，用于横向扩展读吞吐而不增大投票集合）。安全性的前提是「投票集合只含 Leader 与 Follower」，Observer 的加入不改变 quorum 大小，这一点常被误读为「加机器提升可用性」。

另一类挑战是「会话续期与脑裂的交互」：客户端与 Leader 建立 session 并定期心跳续期。若分区导致客户端连到少数派，其 session 会因无法续期而超时，进而导致其持有的临时节点被删除（锁被释放）；而多数派侧可能已完成重新选主。这个「看似锁被无故释放」的现象，本质上是脑裂被正确地转化为「少数派静默」的副作用。

## 二、核心原理
- 选主需获得多数派（> N/2）选票，故不可能有两个 leader 同时获多数。
- 每个 leader 带一个递增的 epoch（朝代号）；所有写提案都标注 epoch。
- Follower 只接受 epoch 大于等于自己已见最大值的提案；陈旧 leader（epoch 较小）的提案被直接忽略。
- 新 leader 上任前要先与多数派同步已提交日志，确保不丢已提交数据（commit 过的日志必被新 leader 继承）。
这套机制与 Raft 的 term 高度同构：epoch 即 term，ZAB 的「原子广播」对应 Raft 的日志复制。

ZAB 把协议分为两个阶段：选主（Leader Election）与原子广播（Atomic Broadcast）。只有完成选主并让新 leader 与多数派完成「日志同步（discovery + synchronization）」后，才进入广播阶段接受新事务。这保证了「新 leader 上任前，历史已提交事务对新 leader 可见」，是 leader 完备性的工程落地。

写路径为：客户端请求 → Leader 生成事务（带 zxid，高 32 位为 epoch、低 32 位为计数器）→ 广播 PROPOSAL 给所有 Follower → 收到多数 ACK 后 Leader 发 COMMIT → Follower 应用并回响应。zxid 的单调性使「新事务」天然大于「旧事务」，epoch 差异即可用于隔离陈旧 leader。

## 三、形式化与数学基础
两个 leader 不可能同时获得 > N/2 选票：总票为 N，若 leader1、leader2 各获 > N/2 票，则二者得票集合交集至少 $2\cdot(N/2)-N = 1$ 票（鸽巢原理），同一 follower 不能投两票，矛盾。故：
$$\text{有效 leader 数} \le 1$$
epoch 单调保证：陈旧 leader 的提案 epoch 必小于当前，被 follower 拒绝，从而被隔离。已提交安全性（safety）：任意被多数派确认的提案，必出现在未来所有 leader 的日志中——这是 ZAB/Raft 的「leader 完备性」引理。

更形式地说，设 $Q_1, Q_2$ 为两个 quorum，满足 $|Q_1| > N/2$ 且 $|Q_2| > N/2$，则 $|Q_1 \cap Q_2| \ge |Q_1| + |Q_2| - N > 0$。任一节点在其生命周期内对同一 epoch 只投一票，故「同一 epoch 内两个 leader」不可能成立。跨 epoch 的安全性由「新 leader 必须先同步多数派中最高 zxid 的日志」保证，从而不会覆盖已提交事务。

可用性与 quorum 大小的关系：容忍 $f$ 个节点故障需 $N \ge 2f+1$。因此 3 节点容忍 1 故障、5 节点容忍 2 故障，写成偶数（如 4 节点）只能容忍 1 故障却要多付一份同步成本，这是「集群用奇数」的定量依据。

## 四、代码实现
```python
# 选主多数判定 + epoch 校验
def elect_ok(votes, N):
    return len(votes) > N / 2

def accept_proposal(prop_epoch, local_max_epoch):
    return prop_epoch >= local_max_epoch   # 仅接受更大/相等 epoch

# 新 leader 恢复：与多数派同步已提交日志
def become_leader(self):
    self.epoch += 1
    sync_with_quorum(self.log)   # 保证继承所有已提交提案
    replay_committed(self.log)
```

写入路径的多数确认示意：

```python
def leader_write(self, txn):
    txn.zxid = (self.epoch << 32) | self.next_counter()   # epoch 在高位
    acks = self.broadcast_proposal(txn)                    # 广播给所有 follower
    if len(acks) + 1 > self.N / 2:                         # 含自身
        self.broadcast_commit(txn)                         # 多数确认后提交
        return True
    return False                                           # 未达多数，事务不提交
```

## 五、与其他技术对比
| 维度 | ZooKeeper/ZAB | etcd/Raft | Redis Sentinel | Chubby |
| --- | --- | --- | --- | --- |
| 防脑裂 | quorum + epoch | quorum + term | quorum + 主观下线 | 租约 + fencing |
| 提交模型 | ZAB 原子广播 | Raft 日志复制 | 异步复制 | Paxos |
| 一致性 | 线性一致 | 线性一致 | 最终一致 | 线性一致 |
| 读扩展 | Observer | Learner | 副本只读 | 不适用 |
| 顺序一致性载体 | zxid | term + log index | offset | 序号 |

需注意 ZK 的读默认是「顺序一致（sequential consistency）」而非严格线性一致：读请求可被 Follower 直接服务，可能读到稍旧的数据；若需线性一致读，须显式发 `sync` 后再读。相比之下 etcd 的线性一致读需经 ReadIndex/租约，语义更强但开销更高。

## 六、常见误区
1. 集群节点数为偶数。平分时两侧都无多数，选主卡住、扩大不可用（虽防了双主，但可用受损）。
2. 以为 observer 参与投票。Observer 只同步、不投票，不计入 quorum 计算，用于扩展读吞吐。
3. 以为 ZK 自动解决应用层脑裂。ZK 保证自身元数据一致，应用仍需基于它做正确选主。
4. 以为 epoch 不增也能安全。epoch 不增则新旧 leader 提案无法区分，陈旧 leader 写会被误接受。
5. 以为 ZK 的读天然线性一致。Follower 读可能读到旧值，需要 `sync` 才能保证读到你写。
6. 以为加节点就能提升写可用性。写可用性由 quorum 大小决定，节点越多 quorum 越大、单次提交延迟越高。
7. 把 session 超时当纯粹的网络问题。session 超时会释放临时节点（锁），这是脑裂正确性的一部分而非故障。

## 七、与开源书·权威来源对应
- Hunt et al. 2010（ZooKeeper 论文）：leader election、ZAB、quorum。
- Ongaro & Ousterhout 2014（Raft）：term 与 leader 安全的等价论证。
- Kleppmann《DDIA》第 9 章：共识与 ZooKeeper 应用。
- Lamport 1998（Paxos）：ZAB 的思想源头。
- Coulouris《Distributed Systems》第 15 章：协调与共识的一般框架。

## 八、面试题
1. ZK 如何保证脑裂下只有一个有效 leader？
   要点：选主需多数派、两多数必相交矛盾，故至多一主；epoch 隔离旧主。
2. epoch（朝代号）的作用是什么？
   要点：标识 leader 代次，follower 只接受更大 epoch，陈旧 leader 提案被拒。
3. 为什么集群节点数建议奇数？
   要点：避免平分无多数，缩小不可用窗口同时仍防双主。
4. ZAB 的 leader 完备性与 Raft 的 term 安全有何关系？
   要点：本质同构，都保证已提交提案不被新 leader 覆盖、陈旧 leader 被隔离。
5. ZK 的读是线性一致的吗？
   要点：默认不是（Follower 可能读到旧值），需先 `sync` 强制与 leader 同步后再读。
6. 容忍 f 个故障需要多少节点？
   要点：$N \ge 2f+1$，因为写需多数派确认，quorum 必须能覆盖所有可达故障集。

## 九、演进与趋势
多 Raft 组（如 TiKV 的 multi-raft）把 quorum 约束到分片内，降低跨分片冲突；etcd 用 Raft 取代 ZAB 成为事实标准；云原生控制面普遍把协调委托给「quorum + term」类共识，并把 fencing 下沉到资源层（如 Kubernetes 的 lease 资源）。

另一趋势是把共识与元数据服务解耦：ZK/etcd 只负责「谁持有租约」，真正的互斥由存储层的条件写（CAS）保证，从而避免「选主成功但旧主仍在写」的窗口。这与 fencing token 的思路一脉相承。

## 十、小结
ZK 用 quorum 选主 + 递增 epoch 把脑裂风险收敛为「少数派静默」：协议层保证任一时刻至多一个有效 leader，陈旧 leader 的提案因 epoch 较小被拒。这是共识算法防脑裂的经典范例，也是上层分布式锁/选主可靠性的根基。理解 ZAB 与 Raft 的同构关系，以及「读语义」与「quorum 大小」两个易被忽视的细节，才能真正把 ZK 用对。
