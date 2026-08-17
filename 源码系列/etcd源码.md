# etcd 源码解析（Raft 共识 / WAL / BoltDB / Watch）

> etcd 是 **Kubernetes 的元数据底座**（存储所有集群状态），也是云原生时代最重要的分布式 KV 存储之一。核心价值：**强一致性（Raft）+ 高可用（多副本）+ 高性能读写 + Watch 变更通知**。本篇按「架构 → 核心模块 → 关键流程」拆解。

---

## 一、整体架构

```
Client → gRPC API（etcd server）
  ├── Server 层：鉴权、限流、序列化
  ├── MVCC 层：多版本并发控制（revision + key-value）
  ├── Storage 层：
  │     ├── WAL（Write-Ahead Log）：写前日志，崩溃恢复
  │     ├── BoltDB（bbolt）：持久化存储（B+ 树）
  │     └── 快照（Snapshot）：定期全量快照
  ├── Raft 层：共识协议（Leader 选举 + 日志复制）
  │     ├── 每个 server 一个 Raft 实例
  │     ├── Leader 接收写请求 → 复制到 Follower → 提交
  │     └── Follower 超时 → 触发选举
  ├── Lease（租约）：TTL 机制，用于服务注册
  └── Watch：基于 revision 的事件流订阅
```

---

## 二、核心模块源码

### 2.1 Raft 共识层（etcd/raft）

```
核心状态机（每个 server）：
  Follower → Candidate → Leader（选举）
  Leader → 复制日志（AppendEntries RPC）
  Follower → 接收日志 → 写 WAL → 回复 Leader

关键源码路径：
  server/etcdserver/raft.go        — Raft 驱动循环
  server/etcdserver/raft_util.go   — 日志复制与提交
  raft/raft.go                     — Raft 状态机（选举/心跳/日志）
  raft/node.go                     — Raft 节点（与 etcdserver 接口）

选举流程：
  1. Follower 选举超时（150~300ms 随机）
  2. 转 Candidate，自增 term，发起 RequestVote
  3. 获得多数票 → 成为 Leader
  4. Leader 发送心跳建立权威
```

### 2.2 MVCC 层（mvcc）

```
etcd 的 MVCC = revision + key-value 树

每个写操作递增全局 revision：
  put(key=value) → revision++
  delete(key) → revision++
  key 的历史版本通过 revision 管理

源码路径：
  mvcc/kvstore.go       — MVCC 存储核心
  mvcc/revision.go      — revision 管理
  mvcc/tree_index.go   — B-tree 索引（key → revision 映射）

Compaction：
  定期清理历史版本（revision 回收空间）
  客户端可按 revision / 时间自动压缩
```

### 2.3 WAL 与快照

```
WAL（Write-Ahead Log）：
  每次写入先追加 WAL → 再写 BoltDB
  崩溃恢复：重放 WAL + BoltDB（类似 redo log）

快照（Snapshot）：
  定期对 BoltDB 做全量快照（如每 10000 次写入）
  恢复流程：加载最近快照 + 重放后续 WAL
```

### 2.4 Watch 机制

```
Watch = 基于 revision 的事件流订阅

客户端 watch(key, startRevision)
  → etcd server 从 tree_index 查找 key 的当前 revision
  → 返回该 revision 之后的所有变更事件（PUT/DELETE）
  → 持续推送新事件（基于 MVCC 的 changelog）

源码：
  mvcc/watchable_store.go   — Watch 管理器
  mvcc/watcher.go           — Watcher 实现
```

---

## 三、关键流程

### 3.1 写入流程

```
Client PUT(key, value)
  → gRPC handler
  → MVCC: 检查权限 + 分配 revision
  → Raft: 提交提案（propose）
  → Leader: 日志复制到多数节点
  → WAL: 追加写入
  → BoltDB: 持久化
  → 返回客户端成功
```

### 3.2 服务注册流程（Kubernetes 使用）

```
Pod 启动 → 创建 Lease（TTL=15s）+ 注册 key（/registry/pods/<name>）
  → 每 10s 续约（KeepAlive）
  → Pod 停止 → 不续约 → Lease 过期 → key 自动删除 → Watch 通知
```

---

## 四、etcd 与其他分布式存储对比

| 维度 | etcd | ZooKeeper | Consul |
|------|------|-----------|--------|
| 语言 | Go | Java | Go |
| 共识 | Raft | ZAB | Raft |
| 数据模型 | KV（扁平） | 树（ZNode） | KV + 服务目录 |
| Watch | MVCC revision | Watcher | Blocking Queries |
| 事务 | CAS（If/Then/Else） | multi op | Check-And-Set |
| K8s 集成 | 原生 | 无 | 无 |
| 适用 | K8s/云原生 | 存量 Java 系统 | 服务网格/多数据中心 |

---

## 五、常见坑与调优

| 问题 | 原因 | 解决 |
|------|------|------|
| 读延迟高 | Follower 读（需重定向到 Leader） | 用线性化读（serializable read）或 ReadIndex |
| 写吞吐低 | 日志复制延迟 | 批量写入 + 异步提交 |
| 磁盘慢 | WAL/BoltDB 写入瓶颈 | SSD + 独立磁盘 |
| Watch 延迟 | 事件积压 | 增加 Watch buffer + 及时消费 |
| 内存大 | 大量 Watch 连接 | 限制 Watch 数量 + 合理 TTL |

---

## 六、与其他板块的关系

- etcd 使用见「[etcd](../基础知识/中间件/etcd.md)」；
- ZooKeeper 对比见「[ZooKeeper](../基础知识/中间件/ZooKeeper.md)」；
- Kubernetes（etcd 底座）见「[Kubernetes 核心](../云原生/Kubernetes核心.md)」；
- Raft 原理见「[分布式系统理论总纲](../基础知识/分布式系统.md)」；
- 注册中心见「[注册中心与配置中心](../基础知识/中间件/注册中心与配置中心.md)」。

> 一句话：**etcd 源码 = Raft 共识（选举+日志复制）+ MVCC（revision 多版本）+ WAL（崩溃恢复）+ Watch（事件流）——读源码从 raft/node.go 和 mvcc/kvstore.go 入手，理解「写 WAL→复制→提交→BoltDB」的完整链路**。
