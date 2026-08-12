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

## 九、与其他板块的关系

- Redis 基础知识见「[基础知识/redis知识](../redis知识.md)」；
- 缓存设计模式见「[场景设计/缓存经典三问](../../场景设计/缓存经典三问与一致性.md)」；
- 分布式锁见「[场景设计/分布式锁](../../场景设计/分布式锁.md)」；
- 多级缓存见「[场景设计/多级缓存框架](../../场景设计/多级缓存框架.md)」；
- 云上缓存见「[云上数据库与缓存生态](./云上数据库与缓存生态.md)」。

> 一句话：**Redis = 内存数据结构服务器（5大基础+5大数据结构）+ 持久化（RDB/AOF/混合）+ 集群（Cluster/哨兵）+ 分布式锁（Redlock/Redisson）；选型先看「数据结构需求（缓存→String，排行榜→ZSet，UV→HLL）」，再定「规模（单机/主从/Cluster）」，最后治「大Key/热Key/慢命令」**。
