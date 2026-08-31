# Kafka 核心源码要点

> 本文从源码与工程视角梳理 Kafka 的核心机制：整体架构、Producer 发送流程、Broker 存储（日志段/索引）、Consumer 拉取与位移、副本与 ISR、以及控制器选举。内容基于公开实现原理，具体类与参数以版本为准。

## 1. Kafka 的整体角色

- Producer：生产者，推送消息到 Topic 分区。
- Broker：服务节点，存储与服务分区数据。
- Consumer：消费者，从分区拉取消息。
- Consumer Group：组内竞争消费，组间广播。
- Controller：集群中的特殊 Broker，管理分区与副本状态。

## 2. Topic 与 Partition

- Topic 是逻辑概念，物理上分为多个 Partition。
- Partition 是并行与顺序单位。
- 单 Partition 内消息有序（按 offset）。
- 分区数决定最大并行度，设置后一般不变（变需重分配）。

## 3. Producer 发送流程

- 序列化 Key/Value。
- 计算分区（指定 key 则哈希，否则轮询/粘性的）。
- 写入缓冲区（batch），后台 sender 线程批量发。
- 批量、压缩（snappy/lz4/zstd）提升吞吐。
- 应答级别 ack：0（不等待）、1（leader 落盘）、-1/all（ISR 全落盘）。

```java
producer.send(new ProducerRecord<>("topic", key, value),
    (meta, ex) -> { /* 回调：是否成功、offset */ });
```

## 4. Broker 存储结构

- 每个 Partition 在磁盘上是一组 Segment（日志段）文件。
- 文件：.log（消息）、.index（位移索引）、.timeindex（时间索引）。
- 顺序追加写，极大提升磁盘吞吐。
- 分段滚动：达到大小或时间切新段，便于清理旧段。

## 5. 索引机制

- 位移索引：offset → 物理文件位置（稀疏索引，非每消息一条）。
- 时间索引：时间戳 → offset。
- 查找时二分定位段内位置，再顺序扫描少量消息。
- 稀疏索引平衡了空间与查找效率。

## 6. 零拷贝与高效读取

- 消费者读文件用 sendfile/transferTo，减少内核用户拷贝。
- 顺序读盘 + 页缓存，热数据在 page cache。
- 这是 Kafka 高吞吐的存储基础。

## 7. Consumer 拉取模型

- 消费者主动 poll() 拉取，而非 Broker 推送。
- 提交位移（offset）记录消费进度。
- 位移可存 ZooKeeper（老）/ Kafka 内部 topic（新）。
- 再均衡（Rebalance）：成员变化触发分区重新分配。

## 8. 消费语义

- 至少一次：可能重复（消费后提交前崩溃）。
- 至多一次：可能丢失（提交后消费前崩溃）。
- 精确一次：需幂等 Producer + 事务 + 消费变换写回（EOS）。
- 多数场景用"至少一次 + 消费幂等"。

## 9. 副本与 ISR

- 每个 Partition 有多个副本（Replica），一个 Leader 多个 Follower。
- ISR（In-Sync Replicas）：与 Leader 保持同步的副本集合。
- 写入需 ISR 确认（ack=all），保证不丢。
- Leader 故障时从 ISR 选新 Leader（优先副本）。

## 10. 控制器（Controller）

- 集群选一个 Broker 为 Controller，监听元数据变化。
- 负责：分区 Leader 选举、副本分配、扩缩容协调。
- 通过 ZooKeeper（或 KRaft 元数据层）选举与监听。
- Controller 故障，其余 Broker 重新选。

## 11. 再均衡（Rebalance）

- 触发：消费者加入/退出、订阅变更、心跳超时。
- 过程：暂停消费 → 重新分配分区 → 恢复。
- 期间消费暂停（stop-the-world），频繁再均衡影响吞吐。
- 优化：增量协作再均衡（Cooperative Rebalance）、合理 session/heartbeat 超时。

## 12. 消息格式与压缩

- 消息带 offset、时间戳、key、value、header。
- 批量压缩：整个 batch 压缩，更省空间。
- 压缩在 Producer 端，Broker 透传（除非需重建索引）。

## 13. 高可用设计

- 多副本跨 Broker/机架分布。
- ack=all + min.insync.replicas 保证写入不丢。
- 监控 Under-Replicated Partitions（副本不足）防丢。

## 14. 常见运维坑

- 分区过多：元数据与控制器压力大。
- 消费滞后（lag）不监控：消息堆积。
- 再均衡风暴：心跳/超时配置不当。
- unclean leader 选举：允许非 ISR 当 leader 会丢消息（应禁）。
- 磁盘满：日志清理策略（delete/compact）需配置。

## 15. 与流处理关系

- Kafka 是 Flink/Spark Streaming 的主要 source/sink。
- 精确一次靠 Kafka 事务 + 检查点配合。
- 见数据处理与 ETL 章节。

## 16. 生产者优化

- 批量大小与 linger.ms：平衡延迟与吞吐。
- 压缩：降网络与存储。
- 重试与幂等：enable.idempotence 去重。
- 异步 + 回调，不阻塞业务线程。

## 17. 消费者优化

- 拉取批次 max.poll.records 调优。
- 消费逻辑快，避免阻塞致再均衡。
- 手动提交 vs 自动提交：精确控制位移。
- 消费幂等应对重复。

## 18. 关键参数方向

- 副本因子：通常 3。
- min.insync.replicas：2（配合 ack=all）。
- retention：按业务保留时长/大小。
- num.partitions：按吞吐预估，预留扩展。
- 具体默认值以版本官方文档为准。

## 19. 与 RocketMQ 对比

- Kafka：吞吐与生态强，事务/顺序特定实现。
- RocketMQ：事务消息、顺序消息更贴国内业务（见消息队列选型章节）。
- 选哪个看场景（高吞吐日志流 vs 交易事务）。

## 20. 小结

Kafka 的高性能源于"分区顺序写 + 稀疏索引 + 零拷贝 + 批量压缩 + ISR 多副本"。掌握 Producer 批量、Broker 段存储、Consumer 拉取与再均衡、ISR 选主，即掌握其骨架。铁律：**ack=all 配 min.insync.replicas 防丢、消费幂等对重复、监控 lag 与副本不足、避免再均衡风暴、分区数适度**。它是流处理与日志管道的可靠底座。
