# Raft日志复制机制

> 对应 Ongaro & Ousterhout 2014（Raft 论文）与 MIT 6.824 Lab2。

## 一、背景与挑战

共识算法要在不可靠节点上让一组副本对「一条命令序列」达成一致。以 etcd 的 `Put` 为例：客户端写请求只发给 Leader，Leader 须保证这条命令被复制到多数派并 apply 到所有副本的状态机，即便中途有节点崩溃、网络分区、甚至重复 Leader 切换。Raft 把问题拆成领导选举、日志复制、安全性三块，日志复制是数据通路的核心。相比 Paxos 把这一切揉进一个难以直觉的协议，Raft 用强 Leader 与清晰的任期（term）机制使复制路径可被逐步推导与验证——这也是它能在工程界取代 Paxos 的关键。

日志复制面临的挑战可归纳为三类：一是「收敛」（Follower 可能落后或分叉，必须能被拉回 Leader 视图）；二是「不丢」（任何已提交项不得被覆盖）；三是「可判定」（必须能精确知道哪些项已安全提交）。三者分别由 prev 检查、Leader 完整性与当前任期提交规则承担，这也是理解 Raft 的三把钥匙。

## 二、核心原理

Leader 把客户端命令封装为日志项 `(term, index, cmd)`，其中 `index` 为槽位，`term` 标记产生时的任期。复制走 `AppendEntries` RPC：Leader 在请求里带 `prevLogIndex` 与 `prevLogTerm` 作为对齐锚点，同时维护每副本的 `matchIndex`（已匹配到的最高 index）与 `nextIndex`（下次要发的起点）。Follower 若本地日志在该锚点处一致则接收并追加，否则拒绝，由 Leader 回退 `nextIndex` 重试。一旦某条当前任期的日志复制到多数派（含 Leader 自身），Leader 即推进 `commitIndex`，并在后续心跳/追加中把 `commitIndex` 告知 Follower；Follower 据此把 `lastApplied` 推进到 `commitIndex` 并 apply 状态机。注意 Follower 严格按 index 顺序匹配与 apply，不允许空洞。

关于 `nextIndex` 的回退优化值得展开：朴素实现每次被拒只递减 1，若 Follower 落后上千条，就需上千次往返。生产实现利用 Follower 返回的冲突信息（冲突项所属 term）一次性跳过该 term 的所有条目，把回退成本从 $O(N)$ 降到 $O(\text{term 数})$。这一优化不改变正确性，纯粹是减少 RPC 轮次，是「安全优先、性能可优化」设计哲学的典型体现。

## 三、形式化与数学基础

日志匹配性质（Log Matching Property）是整个复制安全性的基石：若两个日志在 index $i$ 处的 term 相同，则它们自 $1$ 到 $i$ 的所有项完全一致，且 term 也一致。可由 AppendEntries 的 prev 检查归纳证明（归纳基：空日志显然；归纳步：若 index $i$ 锚点 term 一致，则 index $i$ 之前由归纳假设一致）。设 Leader 日志为 $L$，Follower 为 $F$，冲突点 $c$ 满足 $L[c].term \neq F[c].term$，则 Leader 强制用自身后缀覆盖：

$$F[1..c-1] = L[1..c-1],\quad F[c..] \leftarrow L[c..]$$

该覆盖保证不会丢弃任何已提交项（由 Leader 完整性保证），因此复制过程是「收敛到 Leader 视图」而非「随意合并」。

归纳证明的关键一步是「prev 检查既是必要条件也是充分条件」：必要，因为若锚点 term 不一致则前缀必然不一致；充分，因为一旦锚点一致，由归纳假设前缀已完全一致，故新追加项之后的前缀也一致。正是这一「双向性」使得 Follower 可以在不传输整条日志的情况下确信前缀正确——这是 Raft 复制高效且可被证明的根本原因。

## 四、代码实现

```python
def append_entries(leader_log, follower_log, prev_idx, prev_term, entries):
    # 锚点检查：prev 处必须 term 一致，否则拒绝
    if prev_idx >= len(follower_log) or follower_log[prev_idx].term != prev_term:
        return False
    # 找到第一个冲突项，截断 Follower 后续不一致后缀
    i = 0
    while i < len(entries):
        pos = prev_idx + 1 + i
        if pos >= len(follower_log):
            break
        if follower_log[pos].term != entries[i].term:
            follower_log = follower_log[:pos]
            break
        i += 1
    # 追加剩余新项
    follower_log.extend(entries[i:])
    return True

# Leader 侧：根据 matchIndex 推进提交（仅当前 term 项可提交，见提交规则文档）
def advance_commit(leader):
    leader.commit_index = max(i for i in leader.match_indexes
                               if leader.log[i].term == leader.current_term)

# 优化版回退：利用冲突 term 一次性跳过该 term 的全部条目
def backoff_next_index(conflict_term, conflict_index, follower_log):
    if conflict_term == 0:
        return conflict_index              # 该 term 在 Follower 中不存在
    while conflict_index > 0 and follower_log[conflict_index].term == conflict_term:
        conflict_index -= 1                # 跳到该 term 的第一条之前
    return conflict_index + 1
```

`backoff_next_index` 展示了「冲突信息如何被利用」：Follower 返回「我在 index $i$ 处的 term 是 $t$」，Leader 便可推断 Follower 中所有 term 为 $t$ 的条目都与自己不同，从而一次性跳过整段，而不是逐条试探。

## 五、与其他技术对比

| 维度 | Raft | Multi-Paxos | Zab |
| --- | --- | --- | --- |
| 角色模型 | 强 Leader，角色清晰 | 稳定 Leader 但角色模糊 | Leader 事务广播 |
| 复制路径 | AppendEntries 显式 | Accept 复用 | proposal/commit |
| 可理解性 | 高，分阶段证明 | 低，需自行工程化 | 中 |
| 日志连续 | 强制连续 | 可含空洞 | 强制连续（zxid） |
| 典型系统 | etcd / TiKV / Consul | 多种私有实现 | ZooKeeper |

三者能力等价，Raft 以「强 Leader + 日志匹配 + 任期提交」换来可验证性与易实现，成为云原生基础设施的事实标准。值得强调的是，Raft 的「易理解」不是口号，而是把安全性从实现者责任移交给了协议本身。

## 六、常见误区

1. 多数派复制即提交：还须 Leader 见过「当前 term 的条目」被复制到多数派，否则旧 term 日志可能被误提交（详见提交规则文档）。
2. 冲突项应保留：Raft 强制 Follower 追随 Leader 覆盖，保留会造成状态发散。
3. 提交点等于多数派确认即 apply：需 Leader 先推进 `commitIndex` 并传播，Follower 才能安全 apply。
4. 日志 index 全局唯一即可：term 才是判断「谁说了算」的关键，仅靠 index 无法防回滚。
5. 心跳只是保活：Raft 心跳同时承载 `commitIndex` 传播，是提交推进的载体而非单纯 lease。
6. 认为 `matchIndex` 会回退：它是「已知复制的最高位置」，只增不减；回退的是 `nextIndex`，二者语义不同。
7. 忘记 Leader 自身也算在多数派内：统计复制数时应包含自身的日志长度，否则提交点会偏保守。
8. 认为 apply 与 commit 同步：两者是两个独立进度，读路径必须等待 `applied ≥ commit` 才能保证可见性。

## 七、与开源书·权威来源对应

- Ongaro & Ousterhout 2014 论文第 5 章「Log Replication」给出复制与 prev 检查细节，并配图说明 `nextIndex` 回退过程。
- MIT 6.824 Lab2 要求实现 AppendEntries 与提交推进，是验证理解的标准练习。
- Kleppmann《Designing Data-Intensive Applications》第 9 章讨论 Raft 在复制系统中的位置与单 Leader 吞吐瓶颈。
- Lamport 1978 关于事件序与逻辑时钟的论述，可用于理解 term 作为逻辑纪元的作用。

## 八、面试题

1. 问：Raft 为何要求「当前 term 条目复制到多数派」才提交？
   答：防止仅含旧 term 的日志被误判提交。若直接提交旧 term 项，Leader 切换后新 Leader 可能用更高 term 覆盖它，破坏持久性；要求新 term 条目连带提交，由 Leader 完整性保证已提交项永不被覆盖。
2. 问：`prevLogIndex/prevTerm` 的作用？
   答：作为对齐锚点，让 Follower 在不传输整条日志的前提下确认前缀一致，冲突时精确截断。
3. 问：Follower 日志落后很多时如何追平？
   答：Leader 维护 `nextIndex`，被拒后递减重试；可加「按冲突 term 二分回退」优化避免逐条回退，把 $O(N)$ 降到 $O(\log N)$。
4. 问：AppendEntries 被拒后 Leader 只递减 1 是否低效？
   答：朴素实现是逐条回退，生产实现用 term 信息一次性跳到该 term 末项，显著减少 RPC 轮次。
5. 问：为什么 Raft 限制单 Leader？副作用？
   答：强 Leader 简化协议与证明，但 Leader 成为写吞吐瓶颈，需用分片（multi-raft）横向扩展。
6. 问：`matchIndex` 与 `nextIndex` 有何区别？
   答：前者是已确认复制的最高位置（只增），后者是下次发送的起点（可回退），用途不同不可混用。
7. 问：日志匹配性质为何能被归纳证明？
   答：因为 prev 检查使「锚点一致」成为「前缀一致」的充分必要条件，从而可在 index 上逐项归纳。

## 九、演进与趋势

工程侧用 batch（一次 RPC 带多条）、pipeline（不等前条确认即发下条）、leader lease（租约读）提升复制吞吐；多 Raft group 支撑数据分片（如 TiKV 的 region）。新变种如 Raft 联合共识（joint consensus）处理成员变更，PacificA 等探索更松的复制语义。最近的研究还关注「乱序提交」「并行 Raft」以突破顺序 apply 的限制。

一条值得关注的权衡是「批量化与延迟」：batch 提升吞吐但抬升尾延迟，pipeline 提升吞吐但增加崩溃后需重放的数据量。因此生产系统通常暴露可配置的批大小与窗口上限，让使用方按业务 SLA 调整。

## 十、小结

Raft 日志复制以强 Leader、日志匹配性质与「当前 term 多数派」提交规则，把共识复制收敛为一条可被逐步证明的安全路径。其核心不在于「复制」本身，而在于用任期与锚点机制让冲突可被确定性地解决，从而让工程实现与形式化安全论证保持一致。理解 AppendEntries 的 prev 检查，就理解了 Raft 为什么「不会错」的根本。三条要点：锚点（prev）是收敛的判断依据、当前任期是提交的安全前提、`matchIndex` 只增而 `nextIndex` 可退（两把不同的标尺）。
