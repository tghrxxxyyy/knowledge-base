# etcd（云原生分布式 KV 存储 / 协调服务）

> Kubernetes 的「大脑」就是 etcd：所有集群状态都存它里面。云原生时代分布式协调的事实标准，Raft 实现教科书。本文讲透 Raft、MVCC、Watch、Lease，以及作为注册中心/配置中心/分布式锁的落地姿势。
> 开源参考：[etcd-io/etcd](https://github.com/etcd-io/etcd)（Go，Apache 2.0，CoreOS 开源，K8s 数据底座）。

---

## 〇、本体介绍（它是什么 / 适用场景 / 核心概念）

**它是什么**：etcd 是**云原生的分布式 KV 存储**，基于 Raft 共识协议实现强一致（CP），提供 Put/Get、Watch（监听）、Lease（租约）、Txn（事务）四大核心能力，是 Kubernetes 全部集群状态的存储后端。

**解决什么痛点**：分布式系统需要「所有节点看到同一个事实」（共享强一致存储）、「配置变更实时通知」（Watch）、「分布式锁」（Txn + Lease）、「Leader 选举」。etcd 用 Raft + 原生 Watch 流把这三件事做得干净利落。

**核心概念**：Raft（Leader 选举 + 日志复制）、Key-Value（带 revision 版本）、MVCC（多版本并发控制）、Watch（监听流，持续推送）、Lease（租约 TTL）、Txn（if-then-else 原子事务）、Compact（历史版本压缩）、gRPC 协议。

**适用场景**：K8s 元数据存储、服务发现、配置中心（轻量）、分布式锁、选主。
**不适用**：大数据量（内存 KV，几 GB 级别）、高频写（写要 Raft 落盘）、替代业务数据库/Redis 缓存。

---

## 一、四大核心能力

### 1.1 Raft 共识（强一致底座）

- 节点角色：**Leader（唯一的写入口）/ Follower / Candidate**；Leader 挂了触发新一轮选举。
- 写流程：客户端写 Leader → Leader 广播日志条目 → **多数派（quorum）落盘确认** → 提交并返回。
- **Term（任期）+ 随机超时选举**：防脑裂的经典机制。

```mermaid
sequenceDiagram
    participant C as Client
    participant L as Leader
    participant F1 as Follower1
    participant F2 as Follower2
    C->>L: Put(key, val)
    L->>F1: AppendEntries 日志
    L->>F2: AppendEntries 日志
    F1-->>L: 确认
    F2-->>L: 确认
    Note over L: 多数派确认后提交
    L->>C: 返回成功
```

### 1.2 Watch（持续监听，与 ZK 的一次性 Watcher 本质区别）

- 客户端 `Watch(key 前缀)` 后建立**长连接流**，后续所有变更**持续推送**（不是一次性），无需重注册。
- 支持按 `revision` 从指定版本开始监听——客户端可「从上次断点续听」，不怕漏通知。
- 应用：配置热更新、服务注册发现、K8s 控制器 watch 资源变化。

### 1.3 Lease（租约 TTL）

- 创建租约（如 10s），绑定 key；客户端周期性续约（KeepAlive），**租约过期 key 自动删除**。
- 作用：分布式锁持有者宕机自动释放、服务心跳下线自动清理、临时元数据。
- 底层是「时间戳比较」，比 ZK 会话更轻量灵活。

### 1.4 Txn（原子事务）

- `if 条件 then 操作 else 操作`：基于 revision 的比较（`ModRevision`）实现**乐观锁/CAS**。
- 是分布式锁、Leader 选举、`create-if-not-exists` 的原子基础。

---

## 二、MVCC 与版本机制

- 每次写分配全局递增的 **revision**（主版本号），旧版本保留（MVCC），支持读历史版本。
- 无限保留会撑爆磁盘/内存 → 需要 **Compact（压缩）** 定期清理历史版本（K8s 有 `--compaction` 定时任务）。
- 坑：**没做 compaction 的 etcd 会越来越大**，最后磁盘爆掉、集群退化——K8s 集群最常见的故障之一。

---

## 三、经典落地场景

### 3.1 Kubernetes 的数据库

- K8s 全部资源（Pod/Deployment/Service/ConfigMap...）都存在 etcd，kube-apiserver 是唯一读写入口。
- 集群可用性 = etcd 可用性：etcd 挂 → 整个集群不可变（只读都不行）。

### 3.2 分布式锁（Lease + Txn）

```text
1. 创建租约 lease（TTL 如 10s），后续 KeepAlive 续租
2. Txn：if 锁 key 不存在 → Put(key, owner, lease) 成功=拿锁
        else 失败（已被持有）
3. 执行业务
4. 释放：Delete 锁 key（或租约过期自动删）
```

- 宕机安全：Lease 过期自动释放，不会死锁。
- 对比 Redis 锁：不需要自己实现续期看门狗；但吞吐远低于 Redis（Raft 写）。

### 3.3 注册中心 / 配置中心

- 服务注册 = `Put(/services/name/instance, addr, lease)` + 心跳续租；发现 = `Watch /services/name` 前缀。
- 配置 = KV + Watch 前缀；支持按目录组织，变更实时推送。
- 定位：**轻量、强一致**；重配置治理（灰度/权限/审计）选 Apollo/Nacos。

### 3.4 Leader 选举

- `Txn(if 锁 key 不存在 → Put 成功即当选)` + Lease 保活；被选者挂了 Lease 过期，其他节点 Watch 后竞争。
- 或使用 `concurrency` 库（etcd 官方 Go 客户端内置 Session + Election）。

---

## 四、etcd vs ZooKeeper（面试高频对比）

| 维度 | etcd | ZooKeeper |
|------|------|-----------|
| 语言/协议 | Go / gRPC | Java / 自研协议 |
| 一致性 | Raft | ZAB |
| 数据模型 | 扁平 KV（前缀组织） | ZNode 树 |
| 通知 | **Watch 长连接流**（持续） | Watcher（一次性，需重注册） |
| 事务 | Txn（if-then-else） | 无原生事务 |
| 租约 | Lease（TTL + 续约） | Session 会话 |
| MVCC | ✅ 带版本 | ❌ |
| 生态 | K8s / 云原生 / Go 系 | Hadoop / Kafka 旧版 / Java 系 |
| 当前定位 | 新项目、云原生首选 | 存量 Java 生态 |

**选型结论**：新项目 + 云原生/K8s → etcd；存量 Java/Hadoop 生态 → ZooKeeper；轻量服务发现 → 两者都可，但业务服务发现国内更常用 Nacos（AP）。

---

## 五、生产实践与踩坑

### 5.1 部署建议

- **奇数节点**（3 起步，K8s 生产建议 5），跨 AZ 分布（可用区感知）但不能跨广域（Raft 延迟敏感）。
- **磁盘**：SSD，fsync 延迟直接影响写性能；监控 `wal_fsync_duration`。
- **版本升级**：小版本逐级升，别跨大版本（数据格式兼容问题）。

### 5.2 常见坑（K8s 运维必踩）

1. **defrag 未做 / 空间增长**：历史版本 + 删除未压缩 → 磁盘暴涨；定期 `compact + defrag`。
2. **磁盘慢 / fsync 延迟高** → 选举超时、Leader 抖动、整个集群写不可用。
3. **网络抖动频繁** → Raft 反复选主（Term 暴涨），服务不可用；监控 `etcd_server_leader_changes_seen_total`。
4. **快照恢复**：etcd 备份靠快照 + 增量 WAL；恢复要按官方流程（`etcdctl snapshot restore`），别直接拷数据目录。
5. **写放大**：高 QPS 写 + Raft 多副本 → 磁盘 IO 翻倍；别把日志/流水等高频写塞进 etcd。
6. **客户端超时/重试**：etcd 写超时后客户端需重试，但**写可能已提交**（返回超时≠失败）——业务要幂等。
7. **K8s 场景**：apiserver 连不上 etcd 表现为「集群只读/完全不可用」，先查 etcd 健康与磁盘。

### 5.3 监控指标速查

- `etcd_server_has_leader`（是否有主）、`etcd_server_leader_changes_seen_total`（换主次数，剧增=故障）、`etcd_server_slow_apply_total`（慢 apply）、`etcd_disk_wal_fsync_duration_seconds`（磁盘延迟）、`etcd_mvcc_db_total_size_in_bytes`（DB 大小）。

---

## 面试高频问题（20+ 条）

1. **etcd 是什么？** 分布式强一致 KV 存储（Raft 实现），K8s 数据底座；提供 Put/Get/Watch/Lease/Txn。

2. **Raft 怎么保证一致性？** Leader 唯一写入口，日志复制到多数派落盘才提交；选举有随机超时 + Term 防脑裂；已提交日志永不过期（Leader 完整性保证）。

3. **etcd 和 ZooKeeper 区别？** 见对比表：Raft vs ZAB、Watch 流 vs 一次性 Watcher、MVCC/事务 vs 树模型；生态 Go/云原生 vs Java/Hadoop。

4. **Watch 和 ZK Watcher 区别？** Watch 是长连接持续推送，支持按 revision 断点续听；ZK Watcher 一次性，触发后必须重注册。

5. **Lease 是什么？** 租约：绑定 TTL，key 到期自动删除；KeepAlive 续约；用于锁/注册中心的心跳保活与自动清理。

6. **Txn 怎么用？** if（ModRevision 比较）then（操作）else（操作），实现 CAS/乐观锁、create-if-not-exists、分布式锁。

7. **分布式锁怎么实现？** Lease + Txn（if key 不存在则 Put 成功=拿锁）+ KeepAlive 续租 + 释放删 key；宕机 Lease 过期自动释放。

8. **K8s 为什么用 etcd？** 需要强一致 + Watch（控制器监听资源变化）+ 高可用元数据存储；apiserver 通过 Watch 驱动所有控制循环。

9. **MVCC 是什么？** 每次写生成全局递增 revision，保留历史版本可读；配合 Compact 压缩历史，避免无限膨胀。

10. **为什么 etcd 会越来越大？** 历史版本未压缩（MVCC）、删除的 key 只打 tombstone、没有 defrag；需定期 compact + defrag。

11. **quorum 是什么？** 多数派（3 节点需 2，5 节点需 3）确认才提交；quorum 不可达则集群不可写——所以节点必须奇数、别拆成偶数组。

12. **写性能瓶颈？** 每次写要 Raft 多数派落盘（fsync），吞吐受磁盘延迟限制；别存大数据（内存 KV）和超高频写。

13. **Watch 为什么适合配置中心？** 客户端持续监听前缀，变更实时推送、断线可续听，天然支持「配置热更新」。

14. **etcd 可以作为缓存吗？** 不适合：强一致 + Raft 复制的读性能远不如 Redis，且数据全在内存、容量有限。

15. **选举机制细节？** 候选者随机超时 → 请求投票 → 多数票当选 → 任期 Term+1；分票则重新随机超时再选。

16. **客户端超时后数据写入了吗？** 不一定：Leader 可能已提交但响应超时；业务侧必须幂等重试（唯一 key / Txn 判断）。

17. **快照与 WAL？** 定期快照（全量） + 追加 WAL（增量日志）持久化；恢复用 snapshot restore + 重放 WAL。

18. **etcd 做注册中心合适吗？** 合适（强一致 + Watch + Lease 自动清理），尤其云原生 Go 技术栈；但业务级服务发现国内常用 Nacos（AP 优先可用）。

19. **如何保证「选举不出双主」？** Raft 任意 term 只有一个 Leader；网络分区时少数派无法获得 quorum，不会选出第二个 Leader（这也是 CP 可用性代价）。

20. **etcd 集群规模？** 3~5 节点最常见；读写都在 Leader，加节点不提升性能反而增网络开销；扩读用 Mirror/代理，业务上通常不需要。

21. **K8s etcd 故障怎么排查？** 依次查：进程/证书（`etcdctl endpoint health`）、磁盘空间与 fsync、DB 大小（compact/defrag）、换主次数、网络分区。

22. **什么时候用 etcd？** K8s 集群、云原生服务发现/配置、需要强一致锁与选举、Go/微服务技术栈；Java 存量生态继续用 ZK/Nacos。

---

## 五、etcd Raft 实现细节

### 5.1 Raft 日志复制流程

```mermaid
sequenceDiagram
    participant C as Client
    participant L as Leader
    participant F1 as Follower1
    participant F2 as Follower2
    participant F3 as Follower3
    C->>L: Put(key, val)
    L->>L: 追加日志条目
    L->>F1: AppendEntries RPC
    L->>F2: AppendEntries RPC
    L->>F3: AppendEntries RPC
    F1-->>L: ACK（日志匹配）
    F2-->>L: ACK
    Note over L: 多数派(3/5)确认后提交
    L->>F1: CommitIndex
    L->>F2: CommitIndex
    L->>C: 返回成功
```

### 5.2 Raft 关键机制

| 机制 | 说明 |
|------|------|
| Leader 完整性 | 已提交的日志一定存在于新 Leader |
| 日志匹配 | AppendEntries 校验前一条日志的 Term 和 Index |
| 快速恢复 | Follower 缺失的日志会回退到 Leader 匹配点 |
| 心跳 | Leader 定期发送空 AppendEntries 保持权威 |
| PreVote | 预选举机制，防止网络分区后 Term 暴涨 |

### 5.3 etcd Raft 优化

```
etcd Raft 优化点：
  1. 批量日志合并：多个写请求合并为一次 AppendEntries
  2. Pipeline 模式：日志复制不等待上一轮确认
  3. 读优化：ReadIndex / Lease Read（避免走 Raft 共识）
  4. Leader Transfer：优雅转移 Leader（运维友好）
  5. 只读节点：Learner 不参与投票，只同步日志
```

---

## 六、etcd Watch 机制深入

### 6.1 Watch 数据结构

```
Watch 结构：
  watchID         → 唯一标识
  key             → 监听的 key 或前缀
  startRevision   → 起始版本号
  progress        → 当前进度（用于断线续传）
  chan            → 事件通知 channel

事件类型：
  PUT    → key 创建或修改
  DELETE → key 删除
```

### 6.2 Watch 事件分发流程

```
1. 客户端发起 Watch 请求（gRPC Stream）
2. etcd server 创建 Watcher 对象
3. Watcher 注册到WatchableStore
4. 后续写操作产生事件 → 分发给所有匹配的 Watcher
5. 通过 gRPC Stream 推送给客户端

性能优化：
  事件批量发送（减少网络开销）
  事件压缩（合并同一 key 的多次变更）
  按 revision 过滤（只推送客户端关心的版本）
```

### 6.3 Watch 与 ZooKeeper Watcher 对比

| 维度 | etcd Watch | ZK Watcher |
|------|------------|------------|
| 生命周期 | 持续流式推送 | 一次性触发 |
| 断线续传 | 支持（按 revision） | 不支持 |
| 前缀监听 | 原生支持 | 需监听父节点 |
| 事件可靠性 | 保证不丢（WAL） | 可能丢事件 |
| 性能 | 高（长连接） | 中（每次重注册） |

---

## 七、etcd Compaction 与 Defragmentation

### 7.1 Compaction 压缩

```bash
# 手动压缩（保留当前 revision）
etcdctl compact $(etcdctl endpoint status --write-out=json | jq '.header.revision')

# 自动压缩配置
# --auto-compaction-mode=periodic
# --auto-compaction-retention=8h

# K8s 默认配置
# kube-apiserver --etcd-compaction-retention=8h
```

### 7.2 Defragmentation 碎片整理

```bash
# 手动碎片整理（释放磁盘空间）
etcdctl defrag

# 批量整理所有节点
for host in node1 node2 node3; do
  ETCDCTL_API=3 etcdctl --endpoints=$host:2379 defrag
done

# 注意：
#   defrag 会阻塞写操作（拷贝数据+切换）
#   建议在低峰期执行
#   执行前确保磁盘空间充足
```

### 7.3 DB 空间管理最佳实践

```
磁盘空间计算：
  理论大小 = 当前数据量 + 历史版本 + 删除标记（tombstone）
  实际大小 = 理论大小 × 2（碎片 + 临时文件）

监控指标：
  etcd_mvcc_db_total_size_in_bytes  → DB 大小
  etcd_mvcc_db_total_size_in_use_in_bytes → 实际使用大小
  ratio = total_size_in_bytes / total_size_in_use_in_bytes
  ratio > 2 → 需要 defrag

清理策略：
  1. 启用自动压缩（--auto-compaction-retention=8h）
  2. 每周执行一次 defrag
  3. 磁盘使用率 > 70% 时立即 defrag
```

---

## 八、etcd 在 Kubernetes 中的角色

### 8.1 etcd 作为 K8s 后端存储

```
Kubernetes 架构：
  kube-apiserver → etcd（唯一读写入口）
    ├── 所有资源对象存储
    ├── Watch 机制驱动控制循环
    ├── 事务操作（创建/更新/删除）
    └── 版本控制（resourceVersion）

存储内容：
  Pod / Deployment / Service / ConfigMap / Secret
  Namespace / Node / PV / PVC / Ingress ...
  所有集群状态信息
```

### 8.2 etcd 与 K8s 性能关系

| 场景 | 影响 |
|------|------|
| etcd 延迟高 | API 请求超时，控制器反应迟钝 |
| etcd 磁盘满 | 集群完全不可用 |
| etcd 写吞吐不足 | 大规模集群创建/更新缓慢 |
| etcd 网络分区 | 集群脑裂/不可用 |

### 8.3 K8s etcd 运维建议

```bash
# 定期备份（建议每小时）
etcdctl snapshot save /backup/etcd-$(date +%Y%m%d%H%M).db

# 监控 etcd 健康
etcdctl endpoint health --cluster
etcdctl endpoint status --cluster --write-out=table

# 关键告警指标
# etcd_server_has_leader == 0 → 无 Leader
# etcd_server_leader_changes_seen_total → 频繁换主
# etcd_disk_wal_fsync_duration_seconds > 100ms → 磁盘慢
# etcd_mvcc_db_total_size_in_bytes > 8GB → DB 过大
```

---

## 九、etcd 性能调优

### 9.1 关键参数配置

| 参数 | 默认值 | 建议值 | 说明 |
|------|--------|--------|------|
| heartbeat-interval | 100ms | 100~300ms | 心跳间隔（跨机房可调大） |
| election-timeout | 1000ms | 1000~5000ms | 选举超时 |
| quota-backend-bytes | 2GB | 8GB | 后端存储大小限制 |
| auto-compaction-retention | 0 | 8h | 自动压缩周期 |
| snapshot-count | 10000 | 10000~50000 | 触发快照的事务数 |
| max-request-bytes | 1.5MB | 4MB | 最大请求大小 |

### 9.2 磁盘优化

```
磁盘选型：
  推荐：NVMe SSD（最低延迟）
  可接受：SATA SSD
  禁止：HDD（fsync 延迟高，会导致选举超时）

文件系统：
  推荐：ext4 或 xfs
  挂载选项：noatime,nodiratime

IO 调度器：
  SSD：noop 或 deadline
  查看：cat /sys/block/sda/queue/scheduler
```

### 9.3 网络优化

```
网络要求：
  延迟：< 10ms（同机房）
  带宽：1Gbps+
  丢包率：< 0.1%

跨机房部署：
  主集群在一个机房，灾备集群跨机房
  Raft 对延迟敏感，跨广域网不推荐
  建议使用 Observer 节点做跨机房读
```

---

## 十、etcd 备份与恢复

### 10.1 备份策略

```bash
# 完整备份
etcdctl snapshot save /backup/etcd-$(date +%Y%m%d).db

# 验证备份
etcdctl snapshot status /backup/etcd-20260821.db --write-out=table

# 定时备份（cron）
0 * * * * /usr/local/bin/etcdctl snapshot save /backup/etcd-$(date +\%Y\%m\%d\%H\%M).db

# 保留策略
# 保留最近 7 天的备份
find /backup -name "etcd-*.db" -mtime +7 -delete
```

### 10.2 恢复流程

```bash
# 1. 停止所有 etcd 节点
systemctl stop etcd

# 2. 备份当前数据目录
mv /var/lib/etcd /var/lib/etcd.bak

# 3. 恢复快照
etcdctl snapshot restore /backup/etcd-20260821.db \
  --data-dir=/var/lib/etcd-restored \
  --name=etcd-node1 \
  --initial-cluster="etcd-node1=http://node1:2380,etcd-node2=http://node2:2380" \
  --initial-advertise-peer-urls=http://node1:2380

# 4. 启动 etcd
systemctl start etcd

# 5. 验证数据完整性
etcdctl get / --prefix --keys-only | head -20
```

### 10.3 恢复注意事项

| 场景 | 注意事项 |
|------|----------|
| 单节点恢复 | 直接 snapshot restore + 启动 |
| 集群恢复 | 所有节点使用同一快照恢复 |
| 部分数据恢复 | 先恢复到新集群，再导出部分数据 |
| 跨版本恢复 | 小版本可恢复，大版本需验证兼容性 |

---

## 十一、etcd 安全（RBAC / Auth）

### 11.1 认证开启

```bash
# 启用认证
etcdctl auth enable

# 禁用认证
etcdctl auth disable

# 查看认证状态
etcdctl auth status
```

### 11.2 RBAC 角色权限

```bash
# 创建用户
etcdctl user add root:root-password

# 创建角色
etcdctl role add read-only

# 给角色授权（只读 /services 前缀）
etcdctl role grant-permission read-only read /services/

# 绑定角色到用户
etcdctl user grant-role root root

# 查看用户权限
etcdctl user get root
```

### 11.3 权限控制最佳实践

| 角色 | 权限 | 用途 |
|------|------|------|
| root | 读写全部 key | 管理员 |
| k8s-apiserver | 读写 /registry/* | K8s API Server |
| monitoring | 读全部 key | 监控系统 |
| app-read | 读 /services/* | 应用只读 |

### 11.4 传输加密（TLS）

```bash
# 生成证书
cfssl gencert -ca=ca.pem -ca-key=ca-key.pem \
  -config=ca-config.json -profile=server etcd-csr.json | cfssljson -bare etcd

# 启动时配置 TLS
etcd \
  --cert-file=/etc/etcd/server.pem \
  --key-file=/etc/etcd/server-key.pem \
  --trusted-ca-file=/etc/etcd/ca.pem \
  --client-cert-auth=true \
  --peer-cert-file=/etc/etcd/peer.pem \
  --peer-key-file=/etc/etcd/peer-key.pem \
  --peer-trusted-ca-file=/etc/etcd/ca.pem \
  --peer-client-cert-auth=true
```

---

## 十二、etcd vs ZooKeeper 性能基准

### 12.1 基准测试对比

| 指标 | etcd | ZooKeeper |
|------|------|-----------|
| 写 QPS（3 节点） | 15,000~20,000 | 15,000~25,000 |
| 读 QPS（线性读） | 15,000~20,000 | 100,000+（Follower） |
| 写延迟（P99） | 10~50ms | 5~20ms |
| 读延迟（P99） | 5~20ms | < 5ms（Follower） |
| 内存占用 | 较低 | 较高 |
| 磁盘 IO | WAL + snapshot | 事务日志 + snapshot |

### 12.2 场景适配

```
选 etcd 的场景：
  ✓ K8s 集群（官方指定）
  ✓ 云原生 Go 技术栈
  ✓ 需要 Watch 流和 MVCC
  ✓ 轻量配置中心

选 ZooKeeper 的场景：
  ✓ 存量 Java 生态（Kafka/HBase/Dubbo）
  ✓ 需要超高读吞吐（Follower 读）
  ✓ 团队熟悉 ZK 运维
  ✓ 大规模 Hadoop 集群
```

---

## 十二-2、etcd MVCC 原理（revision + tree index）

```
etcd MVCC 实现：

每次写操作分配全局递增 revision：
  revision = 全局版本号（每次 Put/Delete +1）

数据结构：
  tree index：内存索引，key → revision 列表
  boltdb：持久化存储，revision → value

读取流程：
  1. 客户端 Get(key)
  2. tree index 查找 key 对应的最新 revision
  3. boltdb 按 revision 读取 value
  4. 返回结果

历史版本读取：
  Get(key, WithRevision(rev)) → 读指定版本
  支持范围查询：Get(prefix, WithLastRev())

优势：
  - 读不阻塞写（MVCC）
  - 支持历史版本（审计/回滚）
  - Watch 基于 revision（断点续传）
```

## 十二-3、compact/defrag 周期性维护操作

```bash
# Compact：压缩历史版本（保留当前 revision）
etcdctl compact $(etcdctl endpoint status --write-out=json | jq '.header.revision')

# Defrag：碎片整理（释放磁盘空间）
etcdctl defrag --endpoints=http://localhost:2379

# 自动压缩配置
# --auto-compaction-mode=periodic
# --auto-compaction-retention=8h

# 定期维护脚本（cron）
#!/bin/bash
REV=$(etcdctl endpoint status --write-out=json | jq '.header.revision')
etcdctl compact $REV
etcdctl defrag --endpoints=http://localhost:2379
etcdctl snapshot save /backup/etcd-$(date +%Y%m%d).db

# 监控指标
# etcd_mvcc_db_total_size_in_bytes → DB 大小
# ratio > 2 → 需要 defrag
```

## 十二-4、etcd lease 租约续期与自动回收

```
Lease 租约机制：

1. 创建租约
   lease, _ := client.Grant(ctx, 10)  -- 10 秒 TTL

2. 绑定 Key
   client.Put(ctx, "key", "value", clientv3.WithLease(lease.ID))

3. 续期（KeepAlive）
   ch, _ := client.KeepAlive(ctx, lease.ID)
   for resp := range ch {
       // 自动续期（每次 TTL/3）
   }

4. 自动回收
   租约过期 → 绑定的 Key 自动删除
   客户端宕机 → KeepAlive 停止 → 租约过期 → Key 删除

与 ZK 对比：
  etcd Lease：时间戳比较，灵活（可调整 TTL）
  ZK Session：会话超时，固定（不易调整）

应用：
  分布式锁：持有者宕机 → 租约过期 → 锁自动释放
  服务注册：服务下线 → 租约过期 → 注册信息自动清理
  临时元数据：按需设置 TTL → 过期自动清理
```

## 十二-5、K8s etcd 故障恢复（backup/restore）

```bash
# 备份（每小时）
etcdctl snapshot save /backup/etcd-$(date +%Y%m%d%H%M).db

# 验证备份
etcdctl snapshot status /backup/etcd-20260821.db --write-out=table

# 恢复流程
Step 1: 停止所有 etcd 节点
  systemctl stop etcd

Step 2: 备份当前数据目录
  mv /var/lib/etcd /var/lib/etcd.bak

Step 3: 恢复快照
  etcdctl snapshot restore /backup/etcd-20260821.db \
    --data-dir=/var/lib/etcd-restored \
    --name=etcd-node1 \
    --initial-cluster="etcd-node1=http://node1:2380,etcd-node2=http://node2:2380" \
    --initial-advertise-peer-urls=http://node1:2380

Step 4: 启动 etcd
  systemctl start etcd

Step 5: 验证数据完整性
  etcdctl get / --prefix --keys-only | head -20

注意：
  - 所有节点使用同一快照恢复
  - 恢复后需要重启 etcd
  - 定期测试恢复流程（完整性校验）
```

## 十二-6、etcd 网络分区与 leader election 行为

```
网络分区行为：

场景：3 节点集群（A, B, C），A 被隔离

正常状态：
  A(Leader) ──── B(Follower)
       │
       └─── C(Follower)

分区后：
  A(Leader) ──── X (隔离)
  B ──── C (仍连通)

行为：
  1. B/C 检测到 Leader 不可达
  2. 触发选举（随机超时后）
  3. B 或 C 当选新 Leader
  4. A 被隔离后无法获得 quorum → 写被拒绝
  5. A 的读可能返回旧数据

恢复后：
  A 重新加入集群
  → 发现自己的 Term 较低
  → 自动降级为 Follower
  → 从新 Leader 同步数据

这就是 CP 特性的代价：
  网络分区时少数派不可用（写被拒绝）
  保证一致性（不会出现双主）
```

## 十二-7、etcd v2 vs v3 API 本质差异

| 维度 | etcd v2 | etcd v3 |
|------|---------|---------|
| 协议 | HTTP REST | gRPC |
| 数据模型 | 扁平 KV（目录树） | 扁平 KV（前缀组织） |
| Watch | HTTP 长轮询（一次性） | gRPC Stream（持续流） |
| 事务 | 无原生事务 | Txn（if-then-else） |
| MVCC | ❌ | ✅（带 revision） |
| 租约 | TTL（HTTP） | Lease（gRPC） |
| 性能 | 低（HTTP 开销） | 高（gRPC + 批量） |
| 适用 | 已废弃 | K8s 官方指定 |

```
v3 优势：
  1. gRPC 性能更高（二进制协议）
  2. Watch 是持续流（不丢事件）
  3. MVCC 支持历史版本
  4. Txn 事务（CAS/乐观锁）
  5. Lease 租约（灵活 TTL）
  6. 批量操作（Put/Get 支持批量）

K8s 已完全移除 v2 支持
新项目必须使用 v3
```

## etcd MVCC 与版本控制

### revision / compact / defrag

```
MVCC 机制：
  每个 key 有递增的 revision
  revision = (main revision, sub revision)
  删除 = 创建 tombstone（软删除）
  历史版本 = 保留所有 revision

compact（压缩）：
  删除旧版本历史（保留最近 N 个）
  减少存储空间
  命令：etcdctl compact <revision>

defrag（碎片整理）：
  重写数据文件（物理删除）
  释放磁盘空间
  命令：etcdctl defrag

自动压缩：
  --auto-compaction-retention=8h
  保留 8 小时历史
  定期自动压缩

监控：
  etcdctl endpoint status --write-out=table
  db size：数据库大小
  db inuse：实际使用空间
  db fragmented：碎片空间
```

| 操作 | 命令 | 频率 | 说明 |
|------|------|------|------|
| compact | `etcdctl compact REV` | 每天 | 压缩历史 |
| defrag | `etcdctl defrag` | 每周 | 整理碎片 |
| status | `etcdctl endpoint status` | 实时监控 | 查看空间 |

## etcd Lease 租约机制

### TTL / KeepAlive / 会话管理

```
Lease 机制：
  创建租约（带 TTL）
  key 绑定到租约
  定期 KeepAlive（续租）
  租约过期 → key 自动删除

适用场景：
  服务注册（心跳续租）
  分布式锁（Lease 防死锁）
  配置过期（临时配置）

创建租约：
  etcdctl lease grant 60 --ttl=60
  → 创建 60 秒租约

绑定 key：
  etcdctl put /services/user-123 "..." --lease=LEASE_ID

续租：
  etcdctl lease keep-alive LEASE_ID
  → 定期发送 KeepAlive
  → 停止 KeepAlive → 租约过期 → key 删除

监控：
  etcdctl lease list
  etcdctl lease timetolive LEASE_ID
```

## K8s etcd 故障恢复

### snapshot / restore / 成员替换

```
etcd 故障恢复流程：

1. 备份（定期做）
   etcdctl snapshot save /backup/etcd-snapshot.db
   etcdctl snapshot status /backup/etcd-snapshot.db --write-out=table

2. 恢复（单节点恢复）
   etcdctl snapshot restore /backup/etcd-snapshot.db \
     --data-dir=/var/lib/etcd-restored \
     --name=member1

3. 成员替换（集群恢复）
   etcdctl member remove MEMBER_ID
   etcdctl member add NEW_MEMBER --peer-urls="https://..."

4. 验证
   etcdctl endpoint health --cluster
   etcdctl endpoint status --cluster --write-out=table
```

## 补充：MVCC原理（revision + tree index实现）

### MVCC架构详解

```text
etcd MVCC实现：
  revision（版本号）：
    ├── 全局递增（每个事务+1）
    ├── 格式：{main}.{sub}
    └── main：全局事务计数
      sub：同一事务内多次操作
  
  tree index（内存索引）：
    ├── 基于B-tree实现
    ├── key → revision映射
    ├── 支持范围查询
    └── 内存中维护，重启后从boltdb重建
  
  boltdb（持久化存储）：
    ├── revision → value映射
    ├── 存储实际数据
    ├── 支持MVCC（保留历史版本）
    └── 使用B+树索引
  
  读取流程：
    1. 客户端Get(key)
    2. tree index查找key的最新revision
    3. boltdb按revision读取value
    4. 返回结果
  
  历史版本读取：
    Get(key, WithRevision(rev)) → 读指定版本
    支持范围查询：Get(prefix, WithLastRev())
```

### revision编码结构

```go
// revision结构
type revision struct {
    main int64  // 全局事务计数
    sub  int64  // 同一事务内操作序号
}

// 示例
// 操作1: Put("/foo", "bar") → rev={1, 0}
// 操作2: Put("/foo", "baz") → rev={2, 0}
// 操作3: Put("/bar", "qux") → rev={3, 0}
// 操作4: Put("/foo", "quux") → rev={4, 0}

// 读取历史版本
Get("/foo", WithRevision(2)) → 返回"baz"
Get("/foo", WithRevision(1)) → 返回"bar"
```

## 补充：compact/defrag维护操作与影响

### compact操作

```bash
# 手动压缩（保留当前revision之前的历史数据）
etcdctl compact $(etcdctl endpoint status --write-out=json | jq -r '.[].header.revision')

# 自动压缩配置
# --auto-compaction-mode=periodic
# --auto-compaction-retention=1h

# 压缩策略选择
# periodic：基于时间（推荐）
# revision：基于版本号（高频写场景）
```

### defrag操作

```bash
# 手动碎片整理（释放磁盘空间）
etcdctl defrag --endpoints=http://127.0.0.1:2379

# 批量整理所有节点
for host in node1 node2 node3; do
  ETCDCTL_API=3 etcdctl --endpoints=$host:2379 defrag
done

# 注意事项：
# defrag会阻塞写操作（拷贝数据+切换）
# 建议在低峰期执行
# 执行前确保磁盘空间充足
# 建议先compact再defrag
```

### compact/defrag影响

| 操作 | 影响 | 耗时 | 注意事项 |
|------|------|------|----------|
| compact | 减少存储空间 | 秒级 | 不影响当前版本数据 |
| defrag | 回收磁盘空间 | 分钟级 | 阻塞写操作 |
| 自动compact | 定期清理 | 后台 | 配置--auto-compaction-retention |
| 组合操作 | compact+defrag | 分钟级 | 低峰期执行 |

## 补充：lease租约（KeepAlive/TTL自动回收）

### 租约机制详解

```text
Lease租约机制：
  1. 创建租约（带TTL）
     lease, _ := client.Grant(ctx, 30)  // 30秒TTL
  
  2. 绑定Key到租约
     client.Put(ctx, "key", "value", clientv3.WithLease(lease.ID))
  
  3. 自动续期（KeepAlive）
     ch, _ := client.KeepAlive(ctx, lease.ID)
     for resp := range ch {
         // 每次TTL/3自动续期
     }
  
  4. 自动回收
     租约过期 → 绑定的Key自动删除
     客户端宕机 → KeepAlive停止 → 租约过期 → Key删除

与ZK Session对比：
  etcd Lease：时间戳比较，灵活（可调整TTL）
  ZK Session：会话超时，固定（不易调整）

适用场景：
  分布式锁：持有者宕机→租约过期→锁自动释放
  服务注册：服务下线→租约过期→注册信息自动清理
  临时元数据：按需设置TTL→过期自动清理
```

### KeepAlive配置

```go
// 自动续期配置
ctx := context.Background()
grant, _ := client.Grant(ctx, 30)  // 30秒租约

// KeepAlive选项
keepAliveOpts := []clientv3.KeepAliveOption{
    clientv3.WithKeepAliveTimeout(10 * time.Second),  // 续期超时
    clientv3.WithKeepAliveInterval(10 * time.Second),  // 续期间隔
}
ch, _ := client.KeepAlive(ctx, grant.ID, keepAliveOpts...)

// 监听续租状态
for {
    select {
    case resp := <-ch:
        if resp == nil {
            log.Println("租约已过期")
            // 重新绑定
            return
        }
    case <-ctx.Done():
        return
    }
}
```

## 补充：K8s etcd故障恢复（etcdctl snapshot restore）

### 恢复流程详解

```bash
# 1. 备份（每小时）
etcdctl snapshot save /backup/etcd-$(date +%Y%m%d%H%M).db

# 2. 验证备份
etcdctl snapshot status /backup/etcd-20260821.db --write-out=table

# 3. 恢复（单节点）
etcdctl snapshot restore /backup/etcd-20260821.db \
  --data-dir=/var/lib/etcd-restored \
  --name=etcd-0 \
  --initial-cluster=etcd-0=http://etcd-0:2380 \
  --initial-advertise-peer-urls=http://etcd-0:2380 \
  --listen-peer-urls=http://etcd-0:2380

# 4. 替换数据目录
mv /var/lib/etcd /var/lib/etcd-old
mv /var/lib/etcd-restored /var/lib/etcd

# 5. 重启etcd
systemctl restart etcd

# 6. 验证恢复
etcdctl endpoint health --cluster
etcdctl endpoint status --cluster --write-out=table
```

### 恢复注意事项

| 场景 | 注意事项 | 恢复时间 |
|------|----------|----------|
| 单节点恢复 | 直接snapshot restore+启动 | 分钟级 |
| 集群恢复 | 所有节点使用同一快照恢复 | 小时级 |
| 部分数据恢复 | 先恢复到新集群，再导出部分数据 | 小时级 |
| 跨版本恢复 | 小版本可恢复，大版本需验证兼容性 | 小时级 |
| K8s场景 | 需重启所有API Server | 分钟级 |

## 补充：网络分区与leader election行为

### 网络分区处理

```text
etcd网络分区行为：
  场景：3节点集群（A,B,C），A被隔离
  
  正常状态：
    A(Leader) ──── B(Follower)
         │
         └─── C(Follower)
  
  分区后：
    A(Leader) ──── X (隔离)
    B ──── C (仍连通)
  
  行为：
    1. B/C检测到Leader不可达
    2. 触发选举（随机超时后）
    3. B或C当选新Leader
    4. A被隔离后无法获得quorum→写被拒绝
    5. A的读可能返回旧数据
  
  恢复后：
    A重新加入集群
    → 发现自己的Term较低
    → 自动降级为Follower
    → 从新Leader同步数据

这就是CP特性的代价：
  网络分区时少数派不可用（写被拒绝）
  保证一致性（不会出现双主）
```

### 故障切换时间

```text
故障切换时间计算：
  选举超时：默认1000ms
  心跳超时：默认100ms
  故障检测：3-5倍心跳超时
  总切换时间：约3-5秒
  
  优化方法：
    缩短heartbeat-interval（如50ms）
    缩短election-timeout（如500ms）
    启用PreVote机制（防止Term暴涨）
```

## 补充：v2 vs v3 API差异

### HTTP REST vs gRPC

| 特性 | v2 API | v3 API |
|------|--------|--------|
| 协议 | HTTP REST | gRPC |
| 传输效率 | 低（JSON） | 高（Protocol Buffers） |
| 连接方式 | 短连接 | 长连接（HTTP/2） |
| Watch | 轮询 | 流式推送 |
| 事务 | 不支持 | 支持（Txn） |
| Lease | 无 | 支持（TTL） |
| 性能 | 低 | 高（10x+） |
| 状态 | 废弃 | 推荐 |

```bash
# v2 API（已废弃）
curl http://localhost:2379/v2/keys/mykey
curl http://localhost:2379/v2/keys/mykey -X PUT -d value="hello"

# v3 API（推荐）
etcdctl put mykey hello
etcdctl get mykey

# gRPC端口
# 默认端口：2379（HTTP）+ 2380（peer）
# v3 API使用同一个端口（2379）
```

## 补充：etcd性能调优

### 关键参数配置

| 参数 | 默认值 | 建议值 | 说明 |
|------|--------|--------|------|
| heartbeat-interval | 100ms | 100~300ms | 心跳间隔（跨机房可调大） |
| election-timeout | 1000ms | 1000~5000ms | 选举超时 |
| quota-backend-bytes | 2GB | 8GB | 后端存储大小限制 |
| auto-compaction-retention | 0 | 8h | 自动压缩周期 |
| snapshot-count | 10000 | 10000~50000 | 触发快照的事务数 |
| max-request-bytes | 1.5MB | 4MB | 最大请求大小 |

```bash
# 性能调优配置
etcd \
  --heartbeat-interval=100 \
  --election-timeout=1000 \
  --quota-backend-bytes=8589934592 \
  --auto-compaction-retention=8h \
  --snapshot-count=10000 \
  --max-request-bytes=4194304

# 监控性能指标
etcdctl endpoint status --write-out=table
etcdctl endpoint health --cluster
```

### 磁盘优化

```text
磁盘选型：
  推荐：NVMe SSD（最低延迟）
  可接受：SATA SSD
  禁止：HDD（fsync延迟高，会导致选举超时）

文件系统：
  推荐：ext4或xfs
  挂载选项：noatime,nodiratime

IO调度器：
  SSD：noop或deadline
  查看：cat /sys/block/sda/queue/scheduler
```

## 补充：etcd安全（TLS/mTLS/认证授权）

### 认证配置

```bash
# 启用认证
etcdctl auth enable

# 创建用户
etcdctl user add root:root-password

# 创建角色
etcdctl role add read-only

# 给角色授权（只读/services前缀）
etcdctl role grant-permission read-only read /services/

# 绑定角色到用户
etcdctl user grant-role root root
```

### TLS配置

```bash
# 生成证书
cfssl gencert -ca=ca.pem -ca-key=ca-key.pem \
  -config=ca-config.json -profile=server etcd-csr.json | cfssljson -bare etcd

# 启动时配置TLS
etcd \
  --cert-file=/etc/etcd/server.pem \
  --key-file=/etc/etcd/server-key.pem \
  --trusted-ca-file=/etc/etcd/ca.pem \
  --client-cert-auth=true \
  --peer-cert-file=/etc/etcd/peer.pem \
  --peer-key-file=/etc/etcd/peer-key.pem \
  --peer-trusted-ca-file=/etc/etcd/ca.pem \
  --peer-client-cert-auth=true
```

### RBAC权限控制

| 角色 | 权限 | 用途 |
|------|------|------|
| root | 读写全部key | 管理员 |
| k8s-apiserver | 读写/registry/* | K8s API Server |
| monitoring | 读全部key | 监控系统 |
| app-read | 读/services/* | 应用只读 |

## 补充：etcd备份恢复策略

### 备份策略

```bash
# 完整备份（每小时）
etcdctl snapshot save /backup/etcd-$(date +%Y%m%d%H%M).db

# 验证备份
etcdctl snapshot status /backup/etcd-20260821.db --write-out=table

# 定时备份（cron）
0 * * * * /usr/local/bin/etcdctl snapshot save /backup/etcd-$(date +\%Y\%m\%d\%H\%M).db

# 保留策略（保留最近7天）
find /backup -name "etcd-*.db" -mtime +7 -delete
```

### 恢复演练

```text
恢复演练流程：
  1. 在测试环境创建etcd集群
  2. 导入备份快照
  3. 验证数据完整性
     - 检查key数量
     - 抽样检查关键数据
     - 验证revision连续性
  4. 验证功能正常
     - Put/Get操作
     - Watch监听
     - 事务操作
  5. 记录恢复时间（RTO验证）
  6. 生成恢复报告
  
  演练频率：
    建议每月一次
    大版本升级前必须演练
```

## 十三、与其他板块的关系

- 和「**基础知识/中间件/ZooKeeper**」：同为 CP 协调服务，etcd 是云原生替代者（对比见上）。
- 和「**基础知识/中间件/注册中心与配置中心**」：etcd 可做轻量注册/配置中心，与 Nacos/Apollo 的取舍见该篇。
- 和「**云原生/Kubernetes核心**」「**云原生/K8S**」：K8s 的存储后端就是 etcd，集群故障一半以上出在 etcd。
- 和「**场景设计/分布式锁**」：etcd 锁（Lease+Txn）与 Redis 锁、ZK 锁并列三大方案。
- 和「**基础知识/分布式系统**」：Raft、quorum、脑裂是分布式理论的活教材。

---

## 七、速查表

| 项 | 结论 |
|----|------|
| 类型 | 分布式强一致 KV 存储（CP） |
| 协议 | Raft（选主 + 日志复制 + quorum 提交） |
| 能力 | Put/Get / Watch 流 / Lease / Txn |
| 数据模型 | 扁平 KV + revision（MVCC）+ 前缀组织 |
| 场景 | K8s 元数据 / 服务发现 / 配置 / 锁 / 选举 |
| 集群 | 奇数节点（3/5），SSD + 定期 compact/defrag |
| 局限 | 内存 KV 容量有限、写吞吐受磁盘限制 |
| 许可证 | Apache 2.0 |
| 一句话 | 「K8s 的大脑」——云原生协调的事实标准，Raft 工程范式 |

---

## 八、etcd 高级特性

### 8.1 Compact 与 Defrag

```bash
# 压缩历史版本（保留当前 revision）
etcdctl compact $(etcdctl endpoint status --write-out=json | jq '.header.revision')

# 整理碎片（释放磁盘空间）
etcdctl defrag

# 自动压缩（K8s 默认）
# --auto-compaction-retention=8h
```

### 8.2 成员变更与滚动升级

```bash
# 添加成员
etcdctl member add node4 --peer-urls=http://node4:2380

# 移除成员
etcdctl member remove <member-id>

# 滚动升级（逐个节点）
# 1. 停止旧版本
# 2. 替换二进制
# 3. 启动新版本
# 4. 验证健康
# 5. 继续下一个节点
```

### 8.3 备份与恢复

```bash
# 完整备份
etcdctl snapshot save /backup/etcd-$(date +%Y%m%d).db

# 恢复
etcdctl snapshot restore /backup/etcd-20260821.db \
  --data-dir=/var/lib/etcd-restored

# 恢复后需要重启 etcd
```

### 8.4 性能调优

| 参数 | 建议 | 说明 |
|------|------|------|
| heartbeat-interval | 100ms | 心跳间隔（默认 100ms） |
| election-timeout | 1000ms | 选举超时（默认 1000ms） |
| quota-backend-bytes | 8GB | 后端存储大小限制 |
| auto-compaction-retention | 8h | 自动压缩周期 |
| snapshot-count | 10000 | 触发快照的事务数 |

---

## 九、etcd 在 K8s 中的运维

### 9.1 etcd 健康检查

```bash
# 检查端点健康
etcdctl endpoint health --cluster

# 查看端点状态
etcdctl endpoint status --cluster --write-out=table

# 查看 DB 大小
etcdctl endpoint status --write-out=json | jq '.dbSize'

# 查看 Leader 信息
etcdctl endpoint status --write-out=json | jq '.leader'
```

### 9.2 etcd 常见故障排查

| 故障 | 现象 | 排查步骤 |
|------|------|----------|
| etcd 不可用 | K8s 集群只读/不可用 | 检查进程/证书/磁盘 |
| DB 膨胀 | 磁盘使用率高 | compact + defrag |
| Leader 抖动 | 写入间歇性失败 | 检查磁盘延迟/网络 |
| 选举超时 | 集群不可写 | 检查网络/磁盘 |
| 快照失败 | 备份失败 | 检查磁盘空间 |

---

## 十、与其他板块的关系（扩展）

- 和「**基础知识/中间件/ZooKeeper**」：同为 CP 协调服务，etcd 是云原生替代者（对比见上）。
- 和「**基础知识/中间件/注册中心与配置中心**」：etcd 可做轻量注册/配置中心，与 Nacos/Apollo 的取舍见该篇。
- 和「**云原生/Kubernetes核心**」「**云原生/K8S**」：K8s 的存储后端就是 etcd，集群故障一半以上出在 etcd。
- 和「**场景设计/分布式锁**」：etcd 锁（Lease+Txn）与 Redis 锁、ZK 锁并列三大方案。
- 和「**基础知识/分布式系统**」：Raft、quorum、脑裂是分布式理论的活教材。

---

## 十一、速查表（扩展）

| 项 | 结论 |
|----|------|
| 类型 | 分布式强一致 KV 存储（CP） |
| 协议 | Raft（选主 + 日志复制 + quorum 提交） |
| 能力 | Put/Get / Watch 流 / Lease / Txn |
| 数据模型 | 扁平 KV + revision（MVCC）+ 前缀组织 |
| 场景 | K8s 元数据 / 服务发现 / 配置 / 锁 / 选举 |
| 集群 | 奇数节点（3/5），SSD + 定期 compact/defrag |
| 备份 | snapshot save + WAL 增量 |
| 调优 | heartbeat/election/quota/compaction |
| 局限 | 内存 KV 容量有限、写吞吐受磁盘限制 |
| 许可证 | Apache 2.0 |

## etcd MVCC 原理

### revision + tree index 实现

```text
MVCC 核心概念：
  revision：全局递增的版本号（每次事务 +1）
  tree index：内存中的 B+ 树索引，key → revision 映射
  boltdb：磁盘存储，revision → value

数据写入流程：
  1. 分配全局 revision（原子递增）
  2. 在 tree index 中插入 key → revision 映射
  3. 将 (revision, value) 写入 boltdb
  4. 返回新 revision

数据读取流程：
  1. 在 tree index 中查找 key 的最新 revision
  2. 从 boltdb 中读取 revision 对应的 value
  3. 如果是删除标记，返回 nil

历史版本查询：
  指定 revision 读取 → 从 tree index 找该 revision 的映射
  范围查询 → 遍历 tree index，逐个读取
```

```bash
# 查看 key 的所有历史版本
etcdctl get --prefix --keys-only /mykey

# 按 revision 读取
etcdctl get --revision=100 /mykey

# 按 revision 范围读取
etcdctl get --revision=100:200 /mykey
```

## compact/defrag 周期性维护操作与影响

### compact 操作

```bash
# 手动 compact（删除指定 revision 之前的历史数据）
etcdctl compact $(etcdctl endpoint status --write-out=json | jq -r '.header.revision')

# 自动 compact（推荐）
# etcd.conf.yml 配置
auto-compaction-mode: periodic
auto-compaction-retention: "1h"  # 每小时 compact 一次

# 影响：
# - 减少存储空间
# - 提升查询性能（历史数据减少）
# - 不影响当前版本数据
```

### defrag 操作

```bash
# 手动 defrag（压缩磁盘空间）
etcdctl defrag --endpoints=http://127.0.0.1:2379

# 自动 defrag（需配置）
# etcd.conf.yml
quota-backend-bytes: 8589934592  # 8GB
auto-compaction-retention: "1h"

# 影响：
# - 回收磁盘空间
# - 短暂影响性能（期间无法写入）
# - 建议在低峰期执行
# - 建议先 compact 再 defrag
```

## etcd lease 租约续期与自动回收

### KeepAlive 与 TTL

```bash
# 创建租约（TTL 30 秒）
etcdctl lease grant 30

# KeepAlive 续期
etcdctl lease keep-alix <lease-id>

# 撤销租约
etcdctl lease revoke <lease-id>

# 查看租约信息
etcdctl lease timetolive <lease-id>
```

```java
// Java 续期示例
Lease lease = client.getLeaseClient();
CompletableFuture<LeaseGrantResponse> grantFuture =
    lease.grant(30);  // 30 秒 TTL

// 自动续期
lease.keepAlive(grantFuture.get().getID(),
    new StreamObserver<LeaseKeepAliveResponse>() {
        @Override
        public void onNext(LeaseKeepAliveResponse response) {
            // 续期成功
        }

        @Override
        public void onError(Throwable t) {
            // 续期失败，需重新注册
        }

        @Override
        public void onCompleted() {}
    });

// 绑定租约
PutOption option = PutOption.newBuilder()
    .withLeaseId(grantFuture.get().getID())
    .build();
client.getKVClient().put(
    ByteString.fromUtf8("/services/my-service"),
    ByteString.fromUtf8("instance-1"),
    option
);
```

## K8s etcd 故障恢复

### etcdctl snapshot restore 操作步骤

```bash
# 1. 备份
etcdctl snapshot save /backup/etcd-snapshot-$(date +%Y%m%d).db

# 2. 验证备份
etcdctl snapshot status /backup/etcd-snapshot.db --write-out=table

# 3. 恢复（单节点）
etcdctl snapshot restore /backup/etcd-snapshot.db \
  --data-dir=/var/lib/etcd-restored \
  --name=etcd-0 \
  --initial-cluster=etcd-0=http://etcd-0:2380 \
  --initial-advertise-peer-urls=http://etcd-0:2380 \
  --listen-peer-urls=http://etcd-0:2380

# 4. 替换数据目录
mv /var/lib/etcd /var/lib/etcd-old
mv /var/lib/etcd-restored /var/lib/etcd

# 5. 重启 etcd
systemctl restart etcd
```

```text
故障恢复注意事项：
  - 恢复前必须备份
  - 恢复会覆盖现有数据
  - 多节点集群需逐个恢复
  - 恢复后检查集群状态
  - K8s 场景需重启所有 API Server
```

## etcd 网络分区与 leader election 行为

### 网络分区后自动选主

```text
etcd 网络分区行为：
  1. Leader 与多数节点失去连接
  2. 少数派节点无法选举新 Leader
  3. 多数派节点选举新 Leader
  4. 分区恢复后，旧 Leader 降级为 Follower

故障切换时间：
  - 选举超时：默认 1000ms
  - 心跳超时：默认 100ms
  - 故障检测：3-5 倍心跳超时
  - 总切换时间：约 3-5 秒

分区期间：
  - 少数派：无法写入，可读取
  - 多数派：可正常读写
```

```bash
# 监控选举事件
etcdctl watch --prefix /0 --  # 观察选举事件

# 查看 Leader 信息
etcdctl endpoint status --write-out=json | jq '.[].leader'

# 模拟网络分区（iptables）
iptables -A INPUT -s <node-ip> -j DROP
iptables -A OUTPUT -d <node-ip> -j DROP

# 恢复网络
iptables -D INPUT -s <node-ip> -j DROP
iptables -D OUTPUT -d <node-ip> -j DROP
```

## etcd v2 vs v3 API 本质差异

### HTTP REST vs gRPC

| 特性 | v2 API | v3 API |
|------|--------|--------|
| 协议 | HTTP REST | gRPC |
| 传输效率 | 低（JSON） | 高（Protocol Buffers） |
| 连接方式 | 短连接 | 长连接（HTTP/2） |
| Watch | 轮询 | 流式推送 |
| 事务 | 不支持 | 支持（Txn） |
| Lease | 无 | 支持（TTL） |
| 性能 | 低 | 高（10x+） |
| 状态 | 废弃 | 推荐 |

```bash
# v2 API（已废弃）
curl http://localhost:2379/v2/keys/mykey
curl http://localhost:2379/v2/keys/mykey -X PUT -d value="hello"

# v3 API（推荐）
etcdctl put mykey hello
etcdctl get mykey

# gRPC 端口
# 默认端口：2379（HTTP）+ 2380（peer）
# v3 API 使用同一个端口（2379）
```

## etcd MVCC 原理（revision+tree index 实现）

### MVCC 架构

```
etcd MVCC 实现：
  revision（版本号）：
    ├── 全局递增（每个事务+1）
    ├── 格式：{main}.{sub}
    └── main：全局事务计数

  tree index（内存索引）：
    ├── 基于 B-tree 实现
    ├── key → revision 映射
    └── 支持范围查询

  boltdb（持久化存储）：
    ├── revision → value 映射
    └── 存储实际数据
```

## compact/defrag 周期性维护操作

```bash
# 手动 compact
etcdctl compact $(etcdctl endpoint status --write-out=json | jq -r '.[].header.revision')

# 自动 compact（配置）
--auto-compaction-mode=periodic
--auto-compaction-retention=1h

# 手动 defrag（释放空间）
etcdctl defrag --cluster
```

## etcd lease 租约续期（KeepAlive）与自动回收（TTL）

```go
// 创建租约（TTL=30s）
lease, _ := client.Grant(ctx, 30)

// 绑定 key 到租约
client.Put(ctx, "/services/my-service", "instance-1", clientv3.WithLease(lease.ID))

// 自动续期
ch, _ := client.KeepAlive(ctx, lease.ID)

// 撤销租约（自动删除绑定的 key）
client.Revoke(ctx, lease.ID)
```

## K8s etcd 故障恢复（etcdctl snapshot restore）

```bash
# 1. 备份
etcdctl snapshot save /backup/etcd-snapshot-$(date +%Y%m%d).db

# 2. 恢复
etcdctl snapshot restore /backup/etcd-snapshot.db \
  --data-dir=/var/lib/etcd-restored \
  --name=etcd-0

# 3. 替换数据目录
mv /var/lib/etcd /var/lib/etcd-old
mv /var/lib/etcd-restored /var/lib/etcd
```

## etcd 网络分区与 leader election 行为

```
etcd 网络分区行为：
  1. Leader 与多数节点失去连接
  2. 少数派节点无法选举新 Leader
  3. 多数派节点选举新 Leader
  4. 分区恢复后，旧 Leader 降级为 Follower

故障切换时间：约 3-5 秒
```

## etcd高级实践与故障排查

### MVCC原理详解

```text
etcd MVCC实现：
┌─────────────────────────────────────────────────────────┐
│                    Key-Value 存储                       │
│  ┌─────────────┬─────────────┬─────────────┐           │
│  │   Key       │   Value     │  Revision   │           │
│  ├─────────────┼─────────────┼─────────────┤           │
│  │   /foo      │   "bar"     │  rev=1      │           │
│  │   /foo      │   "baz"     │  rev=2      │           │
│  │   /foo      │   "qux"     │  rev=3      │           │
│  └─────────────┴─────────────┴─────────────┘           │
│                                                         │
│  历史版本存储：                                          │
│  ┌─────────────┬─────────────┬─────────────┐           │
│  │   Key       │   Value     │  Revision   │           │
│  ├─────────────┼─────────────┼─────────────┤           │
│  │   /foo      │   "bar"     │  rev=1      │           │
│  │   /foo      │   "baz"     │  rev=2      │           │
│  │   /foo      │   "qux"     │  rev=3      │           │
│  └─────────────┴─────────────┴─────────────┘           │
└─────────────────────────────────────────────────────────┘

# MVCC核心机制
# 1. 每次写操作创建新版本（revision递增）
# 2. 读操作基于revision读取历史版本
# 3. Watch基于revision监听变更
# 4. Compact压缩历史版本释放空间
```

| MVCC特性 | 说明 | 作用 |
|----------|------|------|
| 版本号递增 | 每次操作revision+1 | 全局有序 |
| 历史版本 | 保留所有历史版本 | 支持Watch |
| 压缩清理 | Compact压缩历史 | 释放空间 |
| 并发控制 | 基于revision | 保证一致性 |

### Compact与Defrag实战

```bash
# Compact压缩历史版本
# 自动压缩（推荐）
etcd --auto-compaction-mode periodic --auto-compaction-retention=8h

# 手动压缩
etcdctl compact <revision>

# Defrag碎片整理
etcdctl defrag

# 压缩+碎片整理脚本
#!/bin/bash
CURRENT_REVISION=$(etcdctl endpoint status --write-out="json" | jq -r '.header.revision')
echo "Current revision: $CURRENT_REVISION"

# 压缩
etcdctl compact $CURRENT_REVISION
echo "Compacted revision: $CURRENT_REVISION"

# 碎片整理
etcdctl defrag
echo "Defragmented"

# 压缩策略配置
# 1. 定期压缩（推荐）
etcd --auto-compaction-mode periodic --auto-compaction-retention=24h

# 2. 基于revision压缩
etcd --auto-compaction-mode revision --auto-compaction-retention=10000
```

| 压缩模式 | 说明 | 适用场景 |
|----------|------|----------|
| periodic | 定期压缩 | 通用场景 |
| revision | 基于revision | 高频写场景 |
| manual | 手动压缩 | 特殊场景 |

### Lease租约高级用法

```go
// 创建租约
ctx := context.Background()
grant, err := client.Grant(ctx, 30)  // 30秒租约
if err != nil {
    log.Fatal(err)
}

// 绑定Key到租约
_, err = client.Put(ctx, "foo", "bar", client.WithLease(grant.ID))
if err != nil {
    log.Fatal(err)
}

// 自动续租
keepAlive, err := client.KeepAlive(ctx, grant.ID)
if err != nil {
    log.Fatal(err)
}

// 监听续租状态
for {
    select {
    case resp := <-keepAlive:
        if resp == nil {
            log.Println("租约已过期")
            // 重新绑定
            return
        }
    case <-ctx.Done():
        return
    }
}

// 租约使用场景
// 1. 服务注册：服务启动时创建租约，绑定服务地址
// 2. 分布式锁：锁绑定租约，避免死锁
// 3. 配置管理：配置绑定租约，过期自动清理
```

| 租约TTL | 说明 | 适用场景 |
|---------|------|----------|
| 10秒 | 短租约 | 服务注册 |
| 30秒 | 中租约 | 分布式锁 |
| 60秒 | 长租约 | 配置管理 |
| 永不过期 | 无租约 | 永久数据 |

### K8s etcd故障恢复

```bash
# K8s etcd故障恢复步骤
# 1. 备份etcd数据
ETCDCTL_API=3 etcdctl snapshot save /backup/etcd-snapshot-$(date +%Y%m%d).db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# 2. 恢复etcd数据
ETCDCTL_API=3 etcdctl snapshot restore /backup/etcd-snapshot-20240101.db \
  --data-dir=/var/lib/etcd-restore \
  --name=master-1 \
  --initial-cluster=master-1=https://127.0.0.1:2380 \
  --initial-cluster-token=etcd-cluster \
  --initial-advertise-peer-urls=https://127.0.0.1:2380

# 3. 替换etcd数据目录
mv /var/lib/etcd /var/lib/etcd-old
mv /var/lib/etcd-restore /var/lib/etcd

# 4. 重启etcd
systemctl restart etcd

# 5. 验证恢复
ETCDCTL_API=3 etcdctl endpoint health \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
```

| 故障类型 | 恢复方案 | 恢复时间 |
|----------|----------|----------|
| 单节点故障 | 自动恢复 | 分钟级 |
| 数据损坏 | 从备份恢复 | 小时级 |
| 集群崩溃 | 从快照恢复 | 小时级 |
| 网络分区 | 等待分区恢复 | 秒级 |

### 网络分区与Leader选举

```text
etcd网络分区处理：
┌─────────────────────────────────────────────────────────┐
│                    网络分区场景                         │
│                                                         │
│  节点1 (Leader)  ──── 网络 ────  节点2                 │
│       │                           │                    │
│       │                           │                    │
│  节点3  ────────── 网络 ────  节点4                     │
│                                                         │
│  分区1: 节点1,3 (多数派)                               │
│  分区2: 节点2,4 (少数派)                               │
└─────────────────────────────────────────────────────────┘

# Leader选举流程
# 1. 检测到Leader不可达
# 2. 触发选举超时（150-300ms随机）
# 3. 发起选举请求
# 4. 获得多数派投票
# 5. 成为新Leader

# 分区恢复后处理
# 1. 旧Leader降级为Follower
# 2. 同步新Leader数据
# 3. 恢复正常服务

# 故障切换时间
# 选举超时: 150-300ms
# 日志复制: <10ms
# 总切换时间: <500ms
```

| 分区场景 | 处理策略 | 恢复时间 |
|----------|----------|----------|
| Leader在多数派 | 继续服务 | 无影响 |
| Leader在少数派 | 选举新Leader | <1秒 |
| 均等分区 | 多数派选举 | <1秒 |
| 网络抖动 | 保持当前Leader | 无影响 |

### etcd故障排查手册

| 故障现象 | 可能原因 | 排查步骤 | 解决方案 |
|----------|----------|----------|----------|
| Leader选举失败 | 网络问题 | 检查网络连通性 | 修复网络 |
| 日志复制延迟 | 磁盘IO慢 | 检查磁盘性能 | 优化磁盘 |
| Watch断开 | 网络中断 | 检查连接状态 | 重连 |
| 租约过期 | 续租失败 | 检查续租逻辑 | 修复续租 |
| 数据损坏 | 异常宕机 | 检查数据文件 | 恢复备份 |
| 性能下降 | 数据量大 | 检查数据大小 | 压缩+碎片整理 |

### etcd监控与告警

```yaml
# etcd监控配置
monitoring:
  # 指标收集
  metrics:
    enabled: true
    endpoint: "http://localhost:2381/metrics"
    
  # 关键指标
  key_metrics:
    - name: "etcd_server_leader_changes_seen_total"
      description: "Leader切换次数"
    
    - name: "etcd_disk_wal_fsync_duration_seconds"
      description: "WAL同步延迟"
    
    - name: "etcd_disk_backend_commit_duration_seconds"
      description: "Backend提交延迟"
    
    - name: "etcd_network_peer_round_trip_time_seconds"
      description: "网络延迟"
  
  # 告警规则
  alerts:
    - name: "etcd_leader_changes"
      condition: "rate(etcd_server_leader_changes_seen_total[5m]) > 0"
      severity: "critical"
    
    - name: "etcd_disk_fsync_slow"
      condition: "histogram_quantile(0.99, etcd_disk_wal_fsync_duration_seconds) > 0.5"
      severity: "warning"
    
    - name: "etcd_network_latency_high"
      condition: "histogram_quantile(0.99, etcd_network_peer_round_trip_time_seconds) > 0.1"
      severity: "warning"
```

| 监控指标 | 说明 | 告警阈值 |
|----------|------|----------|
| Leader切换 | Leader变化频率 | >0次/5分钟 |
| WAL同步延迟 | 磁盘写入性能 | >500ms |
| Backend提交延迟 | 数据提交性能 | >500ms |
| 网络延迟 | 节点间通信 | >100ms |

> 核心原则：**MVCC版本管理，Compact定期压缩，Lease租约自动续租，网络分区自动恢复**。

## etcd v2 vs v3 API 本质差异

| 特性 | v2 API | v3 API |
|------|--------|--------|
| 协议 | HTTP REST | gRPC |
| 传输效率 | 低（JSON） | 高（Protocol Buffers） |
| Watch | 轮询 | 流式推送 |
| 事务 | 不支持 | 支持（Txn） |
| Lease | 无 | 支持（TTL） |
| 状态 | 废弃 | 推荐 |

| 一句话 | 「K8s 的大脑」——云原生协调的事实标准，Raft 工程范式 |

### 多集群管理

```bash
# multi-cluster配置
etcdctl --endpoints=http://cluster1:2379,http://cluster2:2379 \
  --cacert=/etc/etcd/ca.crt \
  --cert=/etc/etcd/server.crt \
  --key=/etc/etcd/server.key \
  member list

# gateway配置
etcdctl gateway list
etcdctl endpoint health --cluster
```

### 监控

```yaml
# Prometheus指标
- job_name: 'etcd'
  static_configs:
    - targets: ['etcd1:2379','etcd2:2379','etcd3:2379']
  
  # 告警规则
  - alert: etcd_leader_changes
    expr: rate(etcd_server_leader_changes_seen_total[5m]) > 0
    for: 5m
    labels:
      severity: critical
```

### 备份恢复

```bash
# 快照备份
etcdctl snapshot save /backup/etcd-$(date +%Y%m%d).db

# 恢复
etcdctl snapshot restore /backup/etcd-20240101.db --data-dir=/var/lib/etcd-restore

# 增量备份脚本
#!/bin/bash
DATE=$(date +%Y%m%d)
etcdctl snapshot save /backup/etcd-$DATE.db
# 保留最近7天
find /backup -mtime +7 -delete
```

### 性能调优

| 参数 | 默认值 | 推荐值 | 说明 |
|------|--------|--------|------|
| snapshot-count | 10000 | 10000 | 快照间隔 |
| heartbeat-interval | 100 | 100 | 心跳间隔(ms) |
| election-timeout | 1000 | 1000 | 选举超时(ms) |
| quota-backend-bytes | 2GB | 8GB | 存储配额 |

### 安全

```yaml
# 认证
auth:
  enable: true
  token:
    signer: /etc/etcd/jwt-public.pem
    ttl: "30m"

# 授权
RBAC:
  enable: true
  role: root

# TLS
client-transport:
  cert-file: /etc/etcd/server.crt
  key-file: /etc/etcd/server.key
  trusted-ca-file: /etc/etcd/ca.crt
```

### etcd vs Consul vs ZooKeeper对比

| 特性 | etcd | Consul | ZooKeeper |
|------|------|--------|-----------|
| 架构 | Raft | Raft | ZAB |
| 语言 | Go | Go | Java |
| 一致性 | 强一致 | 强一致 | 强一致 |
| Watch | 流式推送 | 长轮询 | 事件回调 |
| 生态 | K8s原生 | 服务网格 | Hadoop生态 |

### 最佳实践

| 实践 | 说明 | 优先级 |
|------|------|--------|
| 集群部署 | 3或5节点 | 高 |
| 备份策略 | 定期快照 | 高 |
| 监控告警 | Leader切换/延迟 | 高 |
| 性能调优 | 磁盘/网络优化 | 中 |

### 生产问题排查

| 问题 | 排查步骤 | 解决方案 |
|------|----------|----------|
| 延迟高 | 检查磁盘IO | 升级SSD |
| 磁盘IO | 检查WAL写入 | 优化写入 |
| 网络分区 | 检查节点连通 | 修复网络 |
| 脑裂 | 检查Leader状态 | 恢复仲裁 |

### etcd架构

```text
Raft协议：
  Leader → Follower → Candidate
  日志复制：Leader复制到多数派
  Leader选举：多数派投票
  
快照：
  定期快照，压缩日志
  减少恢复时间
```

### etcd运维

```bash
# 成员管理
etcdctl member add node3 --peer-urls=http://node3:2380
etcdctl member remove <member-id>

# 碎片整理
etcdctl defrag

# 版本升级
etcdctl member update <member-id> --peer-urls=http://node3:2380

# 健康检查
etcdctl endpoint health --cluster
etcdctl endpoint status --cluster
```

### etcd安全

| 措施 | 说明 |
|------|------|
| 认证授权 | 用户认证+RBAC |
| 加密传输 | TLS加密 |
| 加密存储 | 数据加密 |
| 审计日志 | 操作审计 |
