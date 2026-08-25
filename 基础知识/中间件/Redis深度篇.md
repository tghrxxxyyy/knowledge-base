# Redis 深度篇（缓存 / 数据结构 / 分布式锁 / 集群）

> Redis 是**内存数据结构服务器**：缓存只是其用法之一，它更是数据结构服务器（String/Hash/List/Set/ZSet/Bitmap/HyperLogLog/Stream/GEO）。相比 Memcached（纯 KV）、本地缓存（无法共享），Redis 以「丰富数据结构 + 持久化 + 集群 + Lua」成为缓存层事实标准。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 数据库压力大 | 热点数据反复查 DB，响应慢 |
| 数据结构简单 | Memcached 只支持 KV，无法做排行榜/队列 |
| 分布式锁 | 多实例间需要互斥/限流 |
| 会话共享 | 负载均衡下会话不共享 |
| 实时排行榜 | 游戏/社交实时排名 |

> 核心认知：**Redis 不只是缓存，而是「内存中的数据结构服务器」**——5 大基础 + 5 大数据结构，解决几乎所有内存计算问题。

---

## 二、Redis 核心原理

### 2.1 架构（单线程 + IO 多路复用）

```
Redis Server（单线程事件循环）
 ├── aeEventLoop（事件循环）
 │   ├── File Event（文件事件：accept/read/write）
 │   └── Time Event（时间事件：cron/expire）
 ├── IO 多路复用（epoll/kqueue/Select）
 ├── 内存数据库（字典 + 跳跃表 + 压缩列表...）
 ├── 持久化（RDB/AOF）
 ├── 发布订阅
 ├── Lua 脚本（原子执行）
 └── 集群（分片/主从/哨兵）
```

**选型关注点**：单线程（6.0 后网络 IO 多线程）= 无锁高性能，但大 key/慢命令会阻塞所有请求。

### 2.2 数据结构（底层实现）

| 对外类型 | 底层实现 | 适用场景 |
|----------|----------|----------|
| String | SDS（简单动态字符串） | 缓存/计数器/分布式锁 |
| Hash | 哈希表/压缩列表 | 对象存储（用户信息） |
| List | 快速列表/压缩列表 | 消息队列/最新列表 |
| Set | 整数集合/哈希表 | 共同好友/标签/去重 |
| ZSet | 跳跃表+哈希表 | 排行榜/延迟队列/范围查询 |
| Bitmap | String（位操作） | 签到/布隆过滤器/日活 |
| HyperLogLog | 概率数据结构 | UV 统计（0.81% 误差） |
| Stream |  Radix Tree | 消息队列（消费者组） |
| GEO | ZSet（GeoHash） | 附近的人/距离计算 |

**选型关注点**：
- 排行榜 → ZSet（跳跃表 O(logN) 插入/范围查询）
- UV 统计 → HyperLogLog（12KB 统计亿级）
- 附近的人 → GEO（GeoHash 编码）

### 2.3 持久化

| 方式 | 原理 | 性能 | 数据安全性 |
|------|------|------|------------|
| RDB | 内存快照（fork + COW） | 高（fork 时阻塞） | 可能丢最后一次快照 |
| AOF | 写命令日志（append） | 中（fsync 策略） | always（不丢）/ everysec（丢1秒） |
| 混合（4.0+） | RDB + AOF 增量 | 高 | everysec |

**选型关注点**：生产推荐 **混合持久化**（RDB 全量 + AOF 增量，兼顾恢复速度与数据安全）。

### 2.4 过期与内存淘汰

- **过期策略**：定期删除（每秒 10 次随机抽查）+ 惰性删除（访问时检查）
- **内存淘汰策略**：

| 策略 | 说明 |
|------|------|
| noeviction | 不淘汰（写入报错，默认） |
| allkeys-lru | 全体 key LRU 淘汰（推荐缓存场景） |
| allkeys-random | 全体 key 随机淘汰 |
| volatile-lru | 有过期时间的 key LRU 淘汰 |
| volatile-ttl | 优先淘汰即将过期的 key |
| allkeys-lfu | 全体 key LFU 淘汰（4.0+） |

**选型关注点**：纯缓存场景 → **allkeys-lru**（最近最少使用，最经典）。

---

## 三、Redis 集群

### 3.1 主从复制

```
Master（读写）→ 全量同步（RDB → slave）→ 增量同步（复制积压缓冲区）
  ├── Slave 1（只读）
  └── Slave 2（只读）
```

- **全量同步**：Slave 连接 → Master fork 生成 RDB → 发送 RDB → 发送缓冲区
- **增量同步**：基于复制偏移量，从复制积压缓冲区取缺失命令

**选型关注点**：主从复制是读写分离的基础（MySQL 主从同理）。

### 3.2 哨兵（Sentinel）——高可用

```
Sentinel 集群（≥3 个，奇数）
  ├── 监控：每秒 ping Master/Slave
  ├── 通知：事件通知到客户端/脚本
  ├── 自动故障转移：Master 挂 → 选举新 Master → 通知客户端
  └── 配置提供者：客户端从 Sentinel 获取当前 Master
```

- **主观下线（SDOWN）**：一个 Sentinel 认为节点下线
- **客观下线（ODOWN）**：半数以上 Sentinel 认为下线（才触发故障转移）
- **领导者选举**：Raft 算法选一个 Sentinel 执行故障转移

**选型关注点**：哨兵提供自动故障转移（HA），但**不负责数据分片**。

### 3.3 Cluster（集群）——分片 + 高可用

```
Redis Cluster（16384 个哈希槽）
  ├── Slot 0-5460 → Master A（+ Slave A1）
  ├── Slot 5461-10922 → Master B（+ Slave B1）
  └── Slot 10923-16383 → Master C（+ Slave C1）
```

- **分片**：key 的 CRC16 mod 16384 → 对应 Slot → 对应 Master
- **MOVED 重定向**：客户端访问错误节点 → MOVED → 重定向到正确节点
- **ASK 重定向**：迁移中临时重定向
- **故障转移**：Master 挂 → Slave 提升为 Master

**选型关注点**：Cluster 是 Redis 官方的「分片+HA」方案（推荐大规模场景）。

### 3.4 集群方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| 哨兵 + 主从 | 简单、HA | 不扩容、单点写 | 中小规模、读多写少 |
| Cluster | 自动分片+HA | 跨 Slot 操作受限、迁移复杂 | 大规模（TB 级） |
| 代理分片（Twemproxy/Codis） | 对客户端透明 | 多一跳、运维复杂 | 已有基础设施 |
| 客户端分片 | 无代理开销 | 客户端复杂、扩缩容难 | 简单场景 |

**选型关注点**：新项目 → **Cluster**（官方方案，自动分片+HA）；已有 Codis/Twemproxy → 可继续用。

---

## 四、Redis 分布式锁

### 4.1 原理

```
加锁：SET resource_name unique_value NX PX 30000
  ├── NX：不存在才设置
  ├── PX：过期时间（防死锁）
  └── unique_value：唯一标识（防误删）

解锁（Lua 脚本，原子）：
  if redis.call("get",KEYS[1]) == ARGV[1] then
    return redis.call("del",KEYS[1])
  else
    return 0
  end
```

### 4.2 Redlock（红锁）——多 Master 分布式锁

- **原理**：N 个独立 Master（通常 5 个）→ 半数以上加锁成功 → 锁生效
- **争议**：Martin Kleppmann 与 Antirez 的著名论战（时钟跳跃/GC 暂停导致锁失效）
- **选型关注点**：极高可靠性需求 → Redlock 或 **ZooKeeper/etcd**（CP 系统更可靠）；一般场景 → 单 Master + 哨兵足够。

### 4.3 Redisson（Java Redis 客户端）

- 封装分布式锁（可重入锁/读写锁/公平锁）
- 看门狗机制（锁自动续期）
- 发布订阅/远程服务/分布式对象

**选型关注点**：Java 生态 → **Redisson**（功能最全的 Redis 客户端）。

---

## 五、Redis 缓存设计模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| Cache Aside | 应用层管理缓存（读：先缓存→未命中→读DB→写缓存；写：先DB→删缓存） | 最常用 |
| Read/Write Through | 缓存层代理读写（应用只操作缓存） | 缓存中间件 |
| Write Behind | 写缓存→异步写 DB（高性能，可能丢数据） | 高吞吐写 |
| 双删策略 | 写DB前删缓存→写DB→延迟再删缓存 | 最终一致 |

**选型关注点**：生产最常用 **Cache Aside + 延迟双删**（兼顾简单与一致）。

---

## 六、Redis vs Memcached vs 本地缓存

| 维度 | Redis | Memcached | 本地缓存（Caffeine/Guava） |
|------|-------|-----------|---------------------------|
| 数据结构 | 丰富（5+5） | 仅 KV | KV |
| 持久化 | RDB/AOF | 无 | 无 |
| 集群 | Cluster/哨兵 | 客户端分片 | 无 |
| 内存效率 | 较低（元数据开销） | 较高 | 最高 |
| 延迟 | 亚毫秒 | 亚毫秒 | 纳秒 |
| 分布式锁 | 支持 | 不支持 | 不支持 |
| 发布订阅 | 支持 | 不支持 | 不支持 |
| 适用 | 缓存+数据结构+锁 | 纯 KV 缓存 | 进程内热点缓存 |

**选型关注点**：
- 需要丰富数据结构/持久化/分布式锁 → **Redis**
- 纯 KV 缓存 + 极致性能 → **Memcached**
- 进程内热点（无需共享）→ **Caffeine/Guava**
- 多级缓存 → **Caffeine（L1）+ Redis（L2）+ DB**

---

## 七、Redis 生产实践

### 7.1 大 Key / 热 Key 治理

| 问题 | 解决方案 |
|------|----------|
| 大 Key（String > 10KB，集合 > 5000） | 拆分/压缩/异步删除（UNLINK） |
| 热 Key（单 key QPS 极高） | 多副本（本地缓存 + Redis 多副本）/ Key 加随机后缀分散 |
| 慢命令（KEYS/SMEMBERS/HGETALL） | 禁用 KEYS（用 SCAN）/ 分批获取 |

### 7.2 关键配置

| 配置 | 建议 |
|------|------|
| maxmemory | 设置上限（防 OOM） |
| maxmemory-policy | allkeys-lru（缓存场景） |
| timeout | 空闲连接超时 |
| tcp-keepalive | 连接保活 |
| slowlog-log-slower-than | 慢查询阈值（10ms） |

### 7.3 监控指标

| 指标 | 说明 |
|------|------|
| used_memory | 内存使用 |
| mem_fragmentation_ratio | 内存碎片率（>1.5 需关注） |
| keyspace_hits/misses | 缓存命中率（>95% 健康） |
| connected_clients | 连接数 |
| instantaneous_ops_per_sec | 每秒操作数 |
| blocked_clients | 阻塞客户端数 |

---

## 八、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 缓存 | Redis | Memcached |
| 分布式锁 | Redisson | ZooKeeper/etcd |
| 排行榜 | Redis ZSet | — |
| 消息队列 | Redis Stream / Kafka | RabbitMQ |
| UV 统计 | Redis HyperLogLog | — |
| 附近的人 | Redis GEO | PostGIS |
| 签到/布隆过滤器 | Redis Bitmap | — |
| 会话共享 | Redis | — |
| 多级缓存 | Caffeine + Redis | — |
| 纯 KV 高性能 | Memcached | Redis |

---

## 九、Redis Cluster 内部原理

### 9.1 Hash Slot 分片机制

```
Redis Cluster = 16384 个哈希槽（Hash Slot）

数据路由：
  key → CRC16(key) % 16384 → Slot 编号 → 对应 Master 节点

Slot 分配示例（3 节点）：
  Master A: Slot 0 - 5460
  Master B: Slot 5461 - 10922
  Master C: Slot 10923 - 16383

每个 Master 有 1+ 个 Slave 做副本

Hash Tag（强制同 Slot）：
  {user}.profile 和 {user}.orders 会路由到同一 Slot
  用 {} 包裹的部分参与 CRC16 计算
  保证 Hash Tag 相同的 key 在同一节点 → 支持 Lua 脚本/MULTI 操作
```

### 9.2 Gossip 协议与故障检测

```
Gossip 协议（节点间通信）：
  每个节点随机选择几个节点交换集群状态
  通信端口：cluster bus（默认 port+10000）
  交换内容：节点状态（fail/pfail/ok）、slot 映射、配置纪元

  消息类型：
    MEET: 新节点加入集群
    PING: 心跳（携带自己和已知节点状态）
    PONG: 响应
    FAIL: 宣告节点故障
    UPDATE: 更新 slot 映射

故障检测流程：
  1. Node A ping Node B → 超时无响应
  2. Node A 标记 B 为 PFAIL（疑似故障）
  3. Node A 广播 B 的 PFAIL 状态
  4. 超过半数 Master 都标记 B 为 PFAIL
  5. 任一 Master 广播 B 的 FAIL → 集群共识
  6. B 的 Slave 在一定延迟后发起选举 → 提升为新 Master
```

### 9.3 故障转移详细流程

```
故障转移（Failover）时序：
  t0: Master B 挂掉（超时 cluster-node-timeout，默认 15s）
  t1: 相邻节点标记 B 为 PFAIL
  t2: Gossip 广播 → 多数 Master 同意 → B 标记为 FAIL
  t3: B 的 Slave 检测到 B FAIL
  t4: Slave 等待选举延迟（replica-offset-factor × 1000ms）
  t5: Slave 发起选举（Raft 逻辑，向其他 Master 请求投票）
  t6: 获得多数票 → Slave 提升为新 Master
  t7: 新 Master 广播 PONG → 集群更新 slot 映射
  t8: 原 Master B 恢复后自动降级为 Slave

关键配置：
  cluster-node-timeout: 节点超时时间（默认 15s）
  cluster-replica-validity-factor: Slave 有效性因子
  cluster-require-full-coverage: 部分 slot 不可用是否停止服务
```

### 9.4 集群扩缩容

```bash
# 扩容：添加新节点
redis-cli --cluster add-node 10.0.0.4:6379 10.0.0.1:6379
# 新节点加入后无 slot → 需要迁移 slot

# 迁移 slot（reshard）
redis-cli --cluster reshard 10.0.0.1:6379
#   How many slots? 4096
#   What is the receiving node ID? <新节点 ID>
#   Source node: all → 从所有现有节点均匀迁移

# 缩容：移除节点（先迁走 slot）
redis-cli --cluster reshard <从哪个节点迁>
redis-cli --cluster del-node 10.0.0.1:6379 <要删除的节点 ID>

# 注意事项：
#   迁移过程中 slot 处于 MIGRATING/IMPORTING 状态
#   客户端需处理 ASK/MOVED 重定向
#   大 key 迁移可能阻塞（用 UNLINK 异步删除替代 DEL）
```

---

## 十、Redis Sentinel 深入

### 10.1 Sentinel 架构详解

```
Sentinel 集群（3+ 节点，奇数）：
  ├── 每个 Sentinel 持续监控所有 Master/Slave
  ├── 每秒 PING 所有节点
  ├── 通过 Pub/Sub 通知客户端
  └── 自动故障转移（选举新 Master + Slave 提升）

Sentinel 选举流程：
  1. Sentinel A 发现 Master 无响应 → 标记 SDOWN（主观下线）
  2. A 向其他 Sentinel 发送 is-master-down-by-addr
  3. 其他 Sentinel 确认后返回 SDOWN/ODOWN
  4. 超过 quorum（法定人数）→ ODOWN（客观下线）
  5. 所有 Sentinel 发起 Leader 选举（Raft）
  6. 获得多数票的 Sentinel 执行故障转移
  7. 选择最优 Slave 提升（优先级→offset→runID）
  8. 让其他 Slave 复制新 Master
  9. 通知客户端新 Master 地址

关键配置：
  sentinel monitor mymaster 10.0.0.1 6379 2
  #   quorum=2: 至少 2 个 Sentinel 同意才触发故障转移

  sentinel down-after-milliseconds mymaster 5000
  #   5 秒无响应标记 SDOWN

  sentinel failover-timeout mymaster 60000
  #   故障转移超时 60 秒
```

---

## 十一、Redis 持久化深度解析

### 11.1 RDB 持久化深入

```
RDB 原理：
  fork() 系统调用创建子进程（COW 写时复制）
  子进程遍历内存数据 → 生成压缩二进制快照（.rdb 文件）
  父进程继续处理请求（期间修改的数据通过 COW 页表复制）

  save 900 1    # 900 秒内至少 1 次写入
  save 300 10   # 300 秒内至少 10 次写入
  save 60 10000 # 60 秒内至少 10000 次写入

  bgsave: 后台异步保存（推荐）
  save: 同步保存（阻塞，不推荐）

RDB 性能影响：
  fork() 内存开销：Linux 默认需要拷贝整个页表
  Redis 实际内存 10GB → fork 可能需要 10GB+ 额外内存
  优化：
    确保系统有足够 swap
    transparent_hugepage = never（避免 COW 大页问题）
    控制 RDB 频率（避免频繁 fork）
```

### 11.2 AOF 持久化深入

```
AOF 原理：
  每条写命令追加到 AOF 文件（append-only）
  重放 AOF 恢复数据

  appendonly yes
  appendfsync always:    每条命令 fsync（最安全，最慢）
  appendfsync everysec:  每秒 fsync（推荐，最多丢 1 秒）
  appendfsync no:        操作系统决定（最快，可能丢更多）

AOF 重写（BGREWRITEAOF）：
  读取当前内存数据 → 生成最小化 AOF 命令
  fork 子进程执行重写
  重写期间的增量命令写入新 AOF + 旧 AOF buffer
  重写完成后替换旧 AOF 文件

  auto-aof-rewrite-percentage 100   # AOF 文件增长 100% 触发重写
  auto-aof-rewrite-min-size 64mb    # 最小 64MB 才触发
```

### 11.3 混合持久化（Redis 4.0+）

```
混合持久化 = RDB 快照 + AOF 增量日志

  aof-use-rdb-preamble yes  # 开启混合持久化

  重写时：
    先写 RDB 快照头（二进制，恢复快）
    再追加重写期间的 AOF 增量命令
    文件格式：[RDB 数据] + [AOF 增量]

  优点：
    恢复速度：RDB 的恢复速度（秒级）
    数据安全：AOF 的增量保障（最多丢 1 秒）
    文件大小：比纯 AOF 小（RDB 压缩率高）

  生产推荐：混合持久化（兼顾恢复速度与数据安全）
```

---

## 十二、Redis 内存优化

### 12.1 编码优化

```
Redis 为每种数据类型选择最优底层编码：

String：
  整数（-2^63 ~ 2^63-1）→ int 编码（8 字节，无额外开销）
  短字符串（≤ 44 字节）→ embstr 编码（一次内存分配）
  长字符串 → raw 编码（两次分配）

Hash：
  小 Hash（field ≤ 128 且 value ≤ 64 字节）→ ziplist（压缩列表）
  大 Hash → hashtable（哈希表）
  优化：控制 field 数量，尽量用 ziplist

List：
  小 List → ziplist（连续内存，缓存友好）
  大 List → quicklist（ziplist + 双向链表）

Set：
  纯整数 Set → intset（有序数组，内存极小）
  混合/字符串 Set → hashtable

ZSet：
  小 ZSet（≤ 128 且 value ≤ 64 字节）→ ziplist
  大 ZSet → skiplist + hashtable

内存优化技巧：
  ziplist 比 hashtable 节省 5-10x 内存
  intset 比 hashtable 节省 20x+ 内存
  整数存储比字符串省 2-3x
```

### 12.2 内存碎片治理

```bash
# 查看碎片率
redis-cli info memory | grep mem_fragmentation_ratio
#   > 1.5: 碎片率高，需要处理
#   < 1.0: 可能使用了 swap（危险）

# 内存整理（Redis 4.0+）
redis-cli memory purge        # 手动释放碎片内存
redis-cli config set activedefrag yes  # 开启自动碎片整理

# active-defrag-enabled yes
# active-defrag-threshold-lower 10    # 碎片率 > 10% 开始整理
# active-defrag-threshold-upper 100   # 碎片率 > 100% 全力整理
# active-defrag-cycle-min 1           # 最小整理 CPU 使用率
# active-defrag-cycle-max 25          # 最大整理 CPU 使用率

# 预防碎片：
#   使用 jemalloc 分配器（Redis 默认）
#   避免大 key 频繁创建删除
#   合理设置 maxmemory
```

---

## 十三、Redis Pub/Sub 局限与 Streams

### 13.1 Pub/Sub 的局限

```
Pub/Sub 缺陷：
  1. 消息不持久化：消费者离线期间的消息直接丢失
  2. 无消息确认：发送即忘（fire and forget）
  3. 无消费者组：每个消费者收到全量消息
  4. 不支持消息回溯：无法重放历史消息
  5. 无背压：生产快消费慢 → 消费者 OOM

  适用场景：实时通知（如在线状态广播）
  不适用：消息队列、事件溯源、可靠投递
```

### 13.2 Redis Streams（事件溯源）

```
Streams = 持久化消息队列 + 消费者组

  XADD: 添加消息
  XREAD: 消费消息（阻塞/非阻塞）
  XREADGROUP: 消费者组消费
  XACK: 确认消息
  XPENDING: 查看待确认消息
  XTRIM: 裁剪历史消息
  XRANGE: 查询历史消息

生产者：
  XADD mystream * name order123 action created amount 99.5
  # * 表示自动生成 ID（时间戳-序号）

消费者组：
  XGROUP CREATE mystream mygroup 0    # 创建消费者组（从头消费）
  XREADGROUP GROUP mygroup consumer1 COUNT 1 BLOCK 5000 STREAMS mystream >
  # > 表示读取未被消费的消息
  XACK mystream mygroup 1234567890-0  # 确认消息

消息持久化：
  消息持久化到 RDB/AOF → 重启不丢
  消费者状态（pending list）也持久化 → 断点续传

适用场景：
  事件溯源（Event Sourcing）
  轻量消息队列（替代 Kafka/RabbitMQ 的简单场景）
  实时数据流（日志/指标采集）
```

### 13.3 Streams vs Kafka

| 维度 | Redis Streams | Kafka |
|------|--------------|-------|
| 吞吐 | 10万级/秒 | 百万级/秒 |
| 持久化 | RDB/AOF（可能丢） | 磁盘顺序写（不丢） |
| 消费者组 | 支持（轻量） | 支持（重量级） |
| 消息回溯 | 支持（XRANGE） | 支持（offset） |
| 分区 | 无（单 Stream） | 多 Partition |
| 部署 | 现有 Redis 实例 | 独立集群 |
| 适用 | 轻量/实时/已有 Redis | 大规模/流处理 |

---

## 十四、Redis Lua 脚本与事务对比

### 14.1 Lua 脚本

```lua
-- Lua 脚本：原子执行（Redis 单线程保证）
-- 分布式锁解锁（原子检查 + 删除）
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
else
    return 0
end

-- 使用
EVAL "脚本内容" 1 lock_key unique_value

-- Lua 脚本优势：
--   原子执行：脚本执行期间其他命令被阻塞
--   减少网络往返：多个操作打包执行
--   脚本缓存：SCRIPT LOAD 后 EVALSHA 复用

-- Lua 脚本风险：
--   脚本执行阻塞所有命令（慢脚本 = 整体卡死）
--   Redis 6.0+ 支持脚本超时：lua-time-limit 5000
--   生产建议：脚本尽量短，避免复杂循环
```

### 14.2 事务 vs Pipeline

```
MULTI/EXEC 事务：
  MULTI → 命令入队 → EXEC → 一次执行所有命令
  优势：原子性（全部成功或全部失败）
  劣势：不支持条件判断（无回滚）

Pipeline：
  批量发送命令 → 一次读取所有响应
  优势：减少网络往返（RTT），性能提升 5-10x
  劣势：非原子（中间可能插入其他客户端命令）

对比：
  事务：需要原子性（如转账）→ MULTI/EXEC
  Pipeline：批量操作（如批量写入）→ Pipeline
  条件操作：需要原子判断 → Lua 脚本

性能对比（10000 次 SET）：
  普通：10000 次 RTT（每次 1ms）→ 10 秒
  Pipeline：1 次 RTT → 10ms
  事务：1 次 RTT → 10ms（类似 Pipeline）
```

---

## 十五、分布式锁生产模式

### 15.1 单节点分布式锁

```python
# Python 示例（redis-py）
import redis
import uuid
import time

r = redis.Redis()

def acquire_lock(lock_key, ttl_ms=30000):
    """加锁：SET NX PX"""
    value = str(uuid.uuid4())
    ok = r.set(lock_key, value, nx=True, px=ttl_ms)
    return value if ok else None

def release_lock(lock_key, value):
    """解锁：Lua 原子检查+删除"""
    lua_script = """
    if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
    else
        return 0
    end
    """
    return r.eval(lua_script, 1, lock_key, value)

# 业务使用
lock_val = acquire_lock("order:123")
if lock_val:
    try:
        process_order(123)
    finally:
        release_lock("order:123", lock_val)
```

### 15.2 Redlock（多节点锁）

```
Redlock 算法（Redis 官方推荐的分布式锁）：

  1. 获取当前时间 T1
  2. 依次向 N 个独立 Redis Master 加锁（超时 50ms）
  3. 获取当前时间 T2，锁有效期 = TTL - (T2 - T1)
  4. 如果在 N/2+1 个节点加锁成功，且总耗时 < TTL → 锁生效
  5. 锁实际有效期 = TTL - 获取锁耗时
  6. 如果加锁失败 → 向所有节点释放锁

争议（Martin Kleppmann vs Antirez）：
  Martin：GC 暂停/时钟跳跃可能导致锁失效
  Antirez：实际场景中 GC 暂停可以通过 fencing token 解决

生产建议：
  一般场景：单 Master + 哨兵足够
  极高可靠性：Redlock 或 ZooKeeper/etcd（CP 系统）
  看门狗续期：Redisson 自动续期（避免业务未完成锁已过期）
```

### 15.3 Redis 缓存淘汰策略完整列表

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| **noeviction** | 不淘汰，写入报错 | 不允许丢数据 |
| **allkeys-lru** | 全体 key LRU 淘汰 | **缓存场景（推荐）** |
| **allkeys-lfu** | 全体 key LFU 淘汰（4.0+） | 有明显热点 |
| **allkeys-random** | 全体 key 随机淘汰 | 无明显热点 |
| **volatile-lru** | 有 TTL 的 key LRU 淘汰 | 部分 key 有过期时间 |
| **volatile-lfu** | 有 TTL 的 key LFU 淘汰（4.0+） | 有 TTL + 热点 |
| **volatile-ttl** | 优先淘汰即将过期的 key | 有过期时间 |
| **volatile-random** | 有 TTL 的 key 随机淘汰 | 有过期时间 |

```
LRU vs LFU：
  LRU（最近最少使用）：淘汰最久未访问的 key
  LFU（最不经常使用）：淘汰访问频率最低的 key

  LFU 更精确（避免偶尔访问的 key 占内存）
  但 LFU 需要额外计数器（内存开销略大）

生产配置：
  maxmemory-policy allkeys-lru（纯缓存）
  maxmemory-policy volatile-lru（混合持久+缓存）
  maxmemory 8GB（设置上限防 OOM）
```

### 15.4 Redis 复制协议深入

```
全量同步流程：
  1. Slave 连接 Master → PSYNC ? -1（首次同步）
  2. Master 执行 BGSAVE → 生成 RDB
  3. Master 发送 RDB 到 Slave（期间写命令缓冲）
  4. Slave 加载 RDB
  5. Master 发送缓冲区增量命令

增量同步流程：
  1. Slave 断线重连 → PSYNC <runid> <offset>
  2. Master 检查 offset 是否在复制积压缓冲区（repl_backlog）
  3. 如果在 → 部分同步（发送 offset 之后的命令）
  4. 如果不在 → 全量同步

复制积压缓冲区：
  repl-backlog-size 1mb    # 默认 1MB
  repl-backlog-ttl 3600    # 无 Slave 时保留 1 小时

  建议设大：256MB+（避免频繁全量同步）
  网络抖动后自动增量同步（避免重传全量 RDB）

异步复制：
  Redis 复制是异步的 → 主从之间有延迟
  读写分离时注意：写后读可能读到旧数据
  解决：READONLY 命令 + 从 Master 读关键数据
```

---

## 十六、Redis Cluster 自动化 Rebalancing

### 16.1 自动重平衡流程

```
Redis Cluster Rebalancing 自动化：
  1. 添加新节点：redis-cli --cluster add-node <new>:6379 <existing>:6379
  2. 检查集群状态：redis-cli --cluster check <any>:6379
  3. 自动重平衡：redis-cli --cluster rebalance <any>:6379 --auto-weights
  4. 迁移 Slot：自动将部分 Slot 从旧节点迁移到新节点

  自动 Rebalance 参数：
    --cluster权重：每个节点的权重（决定迁移多少 Slot）
    --cluster-use-empty-masters：空 Master 也参与分配
    --cluster-check-empty：迁移前检查是否有空 Slot

  迁移过程中 Slot 状态：
    MIGRATING：源节点正在迁出
    IMPORTING：目标节点正在迁入
    客户端需处理 ASK/MOVED 重定向
```

### 16.2 在线扩缩容实践

```bash
# 1. 扩容：添加 2 个新节点
redis-cli --cluster add-node 10.0.0.4:6379 10.0.0.1:6379
redis-cli --cluster add-node 10.0.0.5:6379 10.0.0.1:6379

# 2. 自动 Rebalance（均匀分配）
redis-cli --cluster rebalance 10.0.0.1:6379 \
  --cluster-weight 10.0.0.1=1 10.0.0.2=1 10.0.0.3=1 10.0.0.4=1 10.0.0.5=1

# 3. 缩容：先迁移 Slot，再删除节点
redis-cli --cluster reshard 10.0.0.1:6379 \
  --cluster-from <node-id> --cluster-to <target-id> --cluster-slots <num> --cluster-yes
redis-cli --cluster del-node 10.0.0.1:6379 <node-id>

# 4. 监控迁移进度
redis-cli --cluster info 10.0.0.1:6379
```

---

## 十七、Redis Pipeline vs Cluster Pipeline

### 17.1 Pipeline 对比

| 维度 | 单节点 Pipeline | Cluster Pipeline |
|------|-----------------|------------------|
| 命令路由 | 单节点直连 | 需按 Slot 分组 |
| 批量发送 | 所有命令一次发送 | 按节点分组发送 |
| 响应解析 | 顺序解析 | 按节点解析 |
| 性能 | 极高（减少 RTT） | 高（但需分组开销） |
| 适用 | 单节点/主从 | Cluster 集群 |

### 17.2 Cluster Pipeline 实现

```python
# Python: Cluster Pipeline 示例
from redis.cluster import RedisCluster

rc = RedisCluster(host='10.0.0.1', port=6379)

pipe = rc.pipeline(transaction=False)  # Cluster 不支持 MULTI/EXEC
pipe.set('key1', 'val1')
pipe.set('key2', 'val2')
pipe.get('key1')
results = pipe.execute()  # 自动按 Slot 分组发送

# 按节点分组发送示例：
# Node A (slot 0-5460): SET key1 val1
# Node B (slot 5461-10922): SET key2 val2
# Node A: GET key1
# 合并响应返回
```

---

## 十八、Redis Lua 脚本高级模式

### 18.1 复杂 Lua 脚本示例

```lua
-- 分布式限流：滑动窗口计数器
-- KEYS[1] = 限流 key
-- ARGV[1] = 窗口大小（秒）
-- ARGV[2] = 最大请求数
-- ARGV[3] = 当前时间戳（毫秒）
local key = KEYS[1]
local window = tonumber(ARGV[1]) * 1000
local max_requests = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

-- 移除窗口外的记录
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)

-- 当前窗口内的请求数
local current = redis.call('ZCARD', key)

if current < max_requests then
    redis.call('ZADD', key, now, now .. math.random())
    redis.call('EXPIRE', key, math.ceil(window / 1000))
    return 1  -- 允许
else
    return 0  -- 拒绝
end
```

### 18.2 Lua 脚本调试与性能

```
Lua 脚本调试：
  redis-cli EVAL "脚本" 0 --eval <script-file>
  
  调试模式：
    redis-cli --ldb --eval /path/to/script.lua
    step (s): 单步执行
    continue (c): 继续执行
    print var: 打印变量

  性能优化：
    1. 脚本尽量短（避免阻塞其他命令）
    2. 使用 KEYS 而非 ARGV 传递 key（编译期校验）
    3. 避免循环中的 redis.call
    4. 复杂逻辑拆分为多个 Lua 脚本
    5. 监控脚本执行时间：SLOWLOG GET

  Redis 6.0+ 脚本超时：
    lua-time-limit 5000  # 脚本执行超时 5 秒
    超时后其他客户端可发送 SCRIPT KILL
```

---

## 十九、Redis Module 生态

### 19.1 模块加载与管理

```bash
# 加载模块
redis-cli MODULE LOAD /path/to/module.so

# 查看已加载模块
redis-cli MODULE LIST

# 卸载模块
redis-cli MODULE UNLOAD module_name

# 启动时加载
# redis.conf
loadmodule /path/to/module.so
```

### 19.2 RedisJSON

```bash
# 存储 JSON
redis-cli JSON.SET user:1 '.' '{"name":"张三","age":30,"scores":[90,85,95]}'

# 读取嵌套字段
redis-cli JSON.GET user:1 '.name'

# 数组操作
redis-cli JSON.ARRAPPEND user:1 '.scores' 88

# 嵌套更新
redis-cli JSON.SET user:1 '.address.city' '"北京"'

# JSON 索引（RediSearch 集成）
redis-cli FT.CREATE idx ON JSON PREFIX 1 user: SCHEMA $.name AS name TEXT $.age AS age NUMERIC
redis-cli FT.SEARCH idx '@name:张三'
```

### 19.3 RediSearch

```bash
# 创建全文索引
redis-cli FT.CREATE idx ON HASH PREFIX 1 doc: SCHEMA title TEXT body TEXT category TAG

# 添加文档
redis-cli HSET doc:1 title "Redis入门" body "Redis是内存数据库" category "技术"
redis-cli HSET doc:2 title "Java编程" body "Java面向对象" category "技术"

# 全文搜索
redis-cli FT.SEARCH idx "Redis" LIMIT 0 10

# 带过滤的搜索
redis-cli FT.SEARCH idx "@category:{技术} @title:Redis"

# 聚合查询
redis-cli FT.AGGREGATE idx "*" GROUPBY 0 REDUCE COUNT 0 AS total
```

### 19.4 RedisGraph（图数据库）

```bash
# 创建图
redis-cli GRAPH.QUERY social "CREATE (:Person {name:'张三',age:30})"

# 添加关系
redis-cli GRAPH.QUERY social "MATCH (a:Person {name:'张三'}), (b:Person {name:'李四'}) CREATE (a)-[:FRIEND]->(b)"

# 图查询（Cypher）
redis-cli GRAPH.QUERY social "MATCH (a:Person)-[:FRIEND]->(b:Person) RETURN a.name, b.name"
```

---

## 二十、Redis 时间序列

### 20.1 RedisTimeSeries 模块

```bash
# 创建时间序列
redis-cli TS.CREATE temperature:station1 RETENTION 86400000 LABELS station "北京"

# 写入数据点
redis-cli TS.ADD temperature:station1 1700000000000 25.5

# 范围查询
redis-cli TS.RANGE temperature:station1 1700000000000 1700003600000 AGGREGATION avg 3600000

# 聚合：每小时平均温度
redis-cli TS.RANGE temperature:station1 - + AGGREGATION avg 3600000

# 写入批量数据
redis-cli TS.MADD temperature:station1 1700000001000 25.6 temperature:station1 1700000002000 25.7
```

### 20.2 监控指标存储

```bash
# 存储系统指标
redis-cli TS.CREATE cpu:usage LABELS host "server1" metric "cpu"
redis-cli TS.CREATE memory:usage LABELS host "server1" metric "memory"

# 每 10 秒采集一次
while true; do
  usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}')
  redis-cli TS.ADD cpu:usage $(date +%s000) $usage
  sleep 10
done

# 查询最近 1 小时的 CPU 使用率
redis-cli TS.RANGE cpu:usage $(date -d '1 hour ago' +%s000) $(date +%s000) AGGREGATION avg 60000
```

---

## 二十一、Redis 布隆过滤器

### 21.1 RedisBloom 模块

```bash
# 创建布隆过滤器
redis-cli BF.RESERVE user_filter 0.001 1000000
# 误判率 0.1%，容量 100 万

# 添加元素
redis-cli BF.ADD user_filter "user:1001"
redis-cli BF.MADD user_filter "user:1002" "user:1003"

# 检查是否存在
redis-cli BF.EXISTS user_filter "user:1001"  # 1 = 存在
redis-cli BF.EXISTS user_filter "user:9999"  # 0 = 不存在

# 布隆过滤器统计
redis-cli BF.INFO user_filter
```

### 21.2 布隆过滤器防缓存穿透

```java
// 布隆过滤器防缓存穿透
@Service
public class UserService {
    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    public User getUser(String userId) {
        // 1. 布隆过滤器快速判断
        Boolean exists = redisTemplate.opsForValue()
            .getBit("user:bloom", Long.parseLong(userId));
        if (exists == null || !exists) {
            return null;  // 一定不存在，直接返回
        }

        // 2. 查缓存
        User user = getFromCache(userId);
        if (user != null) return user;

        // 3. 查数据库
        user = userMapper.selectById(userId);
        if (user != null) {
            setCache(userId, user);
        }
        return user;
    }
}
```

---

## 二十二、Redis GEO 地理空间

### 22.1 GEO 操作

```bash
# 添加地理位置
redis-cli GEOADD locations 116.397128 39.916527 "天安门"
redis-cli GEOADD locations 116.405285 39.904989 "故宫"
redis-cli GEOADD locations 116.427231 39.991246 "鸟巢"

# 附近的人（半径搜索）
redis-cli GEORADIUS locations 116.397128 39.916527 5 km WITHDIST ASC COUNT 10

# 计算两点距离
redis-cli GEODIST locations "天安门" "故宫" km

# 获取位置坐标
redis-cli GEOPOS locations "天安门"

# GeoHash 编码
redis-cli GEOHASH locations "天安门"
```

### 22.2 GEO + 命令模式

```java
// 附近门店查询
public List<Store> findNearbyStores(double lng, double lat, double radiusKm) {
    GeoResults<GeoLocation<String>> results = redisTemplate.opsForGeo()
        .radius("stores", new Circle(new Point(lng, lat), new Distance(radiusKm, RedisTemplate.DistanceUnit.KILOMETERS)),
            RedisGeoCommands.GeoSearchCommandArgs.newGeoSearchArgs()
                .includeDistance()
                .sortAscending()
                .limit(20));

    return results.getContent().stream()
        .map(r -> {
            Store store = new Store();
            store.setName(r.getContent().getName());
            store.setDistance(r.getDistance().getValue());
            return store;
        })
        .collect(Collectors.toList());
}
```

---

## 二十三、Redis Streams 消费者组深入

### 23.1 消费者组高级配置

```bash
# 创建消费者组（从头消费）
redis-cli XGROUP CREATE mystream mygroup 0

# 创建消费者组（从最新消费）
redis-cli XGROUP CREATE mystream mygroup $

# 消费者组配置
redis-cli XGROUP SETID mystream mygroup 0  # 重置偏移量

# 消费消息（阻塞）
redis-cli XREADGROUP GROUP mygroup consumer1 COUNT 10 BLOCK 5000 STREAMS mystream >

# 确认消息
redis-cli XACK mystream mygroup 1700000000000-0

# 查看待确认消息
redis-cli XPENDING mystream mygroup

# 转移待确认消息（消费者超时）
redis-cli XCLAIM mystream mygroup consumer2 3600000 1700000000000-0

# 自动转移（PEL 自动清理）
redis-cli XAUTOCLAIM mystream mygroup consumer2 3600000 0 COUNT 10
```

### 23.2 Streams 消费模式对比

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| 独立消费 | 每个消费者收到全量消息 | 通知/广播 |
| 消费者组 | 消息在组内分配 | 负载均衡 |
| 多消费者组 | 每个组独立消费全量 | 不同业务消费 |
| 死信队列 | 消费失败转入 DLQ | 可靠消费 |

```
消费者组状态管理：
  PEL（Pending Entries List）：已消费未确认的消息
  XPENDING：查看 PEL 状态
  XCLAIM：手动转移超时消息
  XAUTOCLAIM：自动转移超时消息（Redis 6.2+）
  
  生产建议：
    设置合理的 BLOCK 超时（避免空轮询）
    监控 PEL 大小（过大说明消费积压）
    定期 XAUTOCLAIM 清理超时消息
    使用 XINFO 查看消费者组状态
```

---

## 与其他板块的关系

- Redis 基础知识见「[基础知识/redis知识](../redis知识.md)」；
- 缓存设计模式见「[场景设计/缓存经典三问](../../场景设计/缓存经典三问与一致性.md)」；
- 分布式锁见「[场景设计/分布式锁](../../场景设计/分布式锁.md)」；
- 多级缓存见「[场景设计/多级缓存框架](../../场景设计/多级缓存框架.md)」；
- 云上缓存见「[云上数据库与缓存生态](./云上数据库与缓存生态.md)」。

> 一句话：**Redis = 内存数据结构服务器（5大基础+5大数据结构）+ 持久化（RDB/AOF/混合）+ 集群（Cluster/哨兵）+ 分布式锁（Redlock/Redisson）；选型先看「数据结构需求（缓存→String，排行榜→ZSet，UV→HLL）」，再定「规模（单机/主从/Cluster）」，最后治「大Key/热Key/慢命令」**。
