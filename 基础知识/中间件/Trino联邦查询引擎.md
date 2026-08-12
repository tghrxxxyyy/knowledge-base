# Trino（Presto）联邦查询引擎

> Trino（原 PrestoSQL）是**多源联邦 SQL 查询引擎**：一条 SQL 同时查 MySQL + Hive + Kafka + 对象存储 + 云数仓，不需要把数据搬到一起。它是「数据湖查询层」和「异构数据联邦」的事实标准。本篇讲「解决的问题 → 原理 → 特性 → 与 Spark/Hive/ClickHouse 对比 → 选型」。

---

## 一、解决的问题与定位

**解决的问题**：
1. 数据分散在多个系统（业务库、数仓、湖、日志），分析要搬数据、建管道，周期长；
2. Hive/Spark 查询重、分钟级，交互式分析（BI 临时查）需要秒级；
3. 数据湖（对象存储上 Parquet/ORC）缺一个「直接 SQL 查询」的引擎。

**定位一句话**：**「不存数据、只算数据」的分布式 SQL 引擎——连接器（Connector）模式对接 N 种数据源，SQL 下推与跨源 Join，查询完成后数据不留存（无状态）。**

典型场景：
- **湖仓查询层**：S3/OSS/数据湖 parquet 文件直接 SQL（替代 Hive 的轻量选择）；
- **联邦查询**：一张报表同时取 MySQL 业务数据 + ClickHouse 指标 + 日志；
- **BI 后端**：Tableau/Superset 接 Trino 查多维数据；
- **临时分析**：数仓不建的场景，分析师直接查原始数据。

---

## 二、核心原理

### 2.1 Coordinator + Worker 架构

```
Coordinator: 解析 SQL → 生成分布式执行计划 → 调度给 Worker
Worker 并行执行 Task；数据按分区(partition)分片
```

- **Coordinator**：无状态（可多活），只做解析/优化/调度；
- **Worker**：执行计算，可无限水平扩展（加 Worker = 加并发）；
- **无状态 + 弹性**：查询结束即释放，不存用户数据——扩缩容极其容易（这是与「数仓/MPP」本质区别）。

### 2.2 连接器（Connector）体系

| 连接器 | 数据源 | 关键点 |
|--------|--------|--------|
| Hive/Iceberg/Delta Lake | 数据湖表格式 | 元数据从 HMS/Catalog 读，数据直接扫对象存储 |
| JDBC 类 | MySQL/PG/Doris/ClickHouse… | 谓词下推（过滤条件下压）减少传输 |
| Kafka | 实时流 | 可当实时表查（低延迟小批） |
| 对象存储+File | S3/OSS 上 JSON/CSV/Parquet | 无目录表也行（Raw Query） |
| 云数仓 | Redshift/BigQuery/Snowflake | 跨云联邦（Connector 全） |

### 2.3 下推与跨源优化

- **谓词下推**：`WHERE` 条件尽量压到源端执行（如只拉 MySQL 符合条件的数据），而不是全量拉内存；
- **跨源 Join**：小表广播、大表分区分发，数据不落盘（内存 shuffle）；
- **列裁剪**：只读查询需要的列（对象存储按列切片读）。

---

## 三、与其他引擎的边界（高频混淆点）

| 引擎 | 定位 | 与 Trino 差异 |
|------|------|---------------|
| **Spark** | 批处理计算框架 | Spark 是「重计算平台」（ETL/ML）；Trino 是「交互式 SQL 查询」，不擅长跑复杂 ETL 作业 |
| **Hive** | 离线数仓 SQL | Hive 走 MapReduce/Tez，分钟级；Trino 内存引擎，秒级，多用于「替代 Hive 查询层」 |
| **ClickHouse/Doris** | 存储+查询一体的 OLAP | 它们**存数据**；Trino **不存数据**，只查别人的数据——互补组合：CK 存热数据，Trino 联邦 |
| **PrestoSQL vs PrestoDB** | 同源分叉 | 社区主流是 Trino（PrestoSQL 更名）；Facebook 分支 PrestoDB 由社区维护，两者 API 大体兼容 |

---

## 四、生产实践要点

1. **Worker 内存规划**：跨源 Join 吃内存，按「并发查询数 × 单查询内存」预留；
2. **下推验证**：跨源查询慢，先查 EXPLAIN 看过滤是否下推了（没下推 → 全量拉取，白查）；
3. **资源组（Resource Group）**：给不同团队/查询类型配内存与并发配额，防大查询把集群打垮；
4. **与湖格式搭配**：Iceberg 表 + Trino（列统计、分区裁剪、时间旅行）是 2025 主流湖仓查询组合；
5. **缓存**：热查询可配 Alluxio/对象存储缓存，减少重复扫源。

---

## 五、速查表

| 主题 | 一句话 |
|------|--------|
| 定位 | 无状态多源联邦 SQL 引擎，不存数据只算 |
| 架构 | Coordinator + 无状态 Worker，弹性扩展 |
| 连接器 | Hive/Iceberg/JDBC/Kafka/对象存储/云数仓全对接 |
| 关键优化 | 谓词下推 + 列裁剪 + 分布式内存 Join |
| 对比 | 查得快→Trino；ETL/ML→Spark；要存数据→CK/Doris |
| 典型组合 | Iceberg 湖 + Trino 查询层；CK 热数据 + Trino 联邦 |

---

## 六、与其他板块的关系

- 数据湖格式（Iceberg/Delta/Hudi）见「[基础知识/大数据/05-列式存储与数据湖格式](../大数据/05-列式存储与数据湖格式.md)」；
- 与「[Apache Spark 批处理](./ApacheSpark批处理.md)」「[ClickHouse](./ClickHouse.md)」构成「批/查/存」三件套对照；
- 云上对应见「[云上数仓与大数据生态](./云上数仓与大数据生态.md)」（Athena/EMR 自带 Trino、BigQuery Omni 等）。

> 一句话：**Trino = 「哪里的数据都能查」的联邦 SQL：湖上文件秒查、异构库跨源 Join、BI/Ad-hoc 分析神器；它不是存储不是 ETL，是「分布式查询层」。**