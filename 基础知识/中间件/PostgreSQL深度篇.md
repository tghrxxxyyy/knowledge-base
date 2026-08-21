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

---

## 九、PostgreSQL 查询优化深度

### 9.1 EXPLAIN ANALYZE 详解

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM orders WHERE user_id = 123 AND status = 'paid';

-- 输出解读
-- Seq Scan on orders  (cost=0.00..1234.56 rows=10 width=128) (actual time=0.015..12.345 rows=10 loops=1)
--   Filter: (user_id = 123 AND status = 'paid')
--   Rows Removed by Filter: 99990
--   Buffers: shared hit=1000
-- Planning Time: 0.1 ms
-- Execution Time: 12.5 ms
```

| 指标 | 含义 |
|------|------|
| cost | 启动代价..总代价（估算） |
| rows | 估算返回行数 |
| actual time | 实际执行时间 |
| Buffers | 共享缓冲区命中/读取 |
| Rows Removed by Filter | 被过滤掉的行数 |

### 9.2 执行计划类型

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| Seq Scan | 全表顺序扫描 | 小表/无索引 |
| Index Scan | 索引扫描+回表 | 等值/范围查询 |
| Index Only Scan | 纯索引扫描（无需回表） | 覆盖索引 |
| Bitmap Index Scan | 位图索引扫描 | 多条件过滤 |
| Nested Loop | 嵌套循环连接 | 小结果集+索引 |
| Hash Join | 哈希连接 | 大结果集+等值连接 |
| Merge Join | 归并连接 | 已排序数据连接 |

### 9.3 统计信息与调优

```sql
-- 查看统计信息
SELECT * FROM pg_stats WHERE tablename = 'orders';

-- 手动更新统计
ANALYZE orders;

-- 调整统计采样精度
ALTER TABLE orders ALTER COLUMN user_id SET STATISTICS 1000;
```

---

## 十、PostgreSQL 分区表深度

### 10.1 声明式分区

```sql
-- 范围分区（按时间）
CREATE TABLE orders (
    id BIGSERIAL,
    user_id BIGINT,
    amount DECIMAL(10,2),
    created_at TIMESTAMPTZ
) PARTITION BY RANGE (created_at);

CREATE TABLE orders_2026_01 PARTITION OF orders
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE orders_2026_02 PARTITION OF orders
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- 列表分区（按地区）
CREATE TABLE users (
    id BIGSERIAL,
    name TEXT,
    region TEXT
) PARTITION BY LIST (region);

CREATE TABLE users_cn PARTITION OF users FOR VALUES IN ('中国');
CREATE TABLE users_us PARTITION OF users FOR VALUES IN ('美国');
```

### 10.2 分区裁剪（Partition Pruning）

```sql
-- 自动分区裁剪（只扫描相关分区）
EXPLAIN SELECT * FROM orders WHERE created_at >= '2026-02-01';
-- → 只扫描 orders_2026_02 分区

-- 手动设置
SET enable_partition_pruning = on;
```

### 10.3 自动分区管理

```sql
-- pg_partman 自动创建分区
CREATE EXTENSION pg_partman;
SELECT partman.create_parent('public.orders', 'created_at', 'native', 'monthly');
```

---

## 十一、PostgreSQL 逻辑复制与高可用

### 11.1 逻辑复制

```sql
-- 发布端
CREATE PUBLICATION my_pub FOR TABLE orders, users;

-- 订阅端
CREATE SUBSCRIPTION my_sub
    CONNECTION 'host=master dbname=mydb user=replicator'
    PUBLICATION my_pub;

-- 支持：跨版本/跨库/部分表复制
-- 不支持：DDL 复制
```

### 11.2 Patroni 高可用

```
Patroni + etcd/Consul
  ├── 自动故障检测
  ├── 自动主从切换
  ├── 配置管理
  └── 与 HAProxy/PgBouncer 集成

架构：
  etcd 集群 (3节点)
    ├── Leader 选举
    └── 配置存储

  PostgreSQL 集群
    ├── Primary (读写)
    ├── Standby1 (只读副本)
    └── Standby2 (只读副本)

  Patroni Agent (每个节点)
    ├── 监控 PostgreSQL 状态
    ├── 向 etcd 注册
    └── 执行切换
```

### 11.3 流复制 vs 逻辑复制

| 维度 | 流复制 | 逻辑复制 |
|------|--------|----------|
| 复制级别 | 整个实例 | 指定表 |
| 数据同步 | 物理 WAL 流 | 逻辑变更 |
| 跨版本 | 不支持 | 支持 |
| DDL | 复制 | 不复制 |
| 用途 | 高可用/灾备 | 跨库同步/升级 |

---

## 十二、PostgreSQL 扩展深度

### 12.1 TimescaleDB（时序扩展）

```sql
-- 创建超表（自动分区）
CREATE EXTENSION timescaledb;
SELECT create_hypertable('sensor_data', 'time');

-- 自动压缩
ALTER TABLE sensor_data SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id'
);

-- 连续聚合
CREATE MATERIALIZED VIEW hourly_stats WITH (timescaledb.continuous) AS
SELECT time_bucket('1 hour', time) AS bucket, device_id, AVG(value)
FROM sensor_data GROUP BY bucket, device_id;
```

### 12.2 Citus（分布式扩展）

```sql
-- 创建分布式表
CREATE EXTENSION citus;
SELECT create_distributed_table('orders', 'user_id');

-- 创建引用表（小表广播到所有节点）
SELECT create_reference_table('regions');
```

### 12.3 pgvector（向量检索）

```sql
CREATE EXTENSION vector;

-- 创建向量列
ALTER TABLE products ADD COLUMN embedding vector(1536);

-- 创建 HNSW 索引
CREATE INDEX ON products USING hnsw (embedding vector_cosine_ops);

-- 语义搜索
SELECT * FROM products
ORDER BY embedding <=> '[0.1, 0.2, ..., 0.1536]'
LIMIT 10;
```

---

## 十三、PostgreSQL 常见坑与最佳实践

| 坑 | 表现 | 解法 |
|----|------|------|
| 事务 ID 回卷 | 长事务导致 XID wraparound | 定期 VACUUM + 监控 XID |
| 死元组膨胀 | 未清理的旧版本占用空间 | Autovacuum + 手动 VACUUM |
| 连接数耗尽 | max_connections 过大 | 连接池（PgBouncer） |
| 长事务锁表 | 长事务持有锁 | 设置 statement_timeout |
| 分区表维护 | 忘记创建新分区 | pg_partman 自动管理 |
| WAL 日志堆积 | 复制槽未清理 | 监控复制延迟 + 删除无用槽 |
| 统计信息过时 | 优化器选错执行计划 | 定期 ANALYZE |
| 大表索引创建 | 长时间锁表 | CREATE INDEX CONCURRENTLY |

---

## 十四、与其他板块的关系（扩展）

- MySQL 知识见「[基础知识/mysql知识](../mysql知识.md)」；
- 分库分表见「[分库分表 ShardingSphere](./分库分表ShardingSphere.md)」与「[分库分表板块](../../分库分表与数据迁移/)」；
- 时序数据库见「[时序库](../时序库/README.md)」；
- 云上数据库见「[云上数据库与缓存生态](./云上数据库与缓存生态.md)」；
- 高可用方案见「[云原生/高可用架构](../../云原生/高可用架构.md)」；
- 对比 MySQL 见「[MySQL 知识](../mysql知识.md)」。

---

## 十五、速查表（扩展）

| 项 | 结论 |
|----|------|
| 类型 | 开源最强关系型数据库 |
| SQL 标准 | 支持最完整 |
| 核心特性 | JSONB / PostGIS / 全文搜索 / 扩展性 |
| MVCC | 多版本并发控制（读写不阻塞） |
| 索引 | B-Tree / GiST / GIN / BRIN / Hash |
| 分区 | 声明式分区（范围/列表/哈希） |
| 高可用 | Patroni + etcd + 流复制 |
| 备份 | pg_dump / pg_basebackup / WAL 归档 / pgBackRest |
| 扩展 | TimescaleDB / Citus / pgvector / PostGIS |
| 云托管 | Aurora / Cloud SQL / PolarDB |
| 一句话 | 「开源数据库的瑞士军刀——功能最全、扩展最强」 |
