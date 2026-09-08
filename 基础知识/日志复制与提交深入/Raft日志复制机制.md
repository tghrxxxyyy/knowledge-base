# Raft日志复制机制

> 对应 Ongaro & Ousterhout 2014（Raft 论文）与 6.824 Lab2。

## 一、背景与挑战
Raft 把共识拆成「领导选举、日志复制、安全性」三块，其中日志复制是核心：Leader 接收命令、追加本地日志、复制到多数派、提交后 apply。难点是正确处理不一致、崩溃与成员变更。

## 二、核心原理
客户端命令由 Leader 追加为日志项 (term, index, cmd)。Leader 并行发 AppendEntries 给 followers，收到多数派确认即「提交」（commit），并告知 followers 提交点。Followers 严格按 index 顺序匹配并 apply。

## 三、形式化与数学基础
日志匹配性质（Log Matching）：若两日志在 index i 的 term 相同，则它们 index 1..i 的所有项完全一致。由此，Leader 只需用 `prevLogIndex` 或 `prevLogTerm` 对齐，冲突项由 Leader 覆盖（强制 follower 跟随）。

## 四、代码实现
```python
def append_entries(leader_log, follower_log, prev_idx, prev_term, entries):
    if len(follower_log) < prev_idx or follower_log[prev_idx].term != prev_term:
        return False   # 不一致，拒绝
    # 截断冲突
    follower_log = follower_log[:prev_idx+1]
    follower_log.extend(entries)
    return True
```

## 五、与其他技术对比
Multi-Paxos 也做日志复制但角色与流程不如 Raft 清晰；Zab（ZooKeeper）类似但为事务广播；Raft 以「强 Leader 加易理解」胜出，成为 etcd 或 TiKV 或 Consul 基础。

## 六、常见误区
1. 多数派复制即提交：还须 Leader 见过的「当前 term 条目」被复制才提交（防旧 term 误提交）。
2. 冲突项保留：Raft 强制 follower 跟随 Leader 覆盖。
3. 提交点直接等于多数派确认：需 Leader 确认自身 term 已复制。

## 七、与开源书/权威来源对应
Raft 论文第5章「Log Replication」；6.824 Lab2 要求实现之；DDIA 第9章提及 Raft。

## 八、面试题
问：Raft 为何要求「当前 term 条目复制到多数派」才提交？
答：防止仅含旧 term 的日志被误判提交，保证 Leader 完整性（Completeness）。

## 九、演进与趋势
Raft 优化（batch、pipeline、leader lease）提升复制吞吐；多 Raft group 支撑分片。

## 十、小结
Raft 日志复制以强 Leader 加日志匹配性质加当前 term 提交规则，实现清晰且安全的共识复制。
