# 大数据 · 06 分布式 NoSQL 与 HBase（LSM 机制 / RowKey 设计 / Region 管理 / 二级索引 / 选型决策）

> 当数据量超出单机关系库、又需要**低延迟随机读写 + 水平扩展**时，列式 NoSQL（HBase/Cassandra）登场。HBase 用 LSM 树 + 有序列式存储，在 HDFS 之上提供百亿级宽表的毫秒读写。本篇深入拆解 HBase 架构原理、RowKey 设计、二级索引、读写优化与 NoSQL 选型。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 单机数据库容量上限 | 百亿行宽表单机放不下 |
| 写放大 | 关系库随机写慢（B+Tree 索引） |
| 低延迟访问 | 海量数据按 key 毫秒读写 |
| 水平扩展 | 数据增长自动扩容 |
| 灵活 schema | 列可动态增减（稀疏） |

> 核心认知：**HBase = 「HDFS 之上的分布式宽表」**——用 LSM（Log-Structured Merge）把随机写转顺序写，用 RowKey 字典序组织数据实现高效点查/范围扫。

---

## 二、HBase 定位与数据模型

- **定位**：构建在 HDFS 之上的**分布式、列式、强一致** NoSQL，Google BigTable 开源实现。
- **适用**：写多读少、海量宽表、按 rowkey 点查/范围扫、近实时。不适合复杂 Join、事务跨行。
- **数据模型**：

```
表 → 行（RowKey，字典序） → 列族（CF） → 列（Qualifier） → 版本（Timestamp）

稀疏：空列不占空间
多版本：保留最近 N 版（TTL/最大版本数控制）
```

```mermaid
flowchart TB
    T[Table] --> R1[RowKey=r1]
    T --> R2[RowKey=r2]
    R1 --> CF1[列族 info: name/age]
    R1 --> CF2[列族 metrics: v1/v2]
```

---

## 三、架构

### 3.1 角色

| 角色 | 职责 | 高可用 |
|------|------|--------|
| HMaster | 元数据、Region 分配、负载均衡 | 主备 |
| RegionServer（RS） | 服务若干 Region，处理读写 | 多节点，故障 Region 迁移 |
| Region | 表水平切分单元（按 RowKey 范围） | 自动分裂/合并 |
| ZooKeeper | 集群协调、RS 存活、meta 位置 | 本身高可用 |
| HDFS | 底层持久化（StoreFile=HFile） | 多副本 |

### 3.2 寻址流程

```mermaid
flowchart LR
    C[Client] --> ZK[ZooKeeper: meta位置]
    C --> HM[HMaster]
    HM --> RS1[RegionServer]
    HM --> RS2[RegionServer]
    RS1 --> HDFS[(HDFS: HFile)]
    RS2 --> HDFS
```

```
Client 寻址（三级缓存优化）：
  1. ZK 拿到 -ROOT-/hbase:meta 位置
  2. meta 表记录 表→Region 分配
  3. 直接连 RS（客户端缓存 region 位置，避免每次查 meta）
  → 首次寻址后走缓存，毫秒级
```

---

## 四、LSM 读写路径（核心机制）

### 4.1 写流程（快，顺序追加）

```
1. 写 WAL（HLog）预写日志（持久化，防 RS 宕机丢数据）
2. 写 MemStore（内存有序结构：跳表/SkipList）
3. MemStore 满（默认 128MB）→ Flush 成 HFile 落 HDFS
4. HFile 累积 → Compaction
   minor：合并小文件（合并 StoreFile）
   major：全量合并，清理过期版本/删除标记

LSM 核心思想：
  随机写 → 内存顺序写 + 后台批量落盘
  读时多版本合并（MemStore + HFile）
  写吞吐远超 B+Tree 随机写
```

### 4.2 读流程

```
1. 查 BlockCache（读缓存，LRU）
2. 查 MemStore（内存最新数据）
3. 查 HFile（按时间倒序，用 Bloom Filter 快速判断 key 是否在某文件）
4. 合并多版本返回最新

读优化：
  Bloom Filter（ROW/ROWCOL）跳过不含 key 的文件
  BlockCache 缓存热块（DataBlock/IndexBlock/BloomBlock）
  列族隔离（减少跨 CF 扫描）
```

### 4.3 Compaction 详解

| 类型 | 触发 | 作用 | 注意 |
|------|------|------|------|
| minor | 文件数超阈值 | 合并小文件减少读放大 | 不清理过期数据 |
| major | 定时/手动/阈值 | 全量合并，删过期/删除标记 | 磁盘 IO 高峰 |
| flush | MemStore 满 | 落盘成 HFile | 触发时写暂停 |

```
重大坑：
  major compaction 才删过期/被删数据
  → 必须定时触发（否则 HDFS 膨胀）
  但 major 全量合并 IO 大 → 低峰期调度
```

---

## 五、RowKey 设计（最关键的工程决策）

> RowKey 决定分布、热点与查询效率，是 HBase 设计的"命门"。

| 原则 | 做法 | 反例 |
|------|------|------|
| 避免热点 | 加**加盐/哈希前缀**（`hash(userId)%10 + userId`）打散 | 纯时间戳/自增 ID（全写末台 Region） |
| 查询友好 | 最常用查询维度放前缀，利用字典序范围扫 | 随机维度前置 |
| 长度适中 | 8~20 字节，过长占用内存 | 超长字符串 |
| 多维度 | 组合键 `userId + ts` 支持范围查询 | 单一随机键 |

### 5.1 加盐（Salting）深入

```
加盐 = 在 RowKey 前缀加随机/哈希字节，打散写入

示例：
  不加盐：001 → 002 → ...（顺序递增，热点末台）
  加盐：a-001, c-002, b-003（随机前缀，分散到多 Region）

做法：
  salting = hash(userId) % N（N=Region 数）
  RowKey = salt + userId + orderId

权衡：
  打散写入（优）→ 牺牲范围扫（前缀不再是纯业务维度）
  查询时需知道 salt（或扫 N 个前缀）
```

### 5.2 查询维度设计

```
常见模式：
  1. 单维度点查：RowKey = userId（直接 get）
  2. 单维度范围：RowKey = userId + ts（按时间范围扫）
  3. 多维度组合：dim1_dim2_id（支持多维过滤）
  4. 反转时间：ts 反转（近期数据前缀小，冷热分离）

示例：订单查询按 userId 聚合
  → saltt=salt(userId) + userId + orderId
  兼顾打散与点查
```

### 5.3 反模式

| 反模式 | 后果 | 正解 |
|--------|------|------|
| 纯时间戳前缀 | 单 Region 热点 | 加盐/反转时间 |
| 递增 ID 前缀 | 写集中末台 | hash 打散 |
| 超长 RowKey | 内存/IO 浪费 | 8~20 字节 |
| 随机无查询维度 | 无法范围扫 | 组合查询维度前缀 |
| 单一维度 | join 难 | 多维组合 `dim1_dim2_id` |

---

## 六、Region 分裂与预分区

### 6.1 分裂（Split）

```
触发：Region 达 hbase.hregion.max.filesize（默认 10GB）
过程：按 RowKey 中值一分为二，HMaster 调度分配到不同 RS
作用：水平扩展（数据增长自动拆分）

热点分裂陷阱：
  RowKey 含时间戳 → 所有写入落末台 Region
  → 分裂也救不了 → 必须加盐打散
```

### 6.2 预分区（Pre-split）

```
目的：上线前预先切分，避免"先写一台、再分裂"的热点
做法：按业务分桶建表

示例：
  create 'orders', 'info', {SPLITS => ['u10','u20','u30','u40']}
  # 按 u10/u20/u30/u40 边界预切 5 个 Region
```

### 6.3 合并（Merge）

```
触发：Region 过小（删除大量数据后）
做法：管理员 merge_region 手动合并
作用：减少管理开销、均衡负载
```

---

## 七、二级索引方案

| 方案 | 原理 | 适用 |
|------|------|------|
| Phoenix | HBase 上建 SQL 层 + 全局/本地二级索引 | SQL 查询需求 |
| 协处理器 | Observer（拦截写构建索引）/Endpoint（聚合下推） | 服务端定制 |
| 外部索引 | 双写 ES/Solr 做全文与多维检索 | 复杂检索 |

```
Phoenix 二级索引：
  全局索引：索引表独立（读写放大）
  本地索引：与数据同 Region（快但本地）
  写主表时异步维护索引表 → 支持非 RowKey 列查询

权衡：
  索引加速读但拖慢写、占空间
  高写场景慎用全局索引
```

---

## 八、读写优化实战

| 优化点 | 做法 |
|--------|------|
| 写 | WAL 可选 `SKIP_WAL`（可丢数据时）、增大 `hbase.hregion.memstore.flush.size` |
| 写 | 批量 `Put` + 异步 WAL（`ASYNC_WAL`） |
| 读 | BlockCache 调大（读多）、BloomFilter=`ROW`/`ROWCOL` |
| 读 | 列族隔离、Scan 加 `caching`/`batch` |
| 压缩 | HFile 用 Snappy/ZSTD 降 IO |
| 合并 | 定时 major compaction，清理过期版本 |

```
经验：读多写少 → BlockCache 给 40%+；写多 → MemStore 给大、WAL 异步。

内存分配（hbase-env.sh）：
  HBASE_HEAPSIZE 堆大小
  hfile.block.cache.size（默认 40%）
  hbase.regionserver.global.memstore.size（默认 40%）
```

---

## 九、典型用法与踩坑

### 9.1 与大数据链路结合

```
实时链路：MySQL → Canal → Kafka → Flink → HBase（实时画像宽表）
离线链路：Hive 外表映射 HBase 做离线分析
```

### 9.2 踩坑清单

| 坑 | 说明 | 对策 |
|----|------|------|
| 热点 Region | RowKey 设计不当，某台 RS 被打爆 | 加盐/预分区 |
| Minor 不清理 | major 才删过期数据，HDFS 膨胀 | 定时 major |
| 小 Cell 过多 | 列太多压垮 MemStore/BlockCache | 控制列数 |
| ZK 压力大 | Region 数过多（上万）拖垮 ZK/HMaster | 控制 Region 总数 |
| 全表 Scan | 无 RowKey 过滤 → 全表扫 | 二级索引/范围扫 |
| RegionServer GC | 大对象/缓存配置不当 | 调内存分配 |

---

## 十、HBase vs 其他 NoSQL（选型决策）

| 组件 | 数据模型 | 强项 | 弱项 | 场景 |
|------|---------|------|------|------|
| HBase | 列式宽表 | 海量、强一致、按 key 毫秒读写 | 无 Join、运维重 | 画像/历史明细/时序 |
| Cassandra | 宽表（最终一致） | 多数据中心、写极高、易扩展 | 一致性弱、读复杂 | 海量写、跨机房 |
| Redis | KV/内存 | 微秒级、丰富结构 | 内存贵、容量有限 | 缓存/计数器 |
| MongoDB | 文档 | 灵活 schema、聚合 | 海量分析弱 | 业务文档/CMS |
| Elasticsearch | 倒排索引 | 全文检索/聚合 | 写成本较高 | 搜索/日志 |

### 10.1 HBase vs Cassandra 深度对比

| 维度 | HBase | Cassandra |
|------|-------|-----------|
| 一致性 | 强一致（单 master 行锁） | 最终一致（可调） |
| 架构 | 依赖 HDFS + ZK | 纯 P2P，无单点 |
| 多数据中心 | 弱 | **强**（跨 DC 复制） |
| 运维 | 重 | 轻 |
| 写吞吐 | 高 | **极高** |
| 读 | 按 key 毫秒 | 需调一致性级别 |
| 适用 | 单集群海量宽表 | 跨机房海量写 |

**选型**：强一致+已有 Hadoop → HBase；多活跨机房+极简运维 → Cassandra。

---

## 十一、NoSQL 选型决策树

```mermaid
flowchart TD
    A{需要什么能力?} -->|海量宽表+强一致| B[HBase]
    A -->|海量写+跨机房| C[Cassandra]
    A -->|内存KV+微秒| D[Redis]
    A -->|灵活文档| E[MongoDB]
    A -->|全文检索| F[Elasticsearch]
    A -->|图关系| G[Neo4j]
```

---

## 十二、设计 Checklist

- [ ] RowKey 必须防热点（加盐/哈希）+ 贴合查询（组合键）。
- [ ] 列族不宜多（1~3 个），避免跨 CF 读放大。
- [ ] 设合理 TTL 与最大版本数，防无限增长。
- [ ] 配置 BlockCache 与 MemStore 比例（读多/写多不同调优）。
- [ ] 规划预分区，避免上线后频繁分裂。
- [ ] 定时 major compaction，监控 Region 均衡与 RS GC。
- [ ] 大集群控制 Region 总数（避免 ZK 压力）。
- [ ] 二级索引按需（Phoenix/ES），权衡写放大。

---

## 十三、与其他板块的关系

- HDFS 基础见「[04-分布式存储与HDFS](04-分布式存储与HDFS.md)」；
- 宽列存储对比见「[中间件/Cassandra与宽列存储](../中间件/Cassandra与宽列存储.md)」；
- 列式存储格式见「[05-列式存储与数据湖格式](05-列式存储与数据湖格式.md)」；
- Redis 基础见「[redis知识](../redis知识.md)」、ES 见「[ES体系](../ES体系.md)」；
- 实时链路见「[11-实时数仓与湖仓一体](11-实时数仓与湖仓一体.md)」。

> 一句话：**HBase = HDFS 之上 LSM（WAL→MemStore→HFile→Compaction）+ RowKey 字典序 + Region 自动分裂——生产三守则：RowKey 防热点、列族精简、定时 major compaction；选型按能力分（强一致→HBase/跨机房→Cassandra/内存→Redis）**。