# Cassandra / ScyllaDB 与宽列存储（Dynamo 风格 NoSQL）

> Cassandra 是 **Dynamo（去中心化）风格**的分布式宽列 NoSQL：写性能极强、多数据中心原生、无单点。与 HBase（中心化 Master + HDFS）代表两条截然不同的分布式存储路线。本篇讲「解决的问题 → 数据模型与原理 → 一致性模型 → vs HBase → 选型」。

---

## 一、解决的问题与定位

**解决的问题**：需要「**极高写入吞吐 + 全球/多地容灾 + 无单点**」的大规模时间序列式数据（物联网遥测、用户事件流、消息、订单流水）——单点主从的 MySQL/Redis 撑不住，中心化的 HBase 有 Master 瓶颈。

**定位一句话**：**「Dynamo 系去中心化宽列数据库：P2P 环状无主节点，写任意节点即成功（可调一致性），多数据中心原生复制，写为主场景的事实标准。」**

典型场景：
- IoT 传感器/车联网海量时序写入；
- 用户行为事件流、点击流；
- 消息/收件箱（写扩散存储）；
- 订单/流水等「写多读单键」数据。

---

## 二、数据模型（宽列）

```
Keyspace(库) → Table(表) → Row(行, 由 Partition Key + 列组成)
Partition Key(分区键): 决定数据存哪节点(哈希分布)
Clustering Key(聚簇键): 行内排序
```

```
CREATE TABLE sensor_data (
  device_id  text,      -- Partition Key: 同一设备的数据聚合到同一分区
  ts         timestamp, -- Clustering Key: 分区内按时间排序
  value      double,
  PRIMARY KEY (device_id, ts)
);
```

- **查询模型受限**：必须按 Partition Key 查（单分区/等值），支持分区内范围——**不能随意二级索引/全表扫描**（这正是它写入快的原因：写入永远只写一个分区）；
- 宽行：一行可有数百万列（列是动态的，适合事件型数据）。

---

## 三、核心原理：Dynamo 架构

### 3.1 去中心化无主（vs HBase 中心化）

| 维度 | Cassandra（Dynamo 系） | HBase（中心化系） |
|------|------------------------|-------------------|
| 架构 | **P2P 环**，无 Master，任意节点可读写 | Master(HMaster) + RegionServer + HDFS |
| 写入 | 写任意节点 → 复制到 N 副本（客户端驱动） | 写 RegionServer → HLog + MemStore |
| 单点 | **无单点**（环上任一节点挂了自动协调） | HMaster 高可用但仍是中心 |
| 数据归属 | 哈希环分段（虚拟节点 vnode） | 按 Region 分片管理 |
| 依赖 | 无外部依赖（自身复制） | 依赖 HDFS/ZooKeeper |
| 一致性 | 可调（见下） | 强一致（ZAB/HBase 层面） |

### 3.2 一致性级别（可调一致性，核心概念）

```
写入: ANY < ONE < QUORUM < ALL
读取: ONE < QUORUM < ALL
```

- 复制因子 RF=3 时，`QUORUM` = 2 个节点确认；
- **读写 QUORUM 可读一致**（2 写 2 读无重叠冲突）：写 2/3 + 读 2/3 必有交集；
- 用 **Hinted Handoff（临时提示转发）+ 读修复（Read Repair）+ 反熵（Anti-Entropy）** 保证最终一致。

### 3.3 分区与复制

- 一致性哈希环 + 虚拟节点（vnode）：扩容只需把 vnode 迁走，**无需全量重分**（这是 vs 传统哈希取模/范围分片的最大优点——加节点不用全量 rehash）；
- 多数据中心：数据可复制到任意 DC（DC 内 QUORUM 本地优先，跨 DC 异步），原生多活。

---

## 四、ScyllaDB（Cassandra 兼容的性能版）

- **C++ 重写**（Cassandra 是 Java），SMP 无锁架构、每核一线程模型；
- 兼容 Cassandra 协议/数据模型，**延迟与吞吐数倍于 Cassandra**，内存管理稳定（无 Java GC 长暂停）；
- 选型：性能敏感 + 预算允许 → ScyllaDB；求生态/Java 栈 → Cassandra。

---

## 五、生产实践要点与坑

1. **分区键设计**（成败关键）：查询必须带分区键；热点分区（单设备海量数据）要加桶（bucket）拆分区；
2. **轻量事务（LWT）**：IF NOT EXISTS 走 Paxos，性能差 10 倍——只在关键写用；
3. **Compaction 选择**：时间序列用 TimeWindow Compaction（按窗口合并，写放大低）；
4. **全表扫/大聚合是反模式**：Cassandra 不适合 BI 分析——分析交给 Spark/Trino 连接器；
5. **Java GC 长暂停**：老版本踩坑多，注意堆外内存配置（现版本已改善）。

---

## 六、速查表

| 主题 | 一句话 |
|------|--------|
| 定位 | Dynamo 系宽列 NoSQL：写强、多活、无单点 |
| 数据模型 | Partition Key 定分区 + Clustering Key 排序，查询受限 |
| 一致性 | 可调（ONE/QUORUM/ALL）+ 最终一致修复机制 |
| 扩容 | 一致性哈希 + vnode，免全量 rehash |
| vs HBase | Cassandra 无主写快；HBase 中心化强一致、依赖 Hadoop |
| 升级版 | ScyllaDB：C++ 重写、协议兼容、性能数倍 |

---

## 七、与其他板块的关系

- 与「[HBase 列式存储](./HBase列式存储.md)」构成宽列两派对比；与「[MongoDB](./MongoDB.md)」（文档）「[Neo4j 图数据库](./Neo4j图数据库.md)」（图）对照 NoSQL 分类；
- 大数据写入链路见「[基础知识/大数据/06-分布式NoSQL与HBase](../大数据/06-分布式NoSQL与HBase.md)」；
- 云上对应见「[云上数据库与缓存生态](./云上数据库与缓存生态.md)」（AWS Keyspaces 托管 Cassandra、ScyllaDB Cloud）。

> 一句话：**Cassandra = 「写为王的去中心化宽列库」：无主环 + 可调一致性 + vnode 免重分 + 多数据中心原生；查询受限换写入极强——事件流、IoT、写扩散场景首选，分析查询交给数仓。**