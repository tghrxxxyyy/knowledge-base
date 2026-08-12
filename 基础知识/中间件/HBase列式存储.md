# HBase（列式 NoSQL / 海量随机读写）

> HBase 是 Hadoop 生态的**列式 NoSQL 数据库**，基于 HDFS 实现海量数据的随机读写。相比 Cassandra（AP）、MongoDB（文档），HBase 以**强一致 + 列族存储 + 与 Hadoop 生态原生集成**成为大数据实时访问首选。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 海量数据随机读写 | MySQL 单表亿级性能骤降，需要水平扩展的随机读写 |
| 列稀疏 | 每行列数不同（如用户属性），关系库 NULL 浪费 |
| 与 Hadoop 集成 | 数据在 HDFS 上，需要实时访问而非离线批处理 |
| 强一致 | 金融/订单场景需要强一致读写 |

> 核心认知：**HBase = HDFS 上的 Bigtable**——列式存储 + LSM 树 + 强一致，适合海量随机读写。

---

## 二、HBase 核心原理

### 2.1 架构

```
Client → ZooKeeper（元数据/协调）
  ├── HMaster（主节点）
  │   ├── 元数据管理（Table/Region 分配）
  │   ├── RegionServer 负载均衡
  │   └── DDL 操作（建表/删表/修改列族）
  └── RegionServer（工作节点）
      ├── Region（表的分片，按 RowKey 范围切分）
      │   ├── MemStore（内存写缓冲）
      │   ├── StoreFile/HFile（磁盘文件，LSM 树）
      │   └── BlockCache（读缓存）
      ├── WAL（Write-Ahead Log，写前日志，防丢）
      └── Flush/Compaction（刷写/合并）
```

### 2.2 数据模型

- **表（Table）**：逻辑表
- **行（Row）**：由 RowKey 唯一标识
- **列族（Column Family）**：物理存储单元（列族单独存储，建议 1~3 个）
- **列限定符（Qualifier）**：列族下的具体列（动态添加）
- **时间戳（Timestamp）**：多版本（默认保留 3 版本）
- **单元格（Cell）**：`(RowKey, ColumnFamily:Qualifier, Timestamp) → Value`

**选型关注点**：列族设计是 HBase 核心——列族过多 → Flush/Compaction 压力大（建议 1~3 个）。

### 2.3 LSM 树（写优化）

```
写入 → WAL（防丢）→ MemStore（内存有序）
  → MemStore 满 → Flush 到 HFile（磁盘有序文件）
  → HFile 过多 → Compaction（合并小文件为大文件）
      ├── Minor Compaction（合并相邻小文件）
      └── Major Compaction（合并整个列族，清理删除/过期版本）
```

**选型关注点**：LSM 树写优化（顺序写），但读可能访问多个 HFile（需 BloomFilter + BlockCache 优化）。

### 2.4 读写流程

**写**：ZK → 找 RegionServer → 写 WAL → 写 MemStore → 返回成功
**读**：ZK → 找 RegionServer → BlockCache → MemStore → HFile（BloomFilter 过滤）→ 合并多版本返回

### 2.5 Region 分裂与负载均衡

- **分裂**：Region 大小超阈值（默认 10GB）→ 一分为二
- **负载均衡**：HMaster 自动将热点 Region 迁移到空闲 RegionServer
- **预分裂**：建表时预分配 Region（避免写入热点）

**选型关注点**：RowKey 设计避免热点（如时间戳开头 → 写热点在最新 Region），常用哈希/盐值打散。

---

## 三、HBase 特性

| 特性 | 说明 |
|------|------|
| 强一致 | 单行强一致（CP 系统） |
| 水平扩展 | Region 自动分裂，线性扩展 |
| 列稀疏 | 每行列数不同，NULL 不占空间 |
| 多版本 | 时间戳多版本（可配置保留数） |
| TTL | 自动过期（按列族/单元格） |
| 与 Hadoop 集成 | HDFS 存储、MapReduce/Spark 读写 |
| 协处理器 | Observer/Endpoint（类似存储过程） |
| 二级索引 | Phoenix（SQL on HBase） |

---

## 四、HBase vs Cassandra vs MongoDB vs TiDB

| 维度 | HBase | Cassandra | MongoDB | TiDB |
|------|-------|-----------|---------|------|
| 一致性 | 强一致（CP） | 最终一致（AP） | 可调 | 强一致（CP） |
| 数据模型 | 列式（Bigtable） | 宽列（Bigtable） | 文档（JSON） | 关系型（MySQL 协议） |
| 读写 | 随机读写 | 写优化 | 读写均衡 | 读写均衡 |
| SQL | 无（Phoenix 支持） | CQL（类 SQL） | 类 SQL | MySQL 协议 |
| 事务 | 单行事务 | 轻量级事务 | 多文档事务 | 分布式事务 |
| 生态 | Hadoop 生态 | 独立 | 独立 | 独立 |
| 延迟 | 毫秒 | 毫秒 | 毫秒 | 毫秒 |
| 吞吐 | 高 | 最高 | 高 | 高 |
| 适用 | 海量随机读写 | 写多读少/多数据中心 | 灵活 Schema | 分布式关系库 |

**选型关注点**：
- 海量随机读写 + Hadoop 生态 → **HBase**
- 写多读少 + 多数据中心 → **Cassandra**
- 灵活 Schema + 文档模型 → **MongoDB**
- 分布式关系库 + MySQL 兼容 → **TiDB**

---

## 五、HBase 生产实践

### 5.1 RowKey 设计原则

| 原则 | 说明 |
|------|------|
| 唯一性 | 唯一标识一行 |
| 散列性 | 避免热点（哈希/盐值/反转） |
| 长度 | 越短越好（建议 16~64 字节） |
| 有序性 | 有序存储（范围查询友好） |

### 5.2 常见设计

| 场景 | RowKey 设计 |
|------|-------------|
| 用户行为 | `hash(userId)_userId_timestamp` |
| 订单 | `hash(orderId)_orderId` |
| 时序数据 | `metric_hash(deviceId)_reverseTimestamp` |

### 5.3 调优

| 调优维度 | 建议 |
|----------|------|
| 内存 | MemStore 20~40%，BlockCache 20~40% |
| Compaction | 关闭自动 Major Compaction（低峰期手动触发） |
| BloomFilter | 开启（减少无效读） |
| 预分裂 | 建表时预分配 Region |
| 批量写 | Put 批量（Table.put(List<Put>)） |
| 批量查 | Scan 批量 + 设置合理 caching |

---

## 六、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 海量随机读写 + Hadoop | HBase | Cassandra |
| 写多读少 | Cassandra | HBase |
| 灵活 Schema | MongoDB | — |
| 分布式关系库 | TiDB | Spanner |
| 时序数据 | HBase/OpenTSDB | TDengine/InfluxDB |
| 二级索引 | Phoenix on HBase | ES |

---

## 七、与其他板块的关系

- 大数据存储见「[基础知识/大数据](../大数据/README.md)」；
- NoSQL 对比见「[MongoDB](./MongoDB.md)」；
- NewSQL 见「[TiDB 与 NewSQL](./TiDB与NewSQL.md)」；
- 时序数据库见「[时序库](../时序库/README.md)」；
- 云上数据库见「[云上数据库与缓存生态](./云上数据库与缓存生态.md)」。

> 一句话：**HBase = HDFS 上的 Bigtable + LSM 树写优化 + 列族存储 + 强一致；选型先看「生态（Hadoop→HBase，独立→Cassandra）」，再定「RowKey 设计（散列/有序/短）」，最后调「内存/Compaction/BloomFilter」**。
