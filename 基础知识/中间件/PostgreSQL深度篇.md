# PostgreSQL 深度篇（关系型数据库 / 开源最强关系库）

> PostgreSQL 是**开源最强关系型数据库**：支持 SQL 标准最完整、扩展性最强（自定义类型/函数/索引）、JSON 支持原生、地理空间（PostGIS）、全文搜索内置。相比 MySQL（简单但功能少），PostgreSQL 以「功能丰富 + 扩展性强 + 性能优越」成为复杂业务首选。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| MySQL 功能不足 | 窗口函数/CTE/全文搜索/JSON 支持弱 |
| 复杂查询 | 分析型查询（OLAP）性能差 |
| 扩展性 | 需要自定义数据类型/索引/函数 |
| 地理数据 | 需要地理空间查询（LBS/地图） |
| 多模型 | 关系+文档+图+时序 多模型需求 |

> 核心认知：**PostgreSQL = 开源数据库的「瑞士军刀」**——关系型为主，兼顾文档/地理/全文/时序/图。

---

## 二、PostgreSQL 核心原理

### 2.1 架构

```
PostgreSQL Server
  ├── Postmaster（主进程）
  │   ├── 监听连接
  │   ├──  fork 子进程（每个连接一个 Backend）
  │   └── 管理辅助进程
  ├── Backend（后端进程）
  │   ├── 解析 SQL → 解析树
  │   ├── 优化器（基于代价 CBO）→ 执行计划
  │   └── 执行器 → 返回结果
  ├── 共享内存
  │   ├── Shared Buffer（数据页缓存）
  │   ├── WAL Buffer（写前日志缓冲）
  │   └── Lock Table（锁表）
  └── 辅助进程
      ├── WAL Writer（WAL 写磁盘）
      ├── Checkpointer（检查点）
      ├── Autovacuum（自动清理死元组）
      ├── Background Writer（后台写脏页）
      ├── Stats Collector（统计信息收集）
      └── Logical Replication（逻辑复制）
```

### 2.2 MVCC（多版本并发控制）

- **原理**：不锁读，写操作创建新版本（元组），读操作根据事务快照读合适版本
- **实现**：每行带 `xmin`（创建事务ID）/ `xmax`（删除事务ID），快照判断可见性
- **Vacuum**：清理不再被任何事务可见的死元组（类似 Java GC）

**选型关注点**：MVCC 让 PG 读写不阻塞，但需定期 VACUUM 清理死元组（Autovacuum 自动执行）。

### 2.3 存储引擎

- **堆表（Heap Table）**：数据无序存储，索引指向 TID（页号+行号）
- **TOAST**：大字段（>2KB）自动压缩/行外存储
- **表空间**：数据文件分组管理

### 2.4 索引类型

| 索引类型 | 说明 | 适用场景 |
|----------|------|----------|
| B-Tree | 默认索引 | 等值/范围查询 |
| Hash | 哈希索引 | 等值查询（仅 WAL 恢复后可用） |
| GiST | 通用搜索树 | 地理/全文/几何 |
| GIN | 倒排索引 | JSON/数组/全文搜索 |
| BRIN | 块范围索引 | 时序/有序大数据（小体积） |
| SP-GiST | 空间分区树 | 电话路由/IP 路由 |
| Bloom | 布隆索引 | 多列联合过滤 |

**选型关注点**：JSON 查询 → GIN 索引；地理空间 → GiST + PostGIS；时序 → BRIN（体积小、性能好）。

### 2.5 查询优化器

- **基于代价（CBO）**：统计信息（`pg_statistic`）估算代价
- **连接策略**：Nested Loop / Hash Join / Merge Join
- **并行查询**：多核并行顺序扫描/哈希连接/聚合
- **JIT 编译**：表达式 JIT 编译加速（PG 11+）

**选型关注点**：定期 `ANALYZE` 更新统计信息（Autovacuum 自动执行），优化器才能选对执行计划。

---

## 三、PostgreSQL 核心特性

| 特性 | 说明 |
|------|------|
| SQL 标准 | 支持最完整（窗口函数/CTE/递归查询/LATERAL） |
| JSON | 原生 JSONB（二进制存储 + GIN 索引 + 丰富操作符） |
| 全文搜索 | 内置 tsvector/tsquery（无需 ES 的轻量搜索） |
| 地理空间 | PostGIS 扩展（地理空间事实标准） |
| 扩展性 | 自定义类型/函数/索引/操作符/聚合 |
| 分区表 | 声明式分区（范围/列表/哈希） |
| 逻辑复制 | 基于 WAL 的逻辑复制（跨版本/跨库） |
| 外数据包装器 | FD（Foreign Data Wrapper）查询外部数据源 |
| 事务 | ACID + 可串行化快照隔离（SSI） |
| 可靠性 | WAL + 流复制 + 自动故障转移（Patroni） |

---

## 四、PostgreSQL vs MySQL vs Oracle

| 维度 | PostgreSQL | MySQL | Oracle |
|------|------------|-------|--------|
| SQL 标准 | 最完整 | 部分 | 完整 |
| 窗口函数 | 完整 | 8.0+ 支持 | 完整 |
| CTE/递归 | 完整 | 8.0+ 支持 | 完整 |
| JSON | JSONB（强） | JSON（中） | JSON（强） |
| 全文搜索 | 内置 | 需 ES | Oracle Text |
| 地理空间 | PostGIS（最强） | 基础 | Spatial |
| 扩展性 | 极强 | 弱 | 强 |
| 分区表 | 声明式 | 5.7+ 支持 | 成熟 |
| 主从复制 | 流复制+逻辑复制 | binlog 复制 | Data Guard |
| 高可用 | Patroni/Repmgr | MHA/Group Replication | RAC/Data Guard |
| 成本 | 开源免费 | 开源免费 | 商业昂贵 |
| 性能 | 高 | 读快写中 | 最高 |
| 生态 | 丰富 | 最丰富 | 丰富 |

**选型关注点**：
- 复杂查询/分析/地理空间/全文搜索 → **PostgreSQL**
- 简单 OLTP/读多写少/MySQL 生态 → **MySQL**
- 金融级高可用/预算充足 → **Oracle**
- 云托管 → **Aurora（MySQL/PG 兼容）/ Cloud SQL / PolarDB**

---

## 五、PostgreSQL 扩展生态

| 扩展 | 说明 |
|------|------|
| PostGIS | 地理空间（事实标准） |
| TimescaleDB | 时序数据库（基于 PG 的时序扩展） |
| Citus | 分布式 PG（分片） |
| pg_partman | 自动分区管理 |
| pg_stat_statements | SQL 性能统计 |
| pg_trgm | 三元组模糊搜索 |
| pgvector | 向量检索（AI 嵌入） |
| zhparser/pg_jieba | 中文全文搜索 |
| pgpool-II | 连接池/负载均衡/读写分离 |

**选型关注点**：
- 时序数据 → TimescaleDB（PG 扩展，无需换数据库）
- 向量检索（AI） → pgvector
- 分布式 → Citus
- 中文全文搜索 → pg_jieba/zhparser

---

## 六、PostgreSQL 生产实践

### 6.1 关键配置

| 配置 | 建议 |
|------|------|
| shared_buffers | 25% 内存 |
| effective_cache_size | 75% 内存 |
| work_mem | 排序/哈希内存（按并发调整） |
| maintenance_work_mem | VACUUM/索引创建内存 |
| wal_level | replica（流复制） |
| max_connections | 合理设置（过多耗内存） |

### 6.2 高可用方案

| 方案 | 说明 |
|------|------|
| Patroni + etcd | 自动故障转移（推荐） |
| Repmgr | 复制管理器 |
| pgpool-II | 连接池 + 读写分离 |
| 流复制 | 主从异步/同步复制 |

### 6.3 备份

| 方式 | 说明 |
|------|------|
| pg_dump | 逻辑备份（SQL 导出） |
| pg_basebackup | 物理备份（全量） |
| WAL 归档 | 持续归档（PITR 时间点恢复） |
| pgBackRest | 专业备份工具 |

---

## 七、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 复杂查询/分析 | PostgreSQL | Oracle |
| 地理空间 | PostgreSQL + PostGIS | — |
| 全文搜索（轻量） | PostgreSQL 内置 | Elasticsearch |
| 时序数据 | TimescaleDB | TDengine/InfluxDB |
| 向量检索 | pgvector | Milvus |
| 分布式关系库 | Citus / TiDB | Spanner |
| 简单 OLTP | MySQL | PostgreSQL |
| 云托管 | Aurora / Cloud SQL / PolarDB | — |

---

## 八、与其他板块的关系

- MySQL 知识见「[基础知识/mysql知识](../mysql知识.md)」；
- 分库分表见「[分库分表 ShardingSphere](./分库分表ShardingSphere.md)」与「[分库分表板块](../../分库分表与数据迁移/)」；
- 时序数据库见「[时序库](../时序库/README.md)」；
- 云上数据库见「[云上数据库与缓存生态](./云上数据库与缓存生态.md)」。

> 一句话：**PostgreSQL = SQL 标准最完整 + JSONB + PostGIS + 扩展性极强；选型先看「功能需求（地理/全文/向量→PG）」，再定「规模（单机/Citus 分布式/TimescaleDB 时序）」，最后配「高可用（Patroni + 流复制）」**。
