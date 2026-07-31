# Kafka 源码精读

## 〇、本体介绍

**Kafka** 是高吞吐分布式流平台：producer → broker（topic/partition） → consumer group。源码设计核心是**顺序写盘、零拷贝、批量、页缓存**，把磁盘当「带索引的顺序日志」用，反而极快。

**为什么读源码**：理解「为什么能扛百万 TPS」「ISR 怎么保不丢不重复」「消费组再平衡」「积压怎么来」——这些都是消息中间件面试与线上排障的核心。

**核心概念**：topic / partition（有序日志）、replica（leader/follower）、ISR（In-Sync Replicas）、offset、consumer group、HW（High Watermark）/ LEO（Log End Offset）。

---

## 一、整体架构与文件存储

- **Topic = 多 Partition**，Partition 是**只追加的有序日志**，分布在各 broker。
- **分段存储**：每个 partition 目录下按 `log segment`（默认 1GB）切分，配 `.index`（位移索引）/ `.timeindex`（时间索引），用**二分 + 稀疏索引**快速定位消息。
- **顺序写 + 页缓存**：producer 顺序追加，OS page cache 吸收写；broker 几乎不自己管缓存，借 OS。

---

## 二、零拷贝（sendfile）

- 消费时 broker 把日志从磁盘发到网络：传统 read+write 要 4 次拷贝；Kafka 用 **`sendfile`/`transferTo`（零拷贝）**，数据在内核态直接从文件到 socket，省 2 次拷贝与上下文切换，**Netty/中间件通用技巧**（见 网络 / Netty 文档）。

---

## 三、副本与 ISR（高可用核心）

- 每 partition 有 1 个 **leader**（处理读写） + 多个 **follower**（从 leader 拉取同步）。
- **ISR**：「与 leader 保持同步（差距在 replica.lag.time.max.ms 内）」的副本集合。只有 ISR 内的副本有资格被选举为新 leader。
- **ACK 与可靠性**：`acks=0`（不等，可能丢）、`acks=1`（leader 写就回，leader 挂可能丢）、`acks=all`（ISR 全写才回，最稳，配合 min.insync.replicas）。
- **HW / LEO**：LEO 是每个副本日志末端；HW 是「ISR 都复制到的位置」，consumer 只能读到 HW 之前——保证故障切换后不读到未同步数据（避免消息丢失/回退）。
- **Leader Epoch**（0.11+）：用 epoch 替代 HW 防「数据丢失/截断」边界问题（之前靠 HW 在极端情况会丢/重）。

---

## 四、Producer：批量与压缩

- **批量发送**（linger.ms + batch.size）：攒一批再发，摊薄网络与请求开销，吞吐关键。
- **压缩**（snappy/gzip/lz4/zstd）：减少网络与磁盘。
- **幂等 Producer**（`enable.idempotence`）：PID + 序列号，broker 去重，解决单分区**重试导致的重复**（非跨分区/跨会话）。
- **事务**：`transactional.id` 实现「精确一次（EOS）」跨分区写入。

---

## 五、Consumer Group 与再平衡

- **消费模型**：group 内多 consumer 按 partition 分配；**一个 partition 同一时刻只被组内一个 consumer 消费**（保证顺序）。
- **offset 提交**：存 `__consumer_offsets` topic；自动/手动提交，手动更可控防重复/丢失。
- **Rebalance（再平衡）**：成员变化/订阅变更时重新分配 partition。老协议（stop-the-world，全组暂停）；新 **Cooperative Sticky**（增量、尽量不动）。
- **消费积压**：partition 数少 / 消费慢 / rebalance 频繁 → lag 涨；扩容 consumer（≤ partition 数）、优化处理逻辑。

---

## 六、Controller 与元数据

- 集群选一个 broker 为 **Controller**，负责 partition leader 选举、副本分配、通知；借助 ZooKeeper（旧）/ KRaft（新，去 ZK，自带元数据 quorum）。

---

## 七、与其他板块的关系

- **中间件 / MQ**：Kafka 是消息队列一员，与 RabbitMQ/Pulsar/RocketMQ 对比（见 基础知识/中间件）。
- **源码系列 / RocketMQ**：同为 MQ，副本/事务/消费模型对比。
- **网络 / Netty**：零拷贝、IO 多路复用思想通用。
- **基础知识 / 大数据**：Flink/Spark 常以 Kafka 为源（见 大数据/08-Flink）。

---

## 八、速查表

| 概念 | 作用 |
|------|------|
| Partition | 并行单位、有序日志 |
| ISR | 同步副本集，选举资格 |
| acks=all | 不丢（最稳） |
| HW/LEO | 可见位点、防回退 |
| sendfile | 零拷贝发消息 |
| Rebalance | 消费组重分配 |

---

## 面试高频问题（20+ 条）

1. **Kafka 为什么高吞吐？** 顺序写盘、页缓存、零拷贝、批量、压缩。
2. **为什么顺序写比随机写快？** 顺序 IO 贴近磁盘最优、减寻道；OS 预读/缓存友好。
3. **零拷贝是什么、Kafka 怎么用？** sendfile/transferTo 内核态直传，省拷贝与切换。
4. **topic/partition 关系？** topic 逻辑主题，partition 是并行有序日志，分布各 broker。
5. **partition 内有序吗？** 同一 partition 内按 append 有序；跨 partition 不保证。
6. **ISR 是什么？** 与 leader 同步的副本集合，才有资格当选新 leader。
7. **acks 三个值区别？** 0 不确认(快易丢)、1 leader 写回、all ISR 全写(稳)。
8. **HW 和 LEO？** LEO 副本末端；HW 是 ISR 同步到的可见位点，consumer 只读 HW 前。
9. **为什么用 HW 不直接用 LEO？** 防故障切换后读到未同步数据（丢/回退）。
10. **Leader Epoch 解决什么？** 替代 HW 修复极端下数据丢失/截断边界问题。
11. **Producer 怎么保不重复？** 幂等（PID+序列号去重）+ 事务（EOS 精确一次）。
12. **幂等 Producer 局限？** 单分区、单会话；跨分区/重启需用事务。
13. **消费组怎么分配 partition？** 组内按策略分配，一 partition 同时只被一个 consumer 消费。
14. **offset 存在哪？** __consumer_offsets 内部 topic。
15. **Rebalance 是什么、影响？** 成员/订阅变时重分配，老协议全组暂停；用 Cooperative 增量。
16. **消费积压怎么处理？** 扩 consumer(≤partition数)、优化逻辑、加 partition。
17. **为什么 consumer 数不能超 partition 数？** 多出的 consumer 分不到 partition，闲置。
18. **Kafka 怎么保证不丢消息？** acks=all + min.insync.replicas +  producer 重试 + 消费者手动提交。
19. **Kafka 怎么保证不重复消费？** 幂等 producer + 消费端幂等（业务去重/事务）。
20. **Controller 作用？** 选 leader、副本分配、通知；旧靠 ZK，新 KRaft 去 ZK。
21. **Kafka 和 RabbitMQ 区别？** Kafka 高吞吐日志流、持久、消费组；RabbitMQ 低延迟路由、复杂 Exchange。
22. **Kafka 和 Pulsar 区别？** Kafka 存算耦合；Pulsar 分层（BookKeeper 存、Broker 算），见 Pulsar 文档。
