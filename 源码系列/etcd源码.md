# etcd 源码解析（Raft 深入 / Learner / Compaction / 性能调优 / Lease 实现）

> etcd 是 **Kubernetes 的元数据底座**。本篇深入拆解：Raft 选举/日志复制源码、Learner 节点、auto-compaction 配置、Lease 实现、性能调优。

---

## 一、整体架构

```
Client → gRPC API → MVCC（revision + key-value）→ WAL → BoltDB
                  ↓
              Raft（共识）→ Leader/Follower/Candidate
                  ↓
              Lease（TTL）→ Watch（事件流）
```

---

## 二、Raft 共识层源码

### 2.1 核心状态机

```
Follower → Candidate → Leader（选举）
Leader → AppendEntries RPC（日志复制）
Follower → 接收日志 → 写 WAL → 回复 Leader

源码路径：
  raft/raft.go           — Raft 状态机（选举/心跳/日志）
  raft/node.go           — Raft 节点（与 etcdserver 接口）
  server/etcdserver/raft.go — Raft 驱动循环
```

### 2.2 选举流程源码

```
1. Follower 选举超时（150~300ms 随机）
   → raft.tickElection() 检查
   → 超时 → 转 Candidate

2. Candidate 自增 term，发起 RequestVote
   → raft.becomeCandidate()
   → 向所有节点发送 RequestVote RPC

3. 获得多数票 → 成为 Leader
   → raft.becomeLeader()
   → 立即发送心跳建立权威

4. Follower 收到有效心跳 → 重置选举超时
   → 承认 Leader

关键源码：
  raft/raft.go: stepFollower() → 处理选举超时
  raft/raft.go: stepCandidate() → 处理投票响应
  raft/raft.go: becomeLeader() → 成为 Leader 后发送空日志
```

### 2.3 日志复制源码

```
1. Leader 收到写请求 → 提交提案
   → server/etcdserver/raft.go: processInternalRaftRequestOnce()

2. Leader 追加日志条目
   → raft/raft.go: appendEntry()

3. Leader 通过 AppendEntries RPC 复制到 Follower
   → raft/raft.go: sendAppend()

4. 多数节点写入成功 → 提交
   → raft/raft.go: advanceCommitted()
   → apply 到 MVCC

5. Leader 通知 Follower 提交
   → 下一次 AppendEntries 中携带 committedIndex
```

---

## 三、MVCC 层源码

### 3.1 revision 管理

```
每个写操作递增全局 revision：
  put(key=value) → revision++
  delete(key) → revision++

key 的历史版本通过 revision 管理：
  key 的当前 revision = tree_index 中最大的 revision
  key 的历史版本 = tree_index 中该 key 的所有 revision

源码：
  mvcc/kvstore.go       — MVCC 存储核心
  mvcc/revision.go      — revision 管理
  mvcc/tree_index.go    — B-tree 索引（key → revision 映射）
```

### 3.2 Compaction（压缩）

```
Compaction = 清理历史版本（revision 回收空间）

触发方式：
  1. 自动压缩（auto-compaction）：
     - 基于 revision 保留数：compaction-revision-retention=1000
     - 基于时间保留：compaction-retention=8h
  2. 手动压缩：
     etcdctl compact <revision>

源码：
  mvcc/kvstore.go: compact() — 执行压缩
  server/etcdserver/apply.go: applyCompaction() — 处理压缩请求

配置：
  --auto-compaction-mode=periodic
  --auto-compaction-retention=8h  # 保留 8 小时历史
```

### 3.3 Lease 实现

```
Lease = TTL 机制，用于服务注册

流程：
  1. 客户端创建 Lease（TTL=15s）
  2. 客户端每 10s 续约（KeepAlive）
  3. Lease 过期 → 关联的 key 自动删除
  4. Watch 收到 DELETE 事件

源码：
  lease/lease.go        — Lease 管理器
  lease/lessor.go       — Lease 存储与续约
  server/etcdserver/apply.go: applyLeaseGrant/Revoke()

关键：
  Lease 与 key 绑定：Put(key, value, WithLease(leaseID))
  续约：KeepAlive 定期发送 KeepAlive RPC
  过期检测：后台 goroutine 定期检查 Lease 是否过期
```

---

## 四、Learner 节点

```
Learner = 只学习不投票的 Raft 节点

用途：
  1. 新节点加入集群（先学习日志再参与投票）
  2. 读扩展（只读副本，分担读压力）
  3. 跨地域复制（延迟高，不适合投票）

与 Follower 的区别：
  Learner：不参与投票/选举，不影响集群多数派
  Follower：参与投票/选举，影响集群多数派

配置：
  etcdctl member add <name> --peer-urls=<url> --learner
  最大 learner 数：maxLearners = 1

限制：
  集群最多 1 个 learner（避免影响性能）
  Learner 不参与 Raft 投票
```

---

## 五、性能调优

### 5.1 关键参数

| 参数 | 说明 | 建议 |
|------|------|------|
| `--quota-backend-bytes` | 存储配额 | 默认 2GB，可调到 8GB |
| `--max-request-bytes` | 最大请求大小 | 默认 1.5MB |
| `--auto-compaction-retention` | 自动压缩保留 | 8h（生产推荐） |
| `--snapshot-count` | 快照间隔 | 默认 100000 |
| `--heartbeat-interval` | 心跳间隔 | 默认 100ms |
| `--election-timeout` | 选举超时 | 默认 1000ms |

### 5.2 性能优化

| 优化 | 做法 | 效果 |
|------|------|------|
| SSD | WAL/BoltDB 用 SSD | 写延迟降低 50% |
| 批量写入 | 客户端批量 Put | 吞吐提升 3~5x |
| 读优化 | 使用 Serializable Read | 避免走 Raft |
| 快照调优 | 合理 snapshot-count | 减少恢复时间 |
| 压缩 | auto-compaction | 控制存储增长 |
| 限制 Watch | max-watchers | 防内存溢出 |

### 5.3 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 读延迟高 | Follower 读需重定向 | 用 Serializable Read |
| 写吞吐低 | 日志复制延迟 | 批量写入 + SSD |
| 磁盘满 | 历史版本堆积 | auto-compaction |
| Watch 延迟 | 事件积压 | 及时消费 + 增加 buffer |
| 集群抖动 | 网络分区 | 检查网络 + 调超时 |

---

## 六、与其他板块的关系

- etcd 使用见「[etcd](../基础知识/中间件/etcd.md)」；
- ZooKeeper 对比见「[ZooKeeper](../基础知识/中间件/ZooKeeper.md)」；
- Kubernetes 见「[Kubernetes 核心](../云原生/Kubernetes核心.md)」；
- Raft 原理见「[分布式系统](../基础知识/分布式系统.md)」。

> 一句话：**etcd 源码 = Raft（选举+日志复制）+ MVCC（revision 多版本）+ WAL（崩溃恢复）+ Lease（TTL）+ Watch（事件流）——调优重点：SSD + auto-compaction + 批量写入 + Serializable Read**。
