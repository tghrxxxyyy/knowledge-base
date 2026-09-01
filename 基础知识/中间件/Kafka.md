# Kafka（分布式消息队列 / 流平台）

> 互联网高吞吐消息事实标准：日志、埋点、大数据管道、CDC 载体。本文是**实用篇**——架构、副本与 ISR、生产/消费细节、事务与 Exactly-Once、生产排障一条龙；与「源码系列/Kafka源码」互补（那边偏源码实现）。
> 开源参考：[apache/kafka](https://github.com/apache/kafka)（Scala/Java，Apache 2.0，LinkedIn 开源，最大开源消息平台，公司全量用）。

---

## 〇、本体介绍（它是什么 / 适用场景 / 核心概念）

**它是什么**：Kafka 是分布式**高吞吐消息队列 + 流平台**，以「append-only 日志 + 分区并行 + 顺序写盘 + 零拷贝」为设计灵魂，吞吐可达百万级 msg/s。

**解决什么痛点**：业务系统需要海量日志/埋点采集、数据管道、事件驱动、削峰填谷。Kafka 用「分区 + 消费组 + 磁盘顺序写」把消息吞吐做到极限，且天然支持回放（消费位移自主控制）。

**核心概念**：Topic、Partition（分区）、Offset（位移）、Segment、Broker、Producer/Consumer、Consumer Group（消费组）、ISR/AR/OSR、HW/LEO、Replication（副本）、Controller、ZooKeeper 或 KRaft（元数据）、Rebalance、幂等 Producer、事务。

**适用场景**：日志/埋点采集、大数据管道（数仓入湖）、事件驱动、流处理（Kafka Streams/Flink）、CDC 载体、订单履约等异步解耦。
**不适用**：需要复杂路由/精细延迟控制（选 RabbitMQ）、需要事务消息强支持（国内选 RocketMQ）、小规模轻量业务（Kafka 运维重）。

---

## 一、它解决什么问题

| 问题 | Kafka 的解法 |
|------|-------------|
| 单机 MQ 吞吐不够 | 分区并行 + 顺序写磁盘 + 批量 + 零拷贝（sendfile） |
| 消息堆积 | 消费位移自主管理 + 磁盘存储，可长时间堆积回放 |
| 消费水平扩展 | Consumer Group：一个分区只被组内一个消费者消费 |
| 高可用 | 分区多副本（Replication），Leader 挂掉从 ISR 选新 Leader |
| 数据管道解耦 | 上游写 Kafka，下游按自己的节奏消费，生产消费互相不阻塞 |

---

## 二、核心架构

```mermaid
flowchart LR
    P1[Producer1] -->|partition key| T[Topic 3 分区]
    P2[Producer2] --> T
    subgraph B1[Broker1]
        T --> P0[Partition0 Leader]
    end
    subgraph B2[Broker2]
        T --> P1p[Partition1 Leader]
        T --> P1f[Partition0 Follower]
    end
    subgraph B3[Broker3]
        T --> P2p[Partition2 Leader]
    end
    P0 --> CG[Consumer Group]
    P1p --> CG
    P2p --> CG
    CG --> C1[Consumer1]
    CG --> C2[Consumer2]
```

### 关键设计点

1. **分区（Partition）**：一个 Topic 拆成 N 个分区，分区内消息**有序**；分区并行写/读是吞吐来源。
2. **消费组（Consumer Group）**：组内消费者**分担**不同分区（1 分区 → 1 消费者）；多个组可各自消费同一份数据（发布订阅）。
3. **副本与 ISR**：每个分区有 Leader + Follower 副本；写只能到 Leader，Follower 异步同步；`ISR`（In-Sync Replicas）= 与 Leader 保持同步的副本集合；`acks=all` 等 ISR 全确认；Leader 挂了从 ISR 选新 Leader。
4. **位移（Offset）**：消费者自主提交消费位移（`__consumer_offsets` 主题），可回退重放——这是 Kafka「可回放消息」与 RabbitMQ「消费即删」的本质区别。
5. **元数据**：老版本依赖 ZooKeeper；3.x+ 自研 **KRaft**（Raft 协议）替代 ZK，不用再单独部署 ZK。

---

## 三、生产与消费核心细节（面试高频）

### 3.1 Producer 端

- **发送语义**：`acks=0`（不等确认，最快）/ `acks=1`（Leader 确认，可能丢）/ `acks=all`（ISR 全确认，最稳）。
- **分区策略**：指定 partition；或按 key hash（同 key 落同分区，保证同 key 有序）；或随机（吞吐优先）。
- **缓冲与批量**：`linger.ms` + `batch.size` 攒批发送；`buffer.memory`（默认 32MB）内存缓冲池，减少 GC。
- **幂等 Producer**：`enable.idempotence=true`（默认开启），PID + 序列号去重，保证单分区不重复。
- **重试**：`retries` + `max.in.flight.requests.per.connection=5`（幂等开启后允许乱序重试不会重复）。

### 3.2 Consumer 端

- **拉取模型（Pull）**：消费者主动拉取，自己控制消费速度，天然适应慢消费者（区别于推送）。
- **提交位移**：`enable.auto.commit` 默认 true（自动提交）；生产建议**手动提交**（处理完再提交），防「处理失败但位移已提交」丢数据。
- **Rebalance（再平衡）**：消费者增减/分区增减触发；期间消费组暂停，可能重复消费 → 业务必须幂等。
  - 策略：Range（按范围）/ RoundRobin（轮询）/ Sticky（粘性，尽量保持原分配，减少重分配）。
  - 缓解：`max.poll.interval.ms` 调大、处理要快、静态成员（Static Membership，`group.instance.id`）防实例重启触发全组重平衡。
- **max.poll.records**：单次 poll 条数，配合消费耗时与 `max.poll.interval.ms` 防止「处理太慢被踢出组」。

### 3.3 顺序性

- **单分区内有序**：同 key 消息路由到同一分区，消费者单线程处理该分区即有序。
- 全局有序：单分区单消费者（吞吐受限），一般不必。

### 3.4 事务与 Exactly-Once（EOS）

- **幂等 Producer**：防「生产者重试导致重复」，单分区不重复。
- **事务 API**：`initTransactions → beginTransaction → send → sendOffsetsToTransaction → commit`，让「消费 + 产出」原子（Kafka Streams 依赖此实现端到端 EOS）。
- **isolation.level=read_committed**：消费者只读已提交事务消息。
- **本质提醒**：跨系统绝对 Exactly-Once 不存在，都是「幂等 + 原子提交」组合；工程上优先把下游做成幂等。

---

## 四、Kafka vs RocketMQ vs RabbitMQ vs Pulsar

| 维度 | Kafka | RocketMQ | RabbitMQ | Pulsar |
|------|-------|----------|----------|--------|
| 定位 | 日志/流/大数据管道 | 业务可靠消息 | 通用业务解耦 | 云原生流+队列 |
| 吞吐 | 100 万+ msg/s | 50 万+ | 5~10 万 | 100 万+ |
| 堆积能力 | 极强（磁盘+位移回放） | 强 | 一般（内存为主） | 极强（分层存储） |
| 事务消息 | 事务 API | ✅ 半消息（强） | ❌ 弱 | ✅ |
| 延迟消息 | ❌（靠外部） | ✅ 18 级延迟 | ✅ | ✅ |
| 顺序保证 | 分区内有序 | 队列内有序 | 单队列有序 | 分区有序 |
| 消息回溯 | ✅ 任意 offset 回放 | ✅ 按时间回放 | ❌ | ✅ |
| 运维 | 中高 | 中 | 低 | 高 |
| 选型 | 日志/埋点/管道/CDC | 国内电商/金融业务 | 企业级路由/通知 | 云原生多租户/弹性 |

**口诀**：要日志管道和极致吞吐 → Kafka；要事务消息和国内生态 → RocketMQ；要精细路由和低运维 → RabbitMQ；云原生多租户全球化 → Pulsar。

---

## 五、生产实践与排障

### 5.1 可靠性配置（消息不丢）

1. Producer：`acks=all` + 幂等 + 合理重试（注意 retry 期间顺序）。
2. Broker：`min.insync.replicas=2`（ISR 至少 2，配合 acks=all 防单副本丢）、`unclean.leader.election.enable=false`（禁止非 ISR 副本选 Leader，防止丢已确认数据——但要权衡可用性）。
3. Consumer：**手动提交位移**，先处理业务再 commit；消费逻辑幂等。
4. 磁盘：数据多副本 + RAID/云盘，`log.flush` 默认依赖 OS 刷盘即可。

### 5.2 消息积压排查（生产必备）

1. **看 lag**：`kafka-consumer-groups --describe --group xx` 看各分区 lag。
2. **根因**：消费慢（慢 SQL/远程调用/线程池满）、消费者挂、分区数不足（扩容受分区上限约束，先扩分区再扩实例）、重试风暴（异常消息反复失败占满线程）。
3. **处理**：临时扩容消费者（分区够的前提下）→ 批量消费/异步化 → 非核心逻辑降级 → 积压极大时「旁路追平」（新 topic 更多分区，搬运积压消息并行消费，追平后切回）。
4. **预防**：lag 监控告警 + 消费耗时 SLO + 大促前压测留余量 + 不可重试异常直接进 DLQ。

### 5.3 常见坑

1. **消费位移自动提交丢数据**：`enable.auto.commit=true` 且消费逻辑慢 → 处理失败但位移已提交。
2. **Repeated rebalance 风暴**：消费处理超过 `max.poll.interval.ms`（默认 5 分钟）被踢出组 → 反复重平衡 → 消费停滞。调大参数或优化消费。
3. **消费者个数 > 分区数**：多余消费者空转，白占资源。
4. **消息顺序被破坏**：并发消费同一分区、或 rebalance 后旧消费者未提交新消费者已接管。
5. **磁盘写满**：`log.retention.hours` 设太长 + 高吞吐 topic → 磁盘爆炸；按 topic 单独设 retention。
6. **页缓存假象**：Kafka 数据在页缓存时读极快，冷数据/重启后读盘变慢是正常的，别误判为故障。
7. **跨机房复制**：用 MirrorMaker 2 或 Replicator，注意 offset 映射与 Topic 命名。

### 5.4 容量估算速算

- 吞吐 = 单分区吞吐（约 5~20 MB/s） × 分区数；分区数 ≈ 目标吞吐 ÷ 单分区吞吐，再 ×（副本写放大），留 2 倍余量。
- 磁盘 = 峰值写入速率 × 保留时长 × 副本数 × 压缩比，再 ×1.5 缓冲。
- 单 Broker 分区数建议 2k~4k 上限，单分区不建议超过 100 个消费线程。

---

## 面试高频问题（20+ 条）

1. **Kafka 为什么快？** 顺序写磁盘（append-only）、分区并行、批量发送/拉取、页缓存 + 零拷贝（sendfile）、稀疏索引二分查找、压缩（lz4/zstd）。

2. **AR / ISR / OSR 是什么？** 一个分区所有副本 = AR；与 Leader 保持同步的 = ISR（含 Leader）；落后太多被踢出 ISR 的 = OSR。Leader 只能从 ISR 选。

3. **HW 和 LEO 是什么？** LEO = 日志末端偏移量；HW = 高水位，取 ISR 最小 LEO，消费者只能消费 HW 之前的消息（保证副本间一致性）。

4. **acks 三种级别？** 0（不等确认）、1（Leader 落盘确认）、all/-1（ISR 全确认）。可靠性递增，吞吐递减；生产一般 all。

5. **消息不丢失怎么保证？** Producer `acks=all`+幂等+重试；Broker 多副本 + `min.insync.replicas=2` + 禁止 unclean 选举；Consumer 手动提交位移、先处理后提交。

6. **消息重复消费怎么解决？** Kafka 至少一次语义；消费端幂等：唯一键去重表 / Redis SETNX / 状态机；重放窗口内靠幂等键吸收。

7. **消费组重平衡什么时候发生？** 消费者加入/退出、分区数变化、订阅主题变化。期间组暂停，可能重复消费。

8. **重平衡分配策略？** Range（范围平均）、RoundRobin（轮询）、Sticky（粘性，尽量保留原分区，减少重分配）。

9. **顺序性怎么保证？** 同一 key 落同一分区 + 分区内单线程消费；rebalance 和并发消费是破坏顺序的两大元凶。

10. **Kafka 和 ZooKeeper 什么关系？** 老版本用 ZK 存元数据/选 Controller；3.x+ KRaft 模式去掉 ZK，自研 Raft 管理元数据，部署更简单。

11. **消息积压怎么处理？** 先查 lag 定位瓶颈；扩容消费者（受分区数限制）→ 加分区 → 优化消费逻辑 → 旁路追平（搬运到更多分区的临时 topic 并行消费）。

12. **事务消息怎么实现？** 幂等 Producer（PID+序列号）+ 事务（transactional.id）+ 消费位移与产出同事务提交；消费者 isolation.level=read_committed。

13. **Kafka 能保证全局消息顺序吗？** 不能；只能保证分区内有序。全局有序需单分区单消费者，牺牲吞吐。

14. **消费者组和发布订阅？** 组内竞争消费（点对点），组间各自消费（发布订阅）。同一消息多个组各拿一份。

15. **Leader 选举怎么做？** Controller 从 ISR 中选；ISR 全挂时若允许 unclean 选举则可能选 OSR（丢数据），默认关闭。

16. **Controller 是什么？** 负责分区 Leader 选举、元数据变更广播的 Broker；老版依赖 ZK 选主，KRaft 模式自己选。

17. **日志清理策略？** delete（按时间/大小删旧段）和 compact（按 key 压缩，只留最新版本），两者可组合。

18. **零拷贝怎么实现的？** sendfile：数据从磁盘 → 页缓存 → 网卡，不经过用户态拷贝；配合 mmap 和批量传输。

19. **Kafka 高可用部署？** Broker 集群（≥3）+ 分区副本（≥2）+ 多机架感知 + KRaft 元数据；数据靠副本冗余，故障自动切换 Leader。

20. **什么时候选 Kafka？** 日志/埋点、大数据管道、CDC、流处理、事件溯源、需要消息回溯的场景；轻量业务解耦选 RabbitMQ，事务消息国内选 RocketMQ。

21. **Kafka 与 Flink 怎么配合？** Kafka 是 Flink 最常用的 source/sink：Flink 消费 Kafka 做窗口计算，结果写回 Kafka；Kafka 保序 + Flink 做状态计算。

22. **分区数怎么定？** 按目标吞吐 ÷ 单分区吞吐；同时考虑消费者并行度上限、rebalance 开销、文件句柄数量，一般 3~10 起步，可后扩不可随意缩。

## Replication 与 ISR 详解

### 副本同步机制

```mermaid
flowchart LR
    PRODUCER[生产者] --> LEADER[Leader]
    LEADER --> FOLLOWER1[Follower1]
    LEADER --> FOLLOWER2[Follower2]
    FOLLOWER1 -->|同步| LEADER
    FOLLOWER2 -->|同步| LEADER
```

### ISR（In-Sync Replicas）

| 概念 | 说明 |
|------|------|
| Leader | 处理所有读写请求 |
| Follower | 复制 Leader 数据 |
| ISR | 与 Leader 保持同步的副本集 |
| LEO | Log End Offset，最后一条消息位置 |
| HW | High Watermark，所有 ISR 同步的位置 |

```java
// ISR 配置
props.put("replication.factor", 3);           // 副本数
props.put("min.insync.replicas", 2);          // 最小同步副本
props.put("acks", "all");                     // 确认所有ISR
props.put("unclean.leader.election.enable", false); // 禁止非ISR选举
```

## 批量调优参数

### Producer 批量配置

| 参数 | 默认值 | 推荐值 | 说明 |
|------|--------|--------|------|
| batch.size | 16384 | 32768-65536 | 批次大小(bytes) |
| linger.ms | 0 | 5-100 | 等待时间(ms) |
| buffer.memory | 33554432 | 67108864 | 缓冲区大小 |
| compression.type | none | lz4/snappy | 压缩算法 |
| max.request.size | 1048576 | 10485760 | 最大请求大小 |

### Consumer 批量配置

| 参数 | 默认值 | 推荐值 | 说明 |
|------|--------|--------|------|
| fetch.min.bytes | 1 | 1024 | 最小拉取字节 |
| fetch.max.wait.ms | 500 | 500-1000 | 最大等待时间 |
| max.partition.fetch.bytes | 1048576 | 10485760 | 分区最大拉取 |
| max.poll.records | 500 | 1000-5000 | 最大拉取记录数 |

## 限流与背压

### 限流配置

```java
// Producer 限流
props.put("max.in.flight.requests.per.connection", 5);  // 单连接最大请求数
props.put("max.in.flight.requests.per.connection", 1);  // 严格顺序

// Consumer 限流
props.put("max.poll.records", 500);  // 每次拉取记录数
props.put("max.poll.interval.ms", 300000);  // 拉取间隔
```

### 背压处理

```mermaid
flowchart TB
    PRODUCER[生产者] -->|发送| KAFKA[Kafka]
    KAFKA -->|消费| CONSUMER[消费者]
    CONSUMER -->|处理慢| BACKPRESSURE[背压]
    BACKPRESSURE -->|减慢| PRODUCER
```

## 监控指标

### 关键监控指标

| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| UnderReplicatedPartitions | 副本不足分区数 | > 0 |
| ActiveControllerCount | 活跃控制器数 | != 1 |
| OfflinePartitionsCount | 离线分区数 | > 0 |
| Consumer Lag | 消费延迟 | 持续增长 |
| Producer Request Rate | 生产请求速率 | 突增/突降 |
| ISR Shrink Rate | ISR 收缩速率 | > 0 |

### 监控工具

| 工具 | 说明 | 适用场景 |
|------|------|----------|
| Kafka Exporter | Prometheus 指标 | 监控集成 |
| Burrow | Consumer Lag 监控 | 消费延迟 |
| Confluent Control Center | 商业监控 | 全功能 |
| Kafdrop | Web UI | 轻量管理 |

## 跨数据中心部署

### 部署架构

```mermaid
flowchart LR
    DC1[数据中心1] -->|MirrorMaker2| DC2[数据中心2]
    DC2 -->|MirrorMaker2| DC1
    DC1 --> CLUSTER1[Kafka Cluster1]
    DC2 --> CLUSTER2[Kafka Cluster2]
```

| 方案 | 说明 | 适用场景 |
|------|------|----------|
| MirrorMaker | 单向复制 | 灾备 |
| MirrorMaker2 | 双向复制 | 多活 |
| Confluent Replicator | 商业方案 | 企业级 |
| Cruise Control | 自动均衡 | 大规模 |

---

## 副本与 ISR 调优

### ISR 机制详解

```text
ISR（In-Sync Replicas）同步副本集：
  Leader 副本
    ├── 接收所有读写请求
    ├── 维护 ISR 列表
    └── 向 Follower 同步数据

  Follower 副本
    ├── 从 Leader 拉取数据
    ├── 追上 Leader（在 ISR 中）
    └── 落后 Leader（被移出 ISR）

  关键参数：
    - replica.lag.time.max.ms：Follower 最大延迟时间（默认30秒）
    - min.insync.replicas：最小同步副本数（默认1）
    - unclean.leader.election.enable：是否允许非 ISR 成为 Leader
```

### ISR 调优配置

```properties
# Broker 端配置
replica.lag.time.max.ms=30000          # Follower 最大延迟
min.insync.replicas=2                   # 最小同步副本数
unclean.leader.election.enable=false    # 禁止非 ISR 成为 Leader

# Producer 端配置
acks=all                                # 所有 ISR 确认
retries=Integer.MAX_VALUE               # 无限重试
retry.backoff.ms=100                    # 重试间隔
delivery.timeout.ms=120000              # 投递超时
request.timeout.ms=30000                # 请求超时
max.in.flight.requests.per.connection=5 # 最大未确认请求数
```

### ISR 相关指标

| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| kafka_server_ReplicaManager_IsrShrinksPerSec | ISR 缩减频率 | >0 |
| kafka_server_ReplicaManager_IsrExpandsPerSec | ISR 扩展频率 | 异常波动 |
| kafka_server_ReplicaManager_UnderReplicatedPartitions | 副本不足分区数 | >0 |
| kafka_server_ReplicaManager_OfflineReplicaCount | 离线副本数 | >0 |

### 副本分配策略

```text
副本分配策略：
  轮询分配（默认）
    Partition 0 → Broker 0, 1, 2
    Partition 1 → Broker 1, 2, 0
    Partition 2 → Broker 2, 0, 1

  机架感知分配
    Partition 0 → Broker 0 (Rack A), 1 (Rack B), 2 (Rack C)
    确保副本分布在不同机架

  自定义分配
    通过 admin API 手动指定副本位置
```

---

## 批处理与压缩优化

### 批处理配置

```properties
# Producer 批处理
batch.size=16384                        # 批次大小（16KB）
linger.ms=5                             # 等待时间（5ms）
buffer.memory=33554432                  # 缓冲区大小（32MB）
max.block.ms=60000                      # 缓冲区满时阻塞时间

# Consumer 批处理
fetch.min.bytes=1                       # 最小拉取字节
fetch.max.wait.ms=500                   # 最大等待时间
max.partition.fetch.bytes=1048576       # 单分区最大拉取（1MB）
```

### 压缩配置

```properties
# Producer 压缩
compression.type=snappy                 # 压缩类型（snappy/gzip/lz4/zstd）

# Broker 端压缩
compression.type=producer               # 保持 Producer 压缩（不重新压缩）
```

### 批处理与压缩效果

| 配置 | 吞吐量 | 延迟 | CPU使用 | 适用场景 |
|------|--------|------|---------|----------|
| batch.size=16KB, linger.ms=0 | 低 | 低 | 低 | 低延迟 |
| batch.size=64KB, linger.ms=5 | 高 | 中 | 中 | 平衡 |
| batch.size=128KB, linger.ms=20 | 极高 | 高 | 高 | 高吞吐 |
| compression.type=snappy | 高 | 中 | 中 | 通用 |
| compression.type=lz4 | 高 | 低 | 低 | 实时 |
| compression.type=zstd | 极高 | 高 | 高 | 归档 |

---

## 配额与限流

### 配额配置

```properties
# Producer 配额
producer_byte_rate=10485760            # 10MB/s

# Consumer 配额
consumer_byte_rate=20971520            # 20MB/s

# Request 配额
request_percentage=25                  # 请求处理时间占比25%
```

### 动态配额

```bash
# 设置配额
kafka-configs.sh --bootstrap-server localhost:9092 \
  --alter --add-config 'producer_byte_rate=10485760' \
  --entity-type users --entity-name user1

# 查看配额
kafka-configs.sh --bootstrap-server localhost:9092 \
  --describe --entity-type users --entity-name user1

# 删除配额
kafka-configs.sh --bootstrap-server localhost:9092 \
  --alter --delete-config 'producer_byte_rate' \
  --entity-type users --entity-name user1
```

### 限流策略

```text
限流维度：
  1. 按用户限流
     - 限制单个用户的生产/消费速率
     - 防止单用户占用过多资源

  2. 按客户端限流
     - 限制单个客户端的请求频率
     - 防止异常客户端影响集群

  3. 按 Topic 限流
     - 限制单个 Topic 的写入/读取速率
     - 保护重要 Topic 的性能

  4. 按 Broker 限流
     - 限制单个 Broker 的请求处理速率
     - 防止 Broker 过载

限流触发处理：
  - 返回 throttle（限流）响应
  - 客户端等待 throttle 时间后重试
  - 记录限流日志用于分析
```

---

## 监控指标详解

### Producer 关键指标

| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| kafka-producer-metrics record-send-rate | 发送速率 | 异常波动 |
| kafka-producer-metrics record-error-rate | 错误率 | >0.1% |
| kafka-producer-metrics request-latency-avg | 请求延迟 | >100ms |
| kafka-producer-metrics batch-size-avg | 批次大小 | 异常 |
| kafka-producer-metrics buffer-available-bytes | 缓冲区可用空间 | 接近0 |

### Consumer 关键指标

| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| kafka-consumer-metrics records-lag-max | 消费延迟 | >10000 |
| kafka-consumer-metrics fetch-rate | 拉取速率 | 异常波动 |
| kafka-consumer-metrics fetch-latency-avg | 拉取延迟 | >500ms |
| kafka-consumer-metrics commit-latency-avg | 提交延迟 | >1000ms |
| kafka-consumer-metrics heartbeat-rate | 心跳频率 | 异常 |

### Broker 关键指标

| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| kafka_server_BrokerTopicMetrics_MessagesInPerSec | 消息输入速率 | 异常波动 |
| kafka_server_BrokerTopicMetrics_BytesInPerSec | 字节输入速率 | 异常波动 |
| kafka_server_BrokerTopicMetrics_BytesOutPerSec | 字节输出速率 | 异常波动 |
| kafka_server_ReplicaManager_UnderReplicatedPartitions | 副本不足分区 | >0 |
| kafka_server_ReplicaManager_OfflineReplicaCount | 离线副本数 | >0 |
| kafka_server_ReplicaManager_IsrShrinksPerSec | ISR缩减频率 | >0 |
| kafka_server_ReplicaManager_IsrExpandsPerSec | ISR扩展频率 | 异常 |

### 监控仪表盘设计

```text
Grafana Dashboard 设计：
  1. 集群概览
     - Broker 数量和状态
     - Topic 数量和分区分布
     - 消息吞吐量趋势
     - 延迟分布

  2. Producer 分析
     - 各 Producer 吞吐量
     - 各 Producer 延迟
     - 各 Producer 错误率
     - 批次大小分布

  3. Consumer 分析
     - 各 Consumer 消费速率
     - 各 Consumer 消费延迟
     - Consumer Group 状态
     - Offset 提交情况

  4. 告警统计
     - 告警数量趋势
     - 告警级别分布
     - 告警响应时间
     - 告警解决率
```

---

## 跨数据中心复制

### 跨 DC 架构

```text
跨 DC 复制模式：
  模式1：Active-Passive（主备）
    DC1（Active）──→ DC2（Passive）
    用途：灾备

  模式2：Active-Active（双活）
    DC1 ←──→ DC2
    用途：多活

  模式3：Hub-Spoke（中心辐射）
    DC1（Hub）←──→ DC2（Spoke）
    DC1（Hub）←──→ DC3（Spoke）
    用途：多区域

  模式4：Mesh（网状）
    DC1 ←──→ DC2
    DC1 ←──→ DC3
    DC2 ←──→ DC3
    用途：完全多活
```

### MirrorMaker 2 配置

```properties
# mm2.properties
clusters = dc1, dc2

dc1.bootstrap.servers = kafka-dc1:9092
dc2.bootstrap.servers = kafka-dc2:9092

dc1->dc2.enabled = true
dc2->dc1.enabled = true

replication.factor = 3
sync.topic.configs.enabled = true

# 同步所有 Topic
dc1->dc2.topics = .*
dc2->dc1.topics = .*

# 排除内部 Topic
dc1->dc2.topics.exclude = __.*, _confluent.*
dc2->dc1.topics.exclude = __.*, _confluent.*
```

### 跨 DC 注意事项

```text
跨 DC 注意事项：
  1. 网络延迟
     - DC间延迟通常 1-50ms
     - 影响 ISR 同步
     - 需要调整 replica.lag.time.max.ms

  2. 带宽成本
     - 跨DC数据传输费用高
     - 使用压缩减少传输量
     - 选择性同步重要 Topic

  3. 数据一致性
     - 跨DC无法保证强一致性
     - 使用最终一致性模型
     - 配置合适的acks和min.insync.replicas

  4. 故障处理
     - DC间网络分区处理
     - 优雅降级策略
     - 数据冲突解决

  5. 运维复杂度
     - 多DC监控和告警
     - 统一配置管理
     - 跨DC故障演练
```

---

## KRaft 模式

### KRaft vs ZooKeeper

| 维度 | ZooKeeper | KRaft |
|------|-----------|-------|
| 架构 | 外部依赖 | 内置 |
| 扩展性 | 受限于ZK | 水平扩展 |
| 性能 | 一般 | 更高 |
| 运维 | 复杂 | 简单 |
| 稳定性 | 成熟 | 逐步成熟 |

### KRaft 配置

```properties
# KRaft 配置
process.roles=broker,controller          # 节点角色
node.id=1                                # 节点ID
controller.quorum.voters=1@kafka1:9093,2@kafka2:9093,3@kafka3:9093
controller.listener.names=CONTROLLER
listeners=PLAINTEXT://:9092,CONTROLLER://:9093
```

### KRaft 迁移计划

```text
迁移步骤：
  1. 准备阶段
     - 部署 KRaft 集群
     - 验证功能
     - 测试性能

  2. 数据迁移
     - 使用 Kafka Raft Metadat Log
     - 迁移元数据
     - 验证数据一致性

  3. 切换阶段
     - 切换到 KRaft 模式
     - 监控集群状态
     - 准备回滚方案

  4. 清理阶段
     - 移除 ZooKeeper 集群
     - 清理相关配置
     - 更新运维文档
```

---

## Kafka Streams vs 其他流处理

| 维度 | Kafka Streams | Flink | Spark Streaming |
|------|---------------|-------|-----------------|
| 部署模式 | 嵌入式 | 独立集群 | 独立集群 |
| 状态管理 | 本地状态 | 分布式状态 | 分布式状态 |
| Exactly-Once | 支持 | 支持 | 支持 |
| 窗口操作 | 支持 | 支持 | 支持 |
| 运维复杂度 | 低 | 中 | 高 |
| 适用场景 | 轻量级流处理 | 复杂流处理 | 批流一体 |

```text
选择建议：
  1. 轻量级流处理 → Kafka Streams
     - 简单的过滤、转换、聚合
     - 不需要独立集群
     - 与Kafka紧密集成

  2. 复杂流处理 → Flink
     - 复杂窗口操作
     - 复杂状态管理
     - 需要高吞吐低延迟

  3. 批流一体 → Spark Streaming
     - 统一批处理和流处理
     - 已有Spark生态
     - 需要复杂机器学习
```

---

## 事务与 Exactly-Once

### 事务配置

```properties
# Producer 事务配置
transactional.id=my-transactional-id
transaction.timeout.ms=60000

# Broker 事务配置
transaction.state.log.replication.factor=3
transaction.state.log.min.isr=2
```

### 事务使用示例

```java
// 事务性 Producer
Properties props = new Properties();
props.put("transactional.id", "my-transactional-id");
props.put("enable.idempotence", "true");

Producer<String, String> producer = new KafkaProducer<>(props);
producer.initTransactions();

try {
    producer.beginTransaction();
    // 读取输入
    ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(100));
    for (ConsumerRecord<String, String> record : records) {
        // 处理并写入输出
        producer.send(new ProducerRecord<>("output-topic", record.key(), record.value()));
    }
    // 提交偏移量
    producer.sendOffsetsToTransaction(offsets, consumerGroupId);
    producer.commitTransaction();
} catch (Exception e) {
    producer.abortTransaction();
}
```

### Exactly-Once 语义

```text
Exactly-Once 实现方式：
  1. 幂等 Producer
     - 每个 Producer 分配唯一 PID
     - 每条消息分配序列号
     - Broker 去重

  2. 事务性 Producer
     - 原子写入多个 Topic
     - 原子提交偏移量
     - 支持读-处理-写模式

  3. Kafka Streams
     - 内置 Exactly-Once 支持
     - 状态存储和输出Topic原子写入
     - 与事务性Producer集成

配置要点：
  - enable.idempotence=true
  - transactional.id=唯一ID
  - isolation.level=read_committed（Consumer端）
```

---

## Sink Connector Exactly-Once

### Sink Connector 配置

```properties
# JDBC Sink Connector
connector.class=io.confluent.connect.jdbc.JdbcSinkConnector
topics=user_events
connection.url=jdbc:mysql://localhost:3306/mydb
insert.mode=upsert
pk.mode=record_key
pk.fields=user_id
batch.size=1000
```

### Exactly-Once Sink 实现

```text
Sink Connector Exactly-Once 实现：
  1. 事务性 Sink
     - 在事务内写入目标系统
     - 原子提交偏移量
     - 失败时回滚

  2. 幂等 Sink
     - 使用唯一键去重
     - 支持 upsert 操作
     - 目标系统支持幂等写入

  3. 两阶段提交
     - 准备阶段：预写入目标系统
     - 提交阶段：确认写入
     - 回滚阶段：撤销预写入

注意事项：
  - 目标系统需支持事务
  - 配置合适的批处理大小
  - 处理网络分区情况
  - 监控事务状态
```

---

## Kafka 内部机制深度剖析

### Kafka 数据存储机制

```text
日志存储结构：
  Topic
    └── Partition
          └── Segment
                ├── .log（数据文件）
                ├── .index（偏移量索引）
                ├── .timeindex（时间索引）
                └── .txnindex（事务索引）

  Segment 切割条件：
    1. 大小超过 log.segment.bytes（默认1GB）
    2. 时间超过 log.roll.ms（默认7天）
    3. 索引满时自动切割
```

### Kafka 副本同步机制

| 概念 | 定义 | 作用 |
|------|------|------|
| LEO | Log End Offset | 下一条写入位置 |
| HW | High Watermark | 已同步位置 |
| ISR | In-Sync Replicas | 同步副本集 |
| AR | Assigned Replicas | 所有副本 |

```text
副本同步流程：
  1. Producer 写入 Leader
  2. Leader 更新 LEO
  3. Follower 拉取数据
  4. Follower 更新 LEO
  5. Leader 更新 HW（取 ISR 最小 LEO）
  6. Consumer 读取 HW 之前数据
```

### Kafka 事务机制

```java
// 事务配置示例
Properties props = new Properties();
props.put("transactional.id", "my-transactional-id");
props.put("enable.idempotence", true);
props.put("acks", "all");
props.put("retries", 3);

KafkaProducer<String, String> producer = new KafkaProducer<>(props);
producer.initTransactions();

try {
    producer.beginTransaction();
    // 发送消息
    producer.send(new ProducerRecord<>("topic", "key", "value"));
    // 提交事务
    producer.commitTransaction();
} catch (Exception e) {
    producer.abortTransaction();
}
```

## Kafka 性能调优实战

### 生产者调优

| 参数 | 默认值 | 优化建议 | 影响 |
|------|--------|----------|------|
| `batch.size` | 16KB | 64~256KB | 吞吐量 |
| `linger.ms` | 0 | 5~100ms | 延迟/吞吐 |
| `compression.type` | none | lz4/zstd | CPU/带宽 |
| `acks` | 1 | all | 可靠性 |
| `buffer.memory` | 32MB | 64~128MB | 写入能力 |

### 消费者调优

| 参数 | 默认值 | 优化建议 | 影响 |
|------|--------|----------|------|
| `fetch.min.bytes` | 1 | 1MB | 批量拉取 |
| `fetch.max.wait.ms` | 500 | 1000ms | 延迟 |
| `max.poll.records` | 500 | 1000~2000 | 处理量 |
| `session.timeout.ms` | 10s | 30s | 稳定性 |

### Broker 调优

```yaml
# Broker 配置优化
server:
  # 日志段大小
  log.segment.bytes: 1073741824  # 1GB
  
  # 日志保留策略
  log.retention.hours: 168  # 7天
  log.retention.bytes: -1  # 不限制
  
  # 副本配置
  default.replication.factor: 3
  min.insync.replicas: 2
  
  # 网络配置
  num.network.threads: 8
  num.io.threads: 16
```

## Kafka 生产问题排查指南

### 常见问题与解决方案

| 问题现象 | 可能原因 | 排查步骤 | 解决方案 |
|----------|----------|----------|----------|
| 消息丢失 | 副本不同步 | 检查 ISR | 增加副本数 |
| 消息重复 | 消费者重平衡 | 检查 offset | 幂等消费 |
| 消费延迟 | 消费能力不足 | 检查 lag | 增加消费者 |
| 磁盘写满 | 保留策略 | 检查日志 | 调整保留 |
| 连接数高 | 连接池配置 | 检查连接 | 调整配置 |

### 故障排查流程

```mermaid
flowchart TD
    A[发现问题] --> B{问题类型}
    B -->|消息丢失| C[检查副本同步]
    B -->|消息重复| D[检查消费者]
    B -->|消费延迟| E[检查消费能力]
    C --> F[查看 ISR 状态]
    D --> G[查看 offset]
    E --> H[查看 lag]
    F --> I[增加副本数]
    G --> J[优化消费逻辑]
    H --> K[增加消费者]
    I --> L[验证恢复]
    J --> L
    K --> L
```

### 监控关键指标

```yaml
# Prometheus 告警规则
groups:
  - name: kafka-alerts
    rules:
      - alert: Kafka_BrokerDown
        expr: kafka_server_brokertopicmetrics_messagesin_total == 0
        for: 1m
        labels:
          severity: P0
        annotations:
          summary: "Kafka Broker 宕机"
          
      - alert: Kafka_ConsumerLag
        expr: kafka_consumergroup_lag_sum > 1000000
        for: 5m
        labels:
          severity: P1
        annotations:
          summary: "Kafka 消费延迟"
          
      - alert: Kafka_PartitionUnderReplicated
        expr: kafka_server_replicamanager_underreplicatedpartitions > 0
        for: 5m
        labels:
          severity: P2
        annotations:
          summary: "Kafka 副本不同步"
```

## Kafka 架构设计最佳实践

### 集群架构设计

| 设计原则 | 说明 | 实践建议 |
|----------|------|----------|
| 高可用 | 多副本 | 3副本 |
| 水平扩展 | 增加 Broker | 动态扩容 |
| 负载均衡 | 分区均匀 | 分区策略 |
| 容灾 | 跨机架/跨机房 | 机架感知 |

### 应用架构集成

```text
应用架构模式：
  1. 直连模式
     - 应用直连 Kafka
     - 简单高效
     - 适合小规模

  2. 代理模式
     - 通过 Kafka Connect
     - 数据集成
     - 适合数据管道

  3. 流处理模式
     - Kafka Streams
     - 实时处理
     - 适合事件驱动
```

### 容灾架构设计

```mermaid
flowchart TD
    A[主集群] --> B[跨集群复制]
    B --> C[备集群]
    C --> D[故障切换]
    D --> E[流量切换]
    E --> F[数据恢复]
    
    subgraph 复制策略
        B -->|MirrorMaker| G[异步复制]
        B -->|Confluent Replicator| H[同步复制]
    end
```

## 与 Flink 的深度集成

| 集成场景 | 方案 | 说明 |
|----------|------|------|
| 实时数仓 | Flink SQL + Kafka | 流式 ETL |
| 事件驱动 | Kafka Events + Flink | 事件处理 |
| CDC 同步 | Debezium + Kafka + Flink | 实时同步 |
| 指标计算 | Kafka Metrics + Flink | 实时监控 |


## Kafka 生产问题排查与最佳实践

### 常见生产问题

| 问题类型 | 症状 | 根因 | 解决方案 |
|----------|------|------|----------|
| 消费延迟 | Consumer Lag 增大 | 消费能力不足 | 增加消费者，优化处理 |
| 分区不均 | 部分 Broker 负载高 | 分区分配不均 | 重平衡分区 |
| 消息丢失 | 消费者未收到消息 |acks配置不当 | 设置 acks=all |
| 消息重复 | 消费者重复消费 | 自动提交 offset | 手动提交 offset |
| Leader 选举慢 | 切换时间长 | ISR 过小 | 调整 ISR 参数 |
| 磁盘写满 | Broker 拒绝写入 | 日志保留过长 | 调整保留策略 |

### KRaft 模式配置

```properties
# KRaft 配置
process.roles=broker,controller
controller.quorum.voters=1@kafka1:9093,2@kafka2:9093,3@kafka3:9093
node.id=1
controller.listener.names=CONTROLLER
inter.broker.listener.name=PLAINTEXT
listeners=PLAINTEXT://:9092,CONTROLLER://:9093

# 性能调优
num.io.threads=8
num.network.threads=3
num.partitions=6
default.replication.factor=3
min.insync.replicas=2
log.retention.hours=168
log.segment.bytes=1073741824
```

### 性能调优参数

```properties
# Producer 调优
batch.size=65536
linger.ms=5
compression.type=lz4
acks=all
retries=2147483647
max.in.flight.requests.per.connection=5
buffer.memory=67108864

# Consumer 调优
fetch.min.bytes=1
fetch.max.wait.ms=500
max.partition.fetch.bytes=1048576
auto.offset.reset=latest
enable.auto.commit=false
max.poll.records=500
max.poll.interval.ms=300000
session.timeout.ms=10000
heartbeat.interval.ms=3000
```

### 监控告警配置

```yaml
# Kafka Prometheus 告警规则
groups:
  - name: kafka-alerts
    rules:
      - alert: Kafka_ConsumerLagHigh
        expr: kafka_consumer_group_lag > 10000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Kafka 消费者延迟过高"
      
      - alert: Kafka_BrokerDown
        expr: kafka_broker_status == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Kafka Broker 宕机"
      
      - alert: Kafka_DiskUsageHigh
        expr: kafka_log_disk_usage_bytes / kafka_log_disk_total_bytes > 0.85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Kafka 磁盘使用率高"
      
      - alert: Kafka_UnderReplicatedPartitions
        expr: kafka_server_replicamanager_underreplicatedpartitions > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Kafka 副本不足分区"
```

### 多租户隔离

```text
多租户隔离策略：
  1. 配额管理
     - 限流（byte-rate）
     - 限连接数
     - 限请求率

  2. 资源隔离
     - 独立 Broker
     - 独立 Topic
     - 独立 Consumer Group

  3. 安全隔离
     - ACL 权限
     - SASL 认证
     - SSL 加密

  4. 监控隔离
     - 独立监控指标
     - 独立告警规则
     - 独立 Dashboard
```

### 压缩与存储优化

| 压缩算法 | 压缩率 | CPU 开销 | 适用场景 |
|----------|--------|----------|----------|
| none | 1x | 无 | CPU 密集型 |
| gzip | 3-5x | 高 | 带宽受限 |
| snappy | 2-3x | 低 | 延迟敏感 |
| lz4 | 2-3x | 低 | 通用 |
| zstd | 3-5x | 中 | 平衡 |

### Flink 集成最佳实践

```java
// Flink Kafka Sink 配置
KafkaSink<String> sink = KafkaSink.<String>builder()
    .setBootstrapServers("kafka:9092")
    .setRecordSerializer(
        KafkaRecordSerializationSchema.builder()
            .setTopic("output-topic")
            .setValueSerializationSchema(new SimpleStringSchema())
            .build()
    )
    .setDeliveryGuarantee(DeliveryGuarantee.EXACTLY_ONCE)
    .setTransactionalIdPrefix("flink-kafka-")
    .setProperty("transaction.timeout.ms", "900000")
    .build();

// Flink Kafka Source 配置
KafkaSource<String> source = KafkaSource.<String>builder()
    .setBootstrapServers("kafka:9092")
    .setTopics("input-topic")
    .setGroupId("flink-consumer")
    .setStartingOffsets(OffsetsInitializer.latest())
    .setValueOnlyDeserializer(new SimpleStringSchema())
    .build();
```

### 安全配置

```properties
# SSL 加密
listeners=SASL_SSL://:9093
ssl.keystore.location=/path/to/kafka.server.keystore.jks
ssl.keystore.password=changeit
ssl.key.password=changeit
ssl.truststore.location=/path/to/kafka.server.truststore.jks
ssl.truststore.password=changeit

# SASL 认证
sasl.enabled.mechanisms=PLAIN
sasl.mechanism.inter.broker.protocol=PLAIN
security.inter.broker.protocol=SASL_SSL

# ACL 权限
authorizer.class.name=kafka.security.authorizer.AclAuthorizer
allow.everyone.if.no.acl.found=false
super.users=User:admin
```

### 备份与恢复

```text
Kafka 备份策略：
  1. Topic 配置备份
     - 备份 topic 配置
     - 备份 ACL 权限
     - 版本控制

  2. 数据备份
     - MirrorMaker 2 跨集群复制
     - 定期备份到 S3
     - 保留策略管理

  3. 恢复流程
     - 从备份恢复 topic
     - 从指定 offset 恢复
     - 数据一致性验证

  4. 灾难恢复
     - 跨区域复制
     - 故障切换
     - 数据校验
```


## 六、与其他板块的关系

- 和「**源码系列/Kafka源码**」：本篇讲架构、语义、生产实践；源码篇讲 offset 索引、副本同步、日志存储等实现细节。
- 和「**基础知识/MQ**」：MQ.md 收录 Kafka 的 Producer 流程、ISR/LEO/HW、清理策略等零散精华；本篇是体系化实用版。
- 和「**基础知识/中间件/ApachePulsar**」「**RabbitMQ**」「**RocketMQ**」：同属消息家族，选型见上文对比表。
- 和「**基础知识/中间件/数据同步CDC-Canal**」：Canal/Debezium 发 Kafka 是「binlog → 下游异构系统」的黄金链路。
- 和「**基础知识/大数据**」：Kafka 是大数据全链路（采集 → 数仓 → 实时计算）的传输底座。
- 和「**基础知识/分布式系统**」：Kafka 的副本/ISR/一致性语义是分布式理论的最佳实践样本。

---

## Kafka 副本放置策略与机架感知

### 副本放置原则

```
Kafka 副本放置 = 决定 Follower 副本落在哪个 Broker

默认策略：
  第一个副本：随机分配到 Broker（或指定 Leader）
  后续副本：依次分配到不同 Broker（轮询）
  约束：同一 Partition 的副本不在同一 Broker

机架感知（Rack Awareness）：
  每个 Broker 配置机架 ID
  → 副本尽量分布在不同机架
  → 机架故障时数据不丢

配置：
  broker.rack=/rack1  # broker.properties
```

### 机架感知配置

```properties
# broker.properties
broker.rack=/rack1

# 或通过环境变量
KAFKA_BROKER_RACK=/rack1
```

### 副本放置策略对比

| 策略 | 说明 | 适用 |
|------|------|------|
| 默认轮询 | 副本依次分配到不同 Broker | 无机架约束 |
| 机架感知 | 副本分布在不同机架 | 跨机房/跨 AZ |
| 同区域优先 | 副本优先同可用区 | 低延迟 |
| 跨区域 | 副本跨区域分布 | 高可用 |

> **口诀：副本放置 = "让数据住得分散"——默认轮询防单 Broker 故障，机架感知防单机架故障。**

---

## __consumer_offsets 内部机制

### 存储原理

```
__consumer_offsets = Kafka 内部 Topic（50 个分区，默认 __consumer_offsets）

存储内容：
  消费组的位移信息（offset）
  消费组的元数据（group metadata）

位移提交流程：
  Consumer 处理完消息 → 调用 commitSync/commitAsync
  → 发送位移到 __consumer_offsets
  → Broker 持久化

位移存储格式：
  Key: group_id + topic + partition
  Value: offset + metadata + timestamp

位移查找：
  1. Consumer 启动 → 向 Coordinator 发 JoinGroup
  2. Coordinator 找到 __consumer_offsets 中该组的位移
  3. 返回位移 → Consumer 从该位置开始消费
```

### 位移提交最佳实践

```java
// 手动提交位移（推荐）
consumer.commitSync();  // 同步提交（可靠）
consumer.commitAsync(); // 异步提交（快但可能失败）

// 按分区提交位移
Map<TopicPartition, OffsetAndMetadata> offsets = new HashMap<>();
for (ConsumerRecord<String, String> record : records) {
    offsets.put(
        new TopicPartition(record.topic(), record.partition()),
        new OffsetAndMetadata(record.offset() + 1)  // 下一条待消费
    );
}
consumer.commitSync(offsets);  // 按分区精确提交
```

| 提交方式 | 优点 | 缺点 | 适用 |
|----------|------|------|------|
| 自动提交 | 简单 | 可能丢数据 | 开发测试 |
| 同步提交 | 可靠 | 慢（等确认） | 生产推荐 |
| 异步提交 | 快 | 可能失败 | 高吞吐场景 |
| 按分区提交 | 精确 | 复杂 | 精确控制 |

> **口诀：__consumer_offsets = Kafka 的"记忆本"——记录每个消费组消费到哪了，手动提交位移是防丢数据的关键。**

---

## KIP-848 新消费者协议

### 协议变化

```
KIP-848 = 新版 Consumer Group 协议（Kafka 3.7+）

旧协议（Eager Rebalance）：
  所有 Consumer 停止消费 → Rebalance → 所有 Consumer 恢复
  问题：Rebalance 期间全组暂停，消费延迟

新协议（Cooperative Rebalance）：
  分步 Rebalance：只停止受影响的分区
  未受影响的分区继续消费
  优势：减少 Rebalance 影响范围

KIP-848 进一步改进：
  ① Incremental Rebalance：增量 Rebalance
  ② Static Membership 增强：实例重启不触发全组 Rebalance
  ③ 新的 GroupCoordinator：更好的分区分配
```

### 新旧协议对比

| 维度 | 旧协议 Eager | 新协议 Cooperative |
|------|-------------|-------------------|
| Rebalance 方式 | 全组暂停 | 增量（只停受影响分区） |
| 消费中断 | 全组暂停 | 仅受影响分区暂停 |
| 恢复速度 | 慢 | 快 |
| 兼容性 | 所有版本 | Kafka 3.7+ |

```properties
# 启用新协议
group.protocol=consumer  # 使用新协议
session.timeout.ms=45000  # 会话超时
heartbeat.interval.ms=3000 # 心跳间隔
```

> **口诀：KIP-848 = "增量 Rebalance"——只停受影响的分区继续消费，比全组暂停的旧协议影响小得多。**

---

## quota 限速配置（producer/consumer/fetch）

### Quota 类型

| Quota 类型 | 限速对象 | 参数 |
|-----------|---------|------|
| Producer Byte Rate | 生产者写入速率 | producer_byte_rate |
| Consumer Byte Rate | 消费者读取速率 | consumer_byte_rate |
| Request Percentage | 请求处理占比 | request_percentage |

### 配置示例

```bash
# 全局 Quota
kafka-configs.sh --alter --add-config 'producer_byte_rate=10485760' \
  --entity-type users --entity-default

# 按用户 Quota
kafka-configs.sh --alter --add-config 'producer_byte_rate=5242880,consumer_byte_rate=10485760' \
  --entity-type users --entity-name alice

# 按客户端 ID Quota
kafka-configs.sh --alter --add-config 'producer_byte_rate=10485760' \
  --entity-type clients --entity-name 'my-producer-*'

# 查看 Quota
kafka-configs.sh --describe --entity-type users --entity-name alice
```

### Quota 工作机制

```
Quota 超限处理：
  ① Broker 检测到请求超过 Quota
  ② 不立即拒绝（Kafka 选择延迟响应）
  ③ 延迟时间 = 超限量 / Quota
  ④ 客户端感知到延迟 → 自动降速

效果：
  不丢消息，只是变慢
  平滑限速，不会突然断连
```

| Quota 场景 | 建议值 | 说明 |
|-----------|--------|------|
| 生产者限速 | 10~50 MB/s | 防写满磁盘/带宽 |
| 消费者限速 | 50~200 MB/s | 防读满网卡/CPU |
| 全局限速 | 按集群容量 70% | 预留缓冲 |

> **口诀：Quota = "Kafka 的限速带"——超限不丢消息只是变慢，客户端自动降速，防止单个客户端打垮集群。**

---

## Kafka Raft metadata 主题与快照

### KRaft 元数据架构

```
KRaft 模式 = Kafka 自研 Raft 协议管理元数据

元数据主题：__cluster_metadata（单分区，多副本）
  存储：集群所有 Topic/Partition/Broker 元数据
  一致性：Raft 协议保证（Leader + Follower）

Controller Quorum：
  3~5 个 Controller 节点（奇数）
  Leader Controller 负责元数据变更
  Follower 同步元数据

快照（Snapshot）：
  定期将元数据状态压缩为快照
  新节点加入 → 从快照恢复 → 增量同步
  避免回放全量日志
```

### KRaft vs ZooKeeper 对比

| 维度 | ZooKeeper | KRaft |
|------|-----------|-------|
| 依赖 | 需单独部署 ZK 集群 | 内置 Raft |
| 性能 | 元数据操作受 ZK 限制 | 原生性能更好 |
| 分区上限 | ~200K 分区 | ~200 万分区 |
| 故障恢复 | ZK 选主慢 | Raft 选主快 |
| 运维 | 两套系统（ZK + Kafka） | 一套系统 |
| 成本 | ZK 集群额外资源 | 节省 ZK 资源 |

```bash
# KRaft 部署（单节点示例）
KAFKA_CLUSTER_ID=$(kafka-storage.sh random-uuid)
kafka-storage.sh format -t $KAFKA_CLUSTER_ID -c kraft-server.properties
kafka-server-start.sh kraft-server.properties
```

> **口诀：KRaft = "用 Raft 替代 ZK"——部署更简单，分区上限提升 10x，是 Kafka 未来的方向。**

---

## MirrorMaker2 跨集群拓扑设计

### 拓扑模式

```
MirrorMaker2（MM2）= Kafka 官方跨集群复制工具

模式一：双向复制（Active-Active）
  Cluster A ←→ MM2 ←→ Cluster B
  适用于：多活架构，两地三中心

模式二：中心辐射（Hub-Spoke）
  Cluster A → MM2 → Hub Cluster → MM2 → Cluster B
  适用于：集中处理，总部汇聚

模式三：链式复制
  Cluster A → MM2 → Cluster B → MM2 → Cluster C
  适用于：多级部署，边缘→区域→总部
```

### MM2 配置

```properties
# mm2.properties
clusters = us-east, us-west
us-east.bootstrap.servers = broker-us-east:9092
us-west.bootstrap.servers = broker-us-west:9092

us-east->us-west.enabled = true
us-west->us-east.enabled = true

us-east->us-west.topics = orders.*, users.*
us-west->us-east.topics = orders.*, users.*

# 复制策略
replication.factor = 3
sync.topic.configs.enabled = true
offset.lag.max = 1000

# 复制频率
emit.heartbeats.interval.seconds = 1
refresh.topics.interval.seconds = 300
```

### MM2 核心概念

| 概念 | 说明 |
|------|------|
| Source Cluster | 数据源集群 |
| Target Cluster | 数据目标集群 |
| Internal Topic | MM2 内部主题（__consumer_offsets, checkpoints） |
| Heartbeat Topic | 心跳主题（检测复制延迟） |
| Checkpoint Topic | 位移映射主题 |

```bash
# 启动 MM2
connect-mirror-maker mm2.properties

# 监控复制延迟
kafka-consumer-groups --bootstrap-server broker:9092 \
  --describe --group mm2-connect-cluster
```

> **口诀：MirrorMaker2 = "Kafka 的数据搬运工"——双向复制做多活，中心辐射做汇聚，关键是配好 topics 白名单和 offset 映射。**

## 六、与其他板块的关系（扩展）

| 项 | 结论 |
|----|------|
| 类型 | 分布式消息队列 / 流平台 |
| 核心 | Topic → Partition（日志段）→ Consumer Group |
| 吞吐 | 百万级 msg/s（分区并行 + 顺序写 + 零拷贝） |
| 语义 | at-least-once（默认）；幂等+事务可近似 exactly-once |
| 顺序 | 分区内有序（同 key 同分区） |
| 堆积 | 极强（磁盘 + 位移回放） |
| 元数据 | ZooKeeper（旧）/ KRaft（新，推荐） |
| 许可证 | Apache 2.0 |
| 一句话 | 「日志与流的事实标准」——高吞吐、可回放、生态最大 |

---

## 八、Kafka KRaft 模式（去 ZK）

### 8.1 KRaft 是什么

```
KRaft = Kafka 自研 Raft 协议，替代 ZooKeeper 管理元数据

旧架构：Broker + ZK（存储元数据/选 Controller）
新架构：Broker + KRaft Controller（Raft 共识）

优势：
  - 去掉 ZK 依赖（运维简化）
  - Controller 故障恢复更快
  - 支持更多分区（百万级）
  - 部署更简单
```

### 8.2 迁移建议

| 阶段 | 建议 |
|------|------|
| 新集群 | 直接用 KRaft（3.x+） |
| 存量集群 | 评估迁移成本（ZK→KRaft） |
| 稳定性 | KRaft 已 GA（3.3+），生产可用 |

---

## 九、Kafka 安全

### 9.1 认证

| 机制 | 说明 |
|------|------|
| SASL/PLAIN | 用户名密码（简单） |
| SASL/SCRAM | 挑战响应（更安全） |
| SASL/GSSAPI | Kerberos（企业级） |
| SSL/TLS | 证书认证 |

### 9.2 授权

```bash
# ACL 管理
kafka-acls.sh --add --allow-principal User:alice \
  --operation Read --topic orders --group my-consumer
```

### 9.3 加密

```
传输加密：SSL/TLS（broker 间 + 客户端间）
存储加密：磁盘加密（云盘加密/OS 级加密）
```

---

## 十、Kafka 分层存储（Tiered Storage）

### 10.1 背景与动机

传统 Kafka 的数据全部存储在 Broker 本地磁盘，成本高且扩展受限。分层存储将冷数据卸载到廉价的对象存储（S3、HDFS、Azure Blob），热数据保留在本地磁盘。

```mermaid
flowchart LR
    HOT[热数据 本地磁盘 SSD] -->|超过 retention| COLD[冷数据 对象存储 S3/HDFS]
    COLD -->|按需拉取| CONSUMER[消费者]
    HOT --> CONSUMER
```

### 10.2 核心原理

| 概念 | 说明 |
|------|------|
| Local Storage | Broker 本地磁盘，存放热数据 |
| Remote Storage | 对象存储/S3/HDFS，存放冷数据 |
| Tiered Storage Policy | 配置何时将数据从本地卸载到远程 |
| Fetch from Remote | 消费者读取冷数据时，Broker 从远程存储拉取并缓存 |

### 10.3 配置示例

```properties
# server.properties
remote.log.storage.manager.class.name=org.apache.kafka.server.log.remote.storage.RemoteLogManager
remote.log.storage.manager.class.path=
remote.log.metadata.manager.class.name=org.apache.kafka.server.log.remote.metadata.storage.TopicBasedRemoteLogMetadataManager
remote.log.retention.ms=604800000  # 7天后卸载到远程

# Topic 级别配置
kafka-configs.sh --alter --topic my-topic \
  --add-config remote.storage.enable=true,local.retention.ms=259200000
```

### 10.4 适用场景与限制

```
适用：
  - 日志/埋点保留时间长（30天+），但近期热数据比例低
  - 磁盘成本敏感，需要降本
  - 冷数据偶尔回溯查询

限制（截至 3.6.x）：
  - 生产者不支持直接写远程（需本地先写）
  - 消费者读冷数据有额外延迟（拉取+缓存）
  - 不支持 KRaft 模式完全兼容（需 ZK 模式）
  - 兼容性需验证，生产建议充分测试
```

---

## 十一、Kafka Exactly-Once 语义深度

### 11.1 三层 Exactly-Once 机制

```mermaid
flowchart TB
    L1[幂等 Producer] --> L2[事务 API]
    L2 --> L3[消费端幂等]
```

| 层次 | 机制 | 保证范围 |
|------|------|----------|
| 幂等 Producer | PID + 序列号去重 | 单分区、单会话不重复 |
| 事务 API | transactional.id + 原子提交 | 跨分区写 + 消费位移原子提交 |
| 消费端幂等 | 业务层去重 | 端到端不重复 |

### 11.2 事务 API 详解

```java
Properties props = new Properties();
props.put("transactional.id", "order-tx-001");  // 稳定事务 ID（跨重启不变）
props.put("enable.idempotence", "true");

KafkaProducer<String, String> producer = new KafkaProducer<>(props);
producer.initTransactions();

try {
    producer.beginTransaction();
    
    // 1. 从 input-topic 消费
    ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(100));
    for (ConsumerRecord<String, String> record : records) {
        // 2. 处理并写入 output-topic
        producer.send(new ProducerRecord<>("output-topic", record.key(), transform(record.value())));
    }
    
    // 3. 消费位移与产出原子提交
    producer.sendOffsetsToTransaction(
        currentOffsets(consumer), consumer.groupMetadata()
    );
    
    producer.commitTransaction();
} catch (Exception e) {
    producer.abortTransaction();
}
```

### 11.3 EOS 使用模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| at-most-once | 先提交位移再处理 | 允许丢数据 |
| at-least-once | 先处理再提交位移（默认） | 不允许丢数据，允许重复 |
| exactly-once | 幂等+事务+消费端幂等 | 端到端零重复 |

---

## 十二、Kafka Streams 状态存储

### 12.1 State Store 类型

| 类型 | 说明 | 适用场景 |
|------|------|----------|
| In-Memory | HashMap 存储，重启丢失 | 临时窗口聚合 |
| RocksDB | 嵌入式 KV 存储，持久化 | 大规模状态（推荐） |
| Custom Store | 自定义实现 | 特殊需求 |

### 12.2 原理

```
Kafka Streams 状态存储架构：

1. 每个 Store 对应一个内部 changelog topic
2. 写入 Store 时同步写 changelog（备份）
3. 重启时从 changelog 恢复状态
4. 默认开启 standby replicas（热备恢复更快）

配置：
  state.dir=/tmp/kafka-streams
  num.standby.replicas=1
  state.cleaner.enable=true
```

### 12.3 最佳实践

```
1. RocksDB 是默认且推荐，内存占用可控
2. 合理设置 cache.max.bytes.buffering（默认 10MB），减少写放大
3. 压缩开启：rocksdb.block.cache.size + rocksdb.compression.type=lz4
4. 监控：state-store-age-ms、changelog-bytes-consumed-rate
5. 恢复优化：standby replicas + 合理 repartition count
```

---

## 十三、Kafka Connect 单消息转换（SMT）

### 13.1 SMT 概念

SMT（Single Message Transform）在 Kafka Connect 中间层对消息做轻量转换，无需自定义 Converter。

### 13.2 常用 SMT

| SMT | 功能 | 示例 |
|-----|------|------|
| ReplaceField | 重命名/删除字段 | 移除密码字段 |
| InsertField | 插入固定字段 | 添加 source 标识 |
| MaskField | 字段脱敏 | 手机号掩码 |
| TimestampRouter | 按时间路由 topic | 按天分 topic |
| RegexRouter | 正则替换 topic 名 | 加前缀/后缀 |
| Flatten | 嵌套文档展平 | JSON 嵌套→平铺 |
| Cast | 字段类型转换 | string→int |

### 13.3 配置示例

```json
{
  "name": "jdbc-source",
  "config": {
    "connector.class": "io.confluent.connect.jdbc.JdbcSourceConnector",
    "transforms": "addTimestamp,maskPhone",
    "transforms.addTimestamp.type": "org.apache.kafka.connect.transforms.InsertField$Value",
    "transforms.addTimestamp.timestamp.field": "imported_at",
    "transforms.maskPhone.type": "org.apache.kafka.connect.transforms.MaskField$Value",
    "transforms.maskPhone.fields": "phone",
    "transforms.maskPhone.replacement": "138****0000"
  }
}
```

---

## 十四、Kafka 性能调优

### 14.1 Producer 调优

| 参数 | 默认值 | 建议值 | 说明 |
|------|--------|--------|------|
| `batch.size` | 16384 (16KB) | 32768~65536 | 批量大小越大吞吐越高，但延迟增加 |
| `linger.ms` | 0 | 5~100 | 等待攒批时间，0=立即发送 |
| `compression.type` | none | lz4/zstd | 压缩减少网络传输和磁盘占用 |
| `buffer.memory` | 33554432 (32MB) | 64MB~128MB | 生产端缓冲池 |
| `max.in.flight.requests.per.connection` | 5 | 5 | 并发请求数，幂等模式下可保持5 |
| `acks` | all | all | 可靠性，all是最高保障 |

### 14.2 Consumer 调优

| 参数 | 默认值 | 建议值 | 说明 |
|------|--------|--------|------|
| `fetch.min.bytes` | 1 | 1024~10240 | 减少空轮询 |
| `fetch.max.wait.ms` | 500 | 500~2000 | 等待足够数据再返回 |
| `max.poll.records` | 500 | 100~500 | 单次拉取条数 |
| `max.poll.interval.ms` | 300000 | 按业务调整 | 处理超时被踢出组 |
| `session.timeout.ms` | 45000 | 30000~45000 | 心跳超时 |

### 14.3 Broker 调优

```
# 吞吐优先
num.io.threads=16
num.network.threads=8
log.flush.interval.messages=10000
log.flush.interval.ms=1000

# 可靠性优先
num.replica.fetchers=4
replica.fetch.wait.max.ms=500
min.insync.replicas=2
```

---

## 十五、Kafka 监控指标

### 15.1 核心指标

| 指标 | 含义 | 告警阈值建议 |
|------|------|-------------|
| `UnderReplicatedPartitions` | 未同步分区数 | > 0 |
| `ActiveControllerCount` | 活跃 Controller 数 | ≠ 1 |
| `OfflinePartitionsCount` | 离线分区数 | > 0 |
| `RequestHandlerAvgIdlePercent` | 请求处理空闲率 | < 0.3 |
| `NetworkProcessorAvgIdlePercent` | 网络线程空闲率 | < 0.3 |
| `LogFlushRateAndLatency` | 日志刷盘延迟 | > 500ms |
| `ConsumerLag` | 消费者延迟 | 业务告警阈值 |

### 15.2 监控工具

```
1. JMX + Prometheus + Grafana：标准方案
   - kafka_exporter 采集 JMX 指标
   - Grafana Dashboard 4763（Kafka Overview）
   - Grafana Dashboard 7589（Kafka Consumer Groups）

2. Confluent Control Center：商业版全面监控
3. Burrow（LinkedIn）：消费者 Lag 监控
4. AKHQ（原 Kafdrop）：Web UI 管理界面
```

### 15.3 关键监控面板

```
集群面板：
  - Broker 数量与存活状态
  - 分区总数与 Leader 分布
  - Under Replicated 分区数

生产者面板：
  - 消息发送速率（msgs/s）
  - 请求延迟（produce request latency）
  - 批次大小分布

消费者面板：
  - 消费 Lag（各分区）
  - 消费速率
  - Rebalance 频率
```

---

## 十六、Kafka 安全深度配置

### 16.1 SASL 配置

```properties
# server.properties
listeners=SASL_PLAINTEXT://broker1:9092
security.inter.broker.protocol=SASL_PLAINTEXT
sasl.enabled.mechanisms=SCRAM-SHA-256
sasl.mechanism.inter.broker.protocol=SCRAM-SHA-256

# JAAS 配置
kafka_server_org.apache.kafka.common.security.scram.ScramLoginModule required
  username="admin"
  password="admin-secret";
```

### 16.2 ACL 精细控制

```bash
# 创建用户
kafka-configs.sh --alter --add-config 'SCRAM-SHA-256=[password=secret]' \
  --entity-type users --entity-name alice

# 授权
kafka-acls.sh --add --allow-principal User:alice \
  --operation Read --topic orders --group my-consumer-group

# 拒绝
kafka-acls.sh --add --deny-principal User:bob \
  --operation Write --topic orders

# 列出
kafka-acls.sh --list --topic orders
```

### 16.3 加密传输

```properties
# SSL/TLS 配置
listeners=SSL://broker1:9093
ssl.keystore.location=/var/kafka/ssl/kafka.server.keystore.jks
ssl.keystore.password=changeit
ssl.truststore.location=/var/kafka/ssl/kafka.server.truststore.jks
ssl.truststore.password=changeit
ssl.client.auth=required
ssl.enabled.protocols=TLSv1.2,TLSv1.3
ssl.cipher.suites=TLS_AES_256_GCM_SHA384,TLS_CHACHA20_POLY1305_SHA256
```

### 16.4 安全架构全景

```mermaid
flowchart TB
    PRODUCER[生产者] -->|SASL认证| BROKER[Broker]
    CONSUMER[消费者] -->|SASL认证| BROKER
    BROKER -->|SSL加密传输| BROKER2[Broker间通信]
    BROKER -->|ACL授权| TOPIC[Topic资源]
    ADMIN[管理员] -->|RBAC| CONFLUENT[Confluent Control Center]
```

---

## Rack Awareness 机架感知

```
机架感知配置：

  broker.rack=rack1    # 在 server.properties 中配置
  broker.rack=rack2

  复制策略：
    ├── rack1 → rack2 → rack3
    └── 每个分区副本跨 3 个不同 rack

  效果：
    ├── 单个 rack 宕机不影响数据可用性
    └── 跨 rack 带宽成本可控
```

```properties
# server.properties
broker.rack=/rack/zone1
# 或
broker.rack=us-east-1a
```

## Consumer Offsets 深度解析

```
Offset 提交流程：

  Consumer 消费消息
       │
       ├── 自动提交（enable.auto.commit=true）
       │     └── 定时提交当前 offset
       │
       └── 手动提交
             ├── commitSync（同步，可靠）
             └── commitAsync（异步，高性能）

  Offset 存储：
    └── __consumer_offsets（内部 topic）
    ├── key: group.id + topic + partition
    └── value: offset + metadata + timestamp

  重平衡触发条件：
    ├── consumer 加入/离开 group
    ├── topic 分区数变化
    ├── 订阅 topic 变化
    └── session.timeout 超时
```

```java
// 手动提交 offset
consumer.subscribe(Arrays.asList("topic"));
while (true) {
    ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(100));
    for (ConsumerRecord<String, String> record : records) {
        processRecord(record);
    }
    consumer.commitSync();
}

// 从指定 offset 开始消费
consumer.seek(new TopicPartition("topic", 0), 1000L);
```

## KRaft 模式与 ZooKeeper 移除

```
KRaft 架构（Kafka 3.3+ 生产可用）：

  旧架构：
    Broker ←→ ZooKeeper 集群（3/5 节点）

  新架构（KRaft）：
    Controller Quorum（3/5 节点）
         │
    ┌────┴────┐
    │ 元数据   │
    │ 日志     │
    │ 快照     │
    └─────────┘
         │
    Broker 节点（无状态）

  优势：
    ├── 无需 ZooKeeper 依赖
    ├── 元数据管理更快
    ├── 扩容更简单
    └── 支持更多分区（百万级）
```

```properties
# KRaft 模式配置
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@controller1:9093,2@controller2:9093,3@controller3:9093
listeners=PLAINTEXT://:9092,CONTROLLER://:9093
```

## MirrorMaker2 跨集群复制

```
MirrorMaker2 架构：

  源集群                     目标集群
  ┌──────────┐             ┌──────────┐
  │ Topic-A  │ ──MM2──→   │ Source-A  │
  │ Topic-B  │             │ Source-B  │
  │ Topic-C  │             │ Topic-C   │ (未复制)
  └──────────┘             └──────────┘

  配置要点：
    ├── source clusters
    ├── target cluster
    ├── topic prefix（源 topic 加前缀）
    ├── replication factor
    └── sync group offsets
```

```properties
# mm2.properties
clusters = source, target
source.bootstrap.servers = source-kafka:9092
target.bootstrap.servers = target-kafka:9092

source->target.enabled = true
source->target.topics = .*
source->target.replication.policy.class = org.apache.kafka.connect.mirror.IdentityReplicationPolicy
source->target.sync.group.offsets.enabled = true
source->target.emit.heartbeats.enabled = true
source->target.topics.exclude = __.*
```

| 配置项 | 说明 | 建议值 |
|--------|------|--------|
| `replication.factor` | 复制因子 | ≥ 3 |
| `sync.topic.configs.enabled` | 同步 topic 配置 | true |
| `emit.heartbeats.interval.seconds` | 心跳间隔 | 1 |
| `refresh.topics.interval.seconds` | 刷新 topic 间隔 | 600 |
| `offset.lag.max` | 最大 offset 延迟 | 100 |

## 十二、Kafka Replication与ISR机制详解

### 12.1 Replication核心概念

```text
Replication核心概念：

  副本角色：
    Leader：处理所有读写请求
    Follower：从Leader复制数据
    ISR：与Leader保持同步的副本集合

  关键指标：
    LEO（Log End Offset）：每个副本的日志结束偏移量
    HW（High Watermark）：所有ISR副本的最小LEO
    LSR（In-Sync Replicas）：与Leader同步的副本数

  同步机制：
    Follower拉取：Follower主动从Leader拉取数据
    ISR维护：动态维护ISR集合
    故障转移：Leader故障时从ISR中选举新Leader

  配置参数：
    replication.factor：副本因子（建议≥3）
    min.insync.replicas：最小同步副本数（建议≥2）
    unclean.leader.election.enable：是否允许非ISR成为Leader
```

### 12.2 ISR机制详解

```java
// ISR机制配置
Properties props = new Properties();
props.put("replication.factor", 3);  // 副本因子
props.put("min.insync.replicas", 2);  // 最小同步副本数
props.put("unclean.leader.election.enable", false);  // 禁止非ISR成为Leader

// ISR维护策略
props.put("replica.lag.time.max.ms", 30000);  // 副本延迟最大时间
props.put("replica.socket.timeout.ms", 30000);  // 副本Socket超时
props.put("replica.socket.receive.buffer.bytes", 1048576);  // 副本Socket缓冲区

// 生产者配置
props.put("acks", "all");  // 等待所有ISR确认
props.put("retries", 3);  // 重试次数
props.put("retry.backoff.ms", 1000);  // 重试间隔
```

### 12.3 ISR最佳实践

```text
ISR最佳实践：

  副本因子选择：
    生产环境：replication.factor=3
    关键业务：replication.factor=5
    测试环境：replication.factor=1

  最小同步副本数：
    min.insync.replicas=2：保证数据安全
    min.insync.replicas=1：保证可用性
    min.insync.replicas=replication.factor：最高数据安全

  故障处理策略：
    禁止非ISR成为Leader：unclean.leader.election.enable=false
    允许非ISR成为Leader：unclean.leader.election.enable=true（可用性优先）

  监控指标：
    ISR收缩/扩张次数
    副本延迟时间
    未同步副本数
```

## 十三、Kafka批量发送与压缩调优

### 13.1 批量发送配置

```java
// 批量发送配置
Properties props = new Properties();

// 批量配置
props.put("batch.size", 16384);  // 批量大小（字节）
props.put("linger.ms", 5);  // 等待时间（毫秒）
props.put("buffer.memory", 33554432);  // 缓冲区大小（32MB）
props.put("max.in.flight.requests.per.connection", 5);  // 最大请求数

// 压缩配置
props.put("compression.type", "snappy");  // 压缩类型
// 可选值：none, gzip, snappy, lz4, zstd

// 发送配置
props.put("acks", "all");
props.put("retries", 3);
props.put("retry.backoff.ms", 1000);

// 批量发送示例
Producer<String, String> producer = new KafkaProducer<>(props);
for (int i = 0; i < 1000; i++) {
    producer.send(new ProducerRecord<>("topic", "key" + i, "value" + i));
}
producer.flush();  // 手动刷新
```

### 13.2 压缩类型对比

| 压缩类型 | 压缩率 | CPU开销 | 适用场景 |
|----------|--------|---------|----------|
| none | 1:1 | 无 | 网络充足场景 |
| gzip | 高 | 高 | 存储受限场景 |
| snappy | 中 | 低 | 吞吐优先场景 |
| lz4 | 中 | 低 | 实时性要求高 |
| zstd | 高 | 中 | 平衡场景 |

### 13.3 批量调优最佳实践

```text
批量调优最佳实践：

  批量大小调整：
    小批量：batch.size=8192（延迟优先）
    中批量：batch.size=16384（平衡）
    大批量：batch.size=65536（吞吐优先）

  等待时间调整：
    低延迟：linger.ms=1
    平衡：linger.ms=5
    高吞吐：linger.ms=100

  压缩策略选择：
    CPU充足：gzip（高压缩率）
    CPU受限：snappy（低开销）
    平衡：zstd（压缩率与性能平衡）

  监控指标：
    batch-size-avg：平均批量大小
    batch-size-max：最大批量大小
    records-per-request-avg：平均每次请求记录数
```

## 十四、Kafka限流配置（Quotas）

### 14.1 Quota配置

```bash
# Quota配置命令
# 生产者限流（字节/秒）
kafka-configs.sh --alter --add-config 'producer_byte_rate=1048576' \
  --entity-type clients --entity-name my-producer

# 消费者限流（字节/秒）
kafka-configs.sh --alter --add-config 'consumer_byte_rate=2097152' \
  --entity-type clients --entity-name my-consumer

# 请求处理限流（请求/秒）
kafka-configs.sh --alter --add-config 'request_percentage=50' \
  --entity-type clients --entity-name my-client

# 查看Quota配置
kafka-configs.sh --describe --entity-type clients --entity-name my-producer
```

### 14.2 Quota类型详解

```text
Quota类型详解：

  producer_byte_rate：
    说明：生产者每秒发送的字节数
    配置：1048576 = 1MB/s
    监控：生产者发送速率

  consumer_byte_rate：
    说明：消费者每秒消费的字节数
    配置：2097152 = 2MB/s
    监控：消费者消费速率

  request_percentage：
    说明：请求处理时间百分比
    配置：50（50%时间处理请求）
    监控：请求处理延迟

  默认Quota：
    所有客户端：无限制
    特定客户端：根据配置限制
```

### 14.3 限流最佳实践

```text
限流最佳实践：

  限流策略：
    按客户端限流：每个客户端独立限制
    按用户限流：每个用户独立限制
    按Topic限流：每个Topic独立限制

  限流阈值：
    生产者：1MB/s（普通）/ 10MB/s（高性能）
    消费者：2MB/s（普通）/ 20MB/s（高性能）
    请求处理：50%（普通）/ 80%（高性能）

  监控告警：
    触发限流告警
    限流持续时间告警
    性能影响告警

  动态调整：
    根据负载动态调整阈值
    根据优先级调整阈值
    根据时间窗口调整阈值
```

## 十五、Kafka监控关键指标

### 15.1 JMX监控指标

```text
JMX监控指标：

  Broker指标：
    kafka.server:type=BrokerTopicMetrics
      MessagesInPerSec：每秒消息数
      BytesInPerSec：每秒接收字节数
      BytesOutPerSec：每秒发送字节数

    kafka.server:type=ReplicaManager
      UnderReplicatedPartitions：未同步分区数
      ISRShrinkRate：ISR收缩速率
      ISRExpandRate：ISR扩张速率

    kafka.controller:type=KafkaController
      ActiveControllerCount：活跃控制器数
      OfflinePartitionsCount：离线分区数

  Producer指标：
    kafka.producer:type=producer-metrics
      record-send-rate：记录发送速率
      batch-size-avg：平均批量大小
      record-error-rate：记录错误率

  Consumer指标：
    kafka.consumer:type=consumer-metrics
      records-consumed-rate：记录消费速率
      fetch-rate：获取速率
      bytes-consumed-rate：字节消费速率
```

### 15.2 Prometheus监控配置

```yaml
# Prometheus监控配置
# prometheus.yml
scrape_configs:
  - job_name: 'kafka'
    static_configs:
      - targets: ['kafka-broker:9404']
    metrics_path: '/metrics'
    scrape_interval: 15s

# Grafana Dashboard配置
# Dashboard ID: 7589（Kafka Overview）
# Dashboard ID: 16237（Kafka Exporter）
```

### 15.3 关键告警规则

```text
关键告警规则：

  Broker告警：
    UnderReplicatedPartitions > 0：告警
    OfflinePartitionsCount > 0：告警
    ActiveControllerCount != 1：告警

  生产者告警：
    record-error-rate > 1%：告警
    batch-size-avg < 8192：告警
    request-latency-avg > 1000ms：告警

  消费者告警：
    records-consumed-rate < 1000：告警
    fetch-rate < 100：告警
    lag > 10000：告警

  性能告警：
    CPU使用率 > 80%：告警
    内存使用率 > 80%：告警
    磁盘使用率 > 80%：告警
```

## 十六、Kafka跨数据中心复制

### 16.1 MirrorMaker 2配置

```bash
# MirrorMaker 2配置
# mm2.properties
clusters = dc1, dc2
dc1.bootstrap.servers = kafka-dc1:9092
dc2.bootstrap.servers = kafka-dc2:9092

# 复制配置
dc1->dc2.enabled = true
dc1->dc2.topics = .*
dc1->dc2.sync.topic.configs.enabled = true

# 同步配置
sync.group.offsets.enabled = true
sync.group.offsets.interval.seconds = 60
emit.heartbeats.enabled = true
emit.heartbeats.interval.seconds = 1
emit.checkpoints.enabled = true
emit.checkpoints.interval.seconds = 60
refresh.topics.interval.seconds = 600

# 复制策略
replication.policy.class = org.apache.kafka.connect.mirror.IdentityReplicationPolicy
```

### 16.2 跨数据中心复制策略

```text
跨数据中心复制策略：

  主备模式：
    DC1为主，DC2为备
    所有写操作在DC1
    DC2只读，用于灾备

  双活模式：
    DC1和DC2同时读写
    双向复制
    需要处理冲突

  多活模式：
    多个数据中心同时读写
    复杂的一致性保证
    需要冲突解决策略

  适用场景：
    主备模式：灾备恢复
    双活模式：就近访问
    多活模式：全球分布
```

### 16.3 跨数据中心最佳实践

```text
跨数据中心最佳实践：

  网络要求：
    带宽：≥1Gbps
    延迟：≤100ms
    可靠性：≥99.9%

  数据一致性：
    最终一致性：允许一定延迟
    强一致性：需要同步机制
    冲突解决：制定解决策略

  性能优化：
    批量复制：减少网络往返
    压缩传输：减少带宽使用
    并行复制：提高复制速度

  监控告警：
    复制延迟监控
    复制失败告警
    数据一致性监控
```

- 和「**源码系列/Kafka源码**」：本篇讲架构、语义、生产实践；源码篇讲 offset 索引、副本同步、日志存储等实现细节。
- 和「**基础知识/MQ**」：MQ.md 收录 Kafka 的 Producer 流程、ISR/LEO/HW、清理策略等零散精华；本篇是体系化实用版。
- 和「**基础知识/中间件/ApachePulsar**」「**RabbitMQ**」「**RocketMQ**」：同属消息家族，选型见上文对比表。
- 和「**基础知识/中间件/数据同步CDC-Canal**」：Canal/Debezium 发 Kafka 是「binlog → 下游异构系统」的黄金链路。
- 和「**基础知识/大数据**」：Kafka 是大数据全链路（采集 → 数仓 → 实时计算）的传输底座。
- 和「**基础知识/分布式系统**」：Kafka 的副本/ISR/一致性语义是分布式理论的最佳实践样本。
- 和「**基础知识/中间件/KafkaStreams与ksqlDB**」：Kafka Streams 是 Kafka 官方流处理库。

---

## 十一、速查表（扩展）

| 项 | 结论 |
|----|------|
| 类型 | 分布式消息队列 / 流平台 |
| 核心 | Topic → Partition（日志段）→ Consumer Group |
| 吞吐 | 百万级 msg/s（分区并行 + 顺序写 + 零拷贝） |
| 语义 | at-least-once（默认）；幂等+事务可近似 exactly-once |
| 顺序 | 分区内有序（同 key 同分区） |
| 堆积 | 极强（磁盘 + 位移回放） |
| 元数据 | ZooKeeper（旧）/ KRaft（新，推荐） |
| 安全 | SASL/SSL/ACL |
| 许可证 | Apache 2.0 |
| 一句话 | 「日志与流的事实标准」——高吞吐、可回放、生态最大 |
