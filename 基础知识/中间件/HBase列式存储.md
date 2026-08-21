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
| 时序数据 | IoT/监控数据写入量大，需要高吞吐写入 |
| 多版本 | 需要保留历史版本（如审计/回溯） |

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
      │   ├── MemStore（内存写缓冲，每个列族一个）
      │   ├── StoreFile/HFile（磁盘文件，LSM 树）
      │   └── BlockCache（读缓存）
      ├── WAL（Write-Ahead Log，写前日志，防丢）
      └── Flush/Compaction（刷写/合并）
```

### 2.2 数据模型

```
Table（表）
  └── Row（行，由 RowKey 唯一标识）
       └── Column Family（列族，物理存储单元，建议 1~3 个）
            └── Column Qualifier（列限定符，动态添加）
                 └── Cell（单元格）
                      ├── Value（值）
                      ├── Timestamp（时间戳，多版本）
                      └── Type（Put/Delete）

Cell = (RowKey, CF:Qualifier, Timestamp) → Value
```

| 概念 | 说明 |
|------|------|
| 表（Table） | 逻辑表 |
| 行（Row） | 由 RowKey 唯一标识，按字典序排列 |
| 列族（Column Family） | 物理存储单元（列族单独存储，建议 1~3 个） |
| 列限定符（Qualifier） | 列族下的具体列（动态添加） |
| 时间戳（Timestamp） | 多版本（默认保留 3 版本） |
| 单元格（Cell） | `(RowKey, ColumnFamily:Qualifier, Timestamp) → Value` |

**选型关注点**：列族设计是 HBase 核心——列族过多 → Flush/Compaction 压力大（建议 1~3 个）。

### 2.3 LSM 树（写优化）

```
写入流程：
  Client → ZK → RegionServer
    → WAL（防丢）
    → MemStore（内存有序，按列族分离）
    → 返回成功

后台异步：
  MemStore 满 → Flush 到 HFile（磁盘有序文件）
  HFile 过多 → Compaction（合并小文件为大文件）
    ├── Minor Compaction（合并相邻小文件，保留所有版本）
    └── Major Compaction（合并整个列族，清理删除/过期版本）
```

**选型关注点**：LSM 树写优化（顺序写），但读可能访问多个 HFile（需 BloomFilter + BlockCache 优化）。

### 2.4 读写流程

| 操作 | 流程 |
|------|------|
| 写 | ZK → 找 RegionServer → 写 WAL → 写 MemStore → 返回成功 |
| 读 | ZK → 找 RegionServer → BlockCache → MemStore → HFile（BloomFilter 过滤）→ 合并多版本返回 |
| Scan | 类似读，但逐行扫描（支持 RowKey 范围/列族/时间戳过滤） |

### 2.5 Region 分裂与负载均衡

| 机制 | 说明 |
|------|------|
| 分裂 | Region 大小超阈值（默认 10GB）→ 一分为二 |
| 负载均衡 | HMaster 自动将热点 Region 迁移到空闲 RegionServer |
| 预分裂 | 建表时预分配 Region（避免写入热点） |
| 合并 | 空闲 Region 自动合并（减少 Region 数量） |

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
| 布隆过滤器 | BloomFilter（减少无效读） |
| 限流 | 读写限流（防热点） |

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

| 原则 | 说明 | 示例 |
|------|------|------|
| 唯一性 | 唯一标识一行 | — |
| 散列性 | 避免热点（哈希/盐值/反转） | `md5(userId)` |
| 长度 | 越短越好（建议 16~64 字节） | — |
| 有序性 | 有序存储（范围查询友好） | — |

### 5.2 常见设计

| 场景 | RowKey 设计 | 说明 |
|------|-------------|------|
| 用户行为 | `hash(userId)_userId_timestamp` | 哈希打散 + 时间范围 |
| 订单 | `hash(orderId)_orderId` | 哈希打散 |
| 时序数据 | `metric_hash(deviceId)_reverseTimestamp` | 倒序时间（最新在前） |
| 日志 | `hash(service)_reverseTimestamp` | 按服务哈希 + 时间倒序 |

### 5.3 调优

| 调优维度 | 建议 |
|----------|------|
| 内存 | MemStore 20~40%，BlockCache 20~40% |
| Compaction | 关闭自动 Major Compaction（低峰期手动触发） |
| BloomFilter | 开启（减少无效读） |
| 预分裂 | 建表时预分配 Region |
| 批量写 | Put 批量（Table.put(List<Put>)） |
| 批量查 | Scan 批量 + 设置合理 caching |
| 缓存 | BlockCache + LRU 缓存热点数据 |
| 并发 | 多线程并发读写（Connection 对象复用） |

### 5.4 常见坑

| 问题 | 原因 | 解决 |
|------|------|------|
| 写热点 | RowKey 有序（如时间戳开头） | 哈希/盐值打散 |
| 读放大 | HFile 过多 | 减少列族 + BloomFilter + Compaction |
| 写放大 | Minor Compaction 频繁 | 调整触发条件 |
| Region 过大 | 单 Region 数据量大 | 预分裂 + 调整阈值 |
| Full GC | 堆内存过大 | 调整 JVM 参数 + 拆分堆 |

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

---

## 六、HBase 生产配置清单

### 6.1 hbase-site.xml 关键配置

```xml
<!-- 内存配置 -->
<property>
  <name>hbase.regionserver.global.memstore.size</name>
  <value>0.4</value>
</property>
<property>
  <name>hfile.block.cache.size</name>
  <value>0.4</value>
</property>

<!-- Compaction 配置 -->
<property>
  <name>hbase.hstore.compactionThreshold</name>
  <value>3</value>
</property>
<property>
  <name>hbase.hstore.compaction.max</name>
  <value>10</value>
</property>

<!-- Region 配置 -->
<property>
  <name>hbase.hregion.max.filesize</name>
  <value>10737418240</value> <!-- 10GB -->
</property>
```

### 6.2 监控指标

```
关键监控：
  RegionServer 数量（健康状态）
  Region 数量（分布是否均匀）
  MemStore 大小（是否接近 flush 阈值）
  BlockCache 命中率（>80% 正常）
  Compaction 队列长度（是否积压）
  读写延迟（P99 < 10ms）
  GC 频率和时长
```

### 6.3 备份与恢复

| 方案 | 说明 |
|------|------|
| Snapshot | HBase 快照（秒级创建，不阻塞读写） |
| ExportTable | 导出到 HDFS（全量备份） |
| Replication | 跨集群复制（实时备份） |
| Restore | 从快照恢复（秒级） |

---

## 七、HBase Shell 常用命令

```bash
# 表管理
create 'table_name', {NAME => 'cf', VERSIONS => 3}
disable 'table_name'
drop 'table_name'
describe 'table_name'

# 数据操作
put 'table_name', 'rowkey', 'cf:qualifier', 'value'
get 'table_name', 'rowkey'
scan 'table_name', {STARTROW => 'rowkey1', STOPROW => 'rowkey2'}
delete 'table_name', 'rowkey', 'cf:qualifier'
deleteall 'table_name', 'rowkey'

# 管理操作
major_compact 'table_name'
flush 'table_name'
compact 'table_name'
balance_switch true
```

### 7.1 Phoenix SQL on HBase

```sql
-- 创建表
CREATE TABLE us_population (
  state CHAR(2) NOT NULL,
  city VARCHAR NOT NULL,
  population BIGINT,
  PRIMARY KEY (state, city)
);

-- 查询
SELECT * FROM us_population WHERE state = 'NY';

-- 二级索引
CREATE INDEX idx_population ON us_population (population DESC);
```

---

> 一句话：**HBase = HDFS 上的 Bigtable + LSM 树写优化 + 列族存储 + 强一致；选型先看「生态（Hadoop→HBase，独立→Cassandra）」，再定「RowKey 设计（散列/有序/短）」，最后调「内存/Compaction/BloomFilter」**。
