# Doris / StarRocks 深入（物化视图实现 / 查询优化 / 数据导入 / 生产部署 / 冷热分层）

> Doris 与 StarRocks 是**国产 MPP 列式 OLAP** 双雄。本篇深入拆解：物化视图增量刷新机制、查询优化器原理、多源导入链路、生产部署最佳实践、冷热分层架构。

---

## 一、核心原理

### 1.1 MPP + 列式存储

```
FE（Frontend）：SQL 解析、查询计划、元数据管理（类 HDFS NameNode）
BE（Backend）：数据存储 + 计算执行（列式存储、向量化执行、多副本）

查询流程：
  SQL → FE 解析优化 → 生成查询计划
  → 分发到所有 BE 并行扫描切片
  → 结果合并返回

列式 + 向量化：
  按列压缩存储、按列批量计算（SIMD）
  聚合（count/sum/avg）只扫需要的列，跳过无关列
```

### 1.2 三种表模型

| 模型 | 语义 | 适用 |
|------|------|------|
| Duplicate（明细） | 原样保存每行 | 明细查询、审计、日志 |
| Aggregate（聚合） | 导入时按键聚合（SUM/MAX/MIN/REPLACE） | 指标表：PV/UV、余额快照 |
| Unique（唯一键） | 按唯一键去重更新（REPLACE/UPDATE） | 用户表、订单实时更新 |

### 1.3 分桶键设计

```
分桶键 = 数据分布 + 查询性能的关键

原则：
  选择查询最常用的过滤字段（如 user_id / sku_id）
  同 key 数据同节点（Colocate），避免跨节点 Shuffle
  分桶数 = BE 数 × 副本数（合理分布）

反例：
  用 timestamp 做分桶键 → 写入热点（所有新数据集中在一个桶）
  用低基数字段做分桶键 → 数据倾斜
```

---

## 二、物化视图（深入）

### 2.1 同步物化视图

```
同步物化视图 = 建表时指定聚合/转换规则
  → 数据导入时自动维护
  → 查询命中时走物化视图，省扫描量 10~100 倍

CREATE MATERIALIZED VIEW mv_sum
AS SELECT user_id, SUM(amount) as total
FROM orders GROUP BY user_id;

工作原理：
  导入数据 → 同步更新物化视图（增量）
  查询 → FE 自动匹配最优物化视图
```

### 2.2 异步物化视图（实时数仓利器）

```
异步物化视图 = 手动/定时刷新的预聚合

CREATE MATERIALIZED VIEW mv_daily
BUILD IMMEDIATE REFRESH AUTO ON SCHEDULE
DAILY INTERVAL 1 HOUR
AS SELECT date, product_id, SUM(amount)
FROM orders GROUP BY date, product_id;

刷新机制：
  增量刷新：检测 Base 表变化，只刷新变化分区
  全量刷新：每次全量重建（小数据集可用）
  定时刷新：按 CRON 表达式调度

适用：实时数仓分层 ODS→DWD→ADS
```

### 2.3 物化视图选型

| 类型 | 刷新 | 性能 | 适用 |
|------|------|------|------|
| 同步 | 导入时同步 | 极高 | 预聚合指标表 |
| 异步 | 定时/事件 | 高 | 实时数仓分层 |
| 同步 Rollup | 导入时同步 | 高 | 多维度预聚合 |

---

## 三、查询优化器

### 3.1 基于代价的优化器（CBO）

```
CBO = 基于代价估算选择最优查询计划

核心能力：
  Join 重排：多表 Join 选择最优顺序
  分区裁剪：跳过不相关分区
  物化视图匹配：自动选择最优物化视图
  谓词下推：过滤条件推到存储层

配置：
  SET cbo_enable = true;
  SET enable_pipeline_engine = true;  // 流水线执行引擎
```

### 3.2 查询调优手段

| 手段 | 说明 |
|------|------|
| EXPLAIN | 查看查询计划，确认是否命中索引/物化视图 |
| 分区裁剪 | WHERE 条件带分区键，跳过无关分区 |
| 物化视图 | 预聚合加速 |
| 向量化执行 | SIMD 批量计算，开启 pipeline engine |
| Runtime Filter | Join 时动态生成过滤条件，减少扫描量 |
| 物化视图选择 | FE 自动选择最优物化视图 |

---

## 四、多源导入链路

### 4.1 导入方式

| 方式 | 特点 | 适用 |
|------|------|------|
| Stream Load | HTTP 接口，同步返回 | 小批量 CSV/JSON 导入 |
| Broker Load | HDFS/S3 数据导入 | 大批量离线导入 |
| Routine Load | Kafka 实时订阅 | 实时流式导入（秒级可见） |
| Spark Load | Spark 作业导入 | 超大批量 ETL |
| Multi-Catalog | 外部表直接查询 | 联邦查询（MySQL/Hive/ES） |

### 4.2 Routine Load（实时数仓标配）

```
CREATE ROUTINE LOAD orders_kafka ON orders
COLUMNS(kafka_topic, kafka_partitions, kafka_offsets)
PROPERTIES("format"="json", "max_batch_interval"="10")
FROM KAFKA("kafka_broker_list"="kafka:9092","kafka_topic"="orders");

原理：
  FE 定时（默认 10s）从 Kafka 拉取一批
  → BE 写入（原子导入）
  → 秒级可见（Flink 也是这样对接）

注意：
  每个 Routine Load 只能订阅一个 Topic
  分区数变更需要手动调整
  导入失败会自动重试（默认重试 3 次）
```

---

## 五、生产部署最佳实践

### 5.1 部署架构

```
3 FE（1 Leader + 2 Follower，主从同步）
  → 元数据高可用

3~N BE（数据分片 + 副本）
  → 存储计算一体

可选：
  Broker（HDFS/S3 对接）
  仲裁节点（Follower 选主）
```

### 5.2 集群规划

| 配置 | 建议 |
|------|------|
| FE 数量 | 3 个（奇数，1 Leader + 2 Follower） |
| BE 数量 | 按数据量 + 副本数规划（如 3 副本 × 3 BE） |
| 副本数 | 默认 3（生产必配） |
| 存储 | SSD（热数据）+ HDD/对象存储（冷数据） |
| 内存 | BE 内存 = 数据量 × 10%~20%（向量化计算需要） |

### 5.3 冷热分层

```
冷热分层 = 热数据 SSD，冷数据归档到对象存储（省 50%+ 成本）

实现：
  分区级别：按时间分区，热分区 SSD，冷分区迁移 S3
  BE 存储：hot SSD + cold HDD（StarRocks 支持）
  物化视图：热数据走物化视图，冷数据走原始表

迁移策略：
  7 天内：SSD（热）
  7~30 天：HDD（温）
  30 天后：S3/OSS（冷）
```

---

## 六、常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 查询慢 | 未命中分区裁剪/物化视图 | EXPLAIN + 调整 WHERE + 建物化视图 |
| 导入失败 | BE 磁盘满/网络抖动 | 检查 BE 状态 + 调整导入频率 |
| OOM | 大查询/Join 超内存 | 调整 BE 内存 + 限制查询内存 |
| 数据倾斜 | 分桶键选择不当 | 重新设计分桶键 |
| 副本不一致 | 网络分区/磁盘故障 | 检查副本状态 + 手动修复 |

---

## Doris FE/BE Architecture

### FE 架构深度

```
FE（Frontend）= 元数据 + SQL 解析 + 调度

Leader/Follower/Observer：
  Leader: 处理写请求（DDL/导入），Raft 一致性
  Follower: 同步 Leader 数据，可读
  Observer: 只读副本，不参与选举

元数据管理：
  ├── Catalog/Database/Table 元数据
  ├── Partition/Segment 信息
  ├── Tablet 副本分布
  └── 导入任务状态

SQL 解析流程：
  1. SQL Parser（基于 JavaCC）
  2. Analyzer（语义分析/类型检查）
  3. Planner（逻辑计划/物理计划）
  4. Optimizer（CBO 优化/谓词下推）
  5. 生成 Fragment 树（分发到 BE 执行）

配置：
  fe:
    priority_networks: 10.0.0.0/24
    meta_dir: /opt/doris/fe/meta
    max_running_txn_num_per_db: 1000
```

### BE 架构深度

```
BE（Backend）= 数据存储 + 计算执行

组件：
  ├── Tablet Manager（管理 Tablet 副本）
  ├── Segment Writer/Reader（数据写入/读取）
  ├── CompactionManager（后台 Compaction）
  ├── Pipeline Engine（向量化执行引擎）
  └── MemTable/MemPool（内存管理）

存储引擎（LSM-Tree）：
  MemTable（写入缓存）→ Flush → Segment（磁盘）
  → Compaction 合并 → 最终 Segment
  
  Segment 格式：
    数据列 + 索引（Bloom Filter/Zonemap/Bitmap）
    
副本管理：
  每个 Tablet 默认 3 副本
  副本分布在不同 BE 节点
  副本间异步同步（半同步复制）

配置：
  be:
    priority_networks: 10.0.0.0/24
    storage_root_path: /opt/doris/storage
    tablet_map_shard_size: 16
    max_compaction_threads: 4
```

## Doris MPP Query Engine

### 查询执行流程

```
SQL → FE 解析优化 → 物理计划
  → 分发到 BE（Fragment）
  → BE 执行 Pipeline（向量化）
  → 结果合并返回

MPP 模式：
  每个 Fragment → 多个 ScanNode → 并行扫描
  → ExchangeNode（Shuffle）→ 数据重分布
  → AggregationNode（聚合）→ 最终结果

Pipeline Engine：
  一个 Fragment → 多个 Operator 组成 Pipeline
  Pipeline 内算子并行执行（向量化批量处理）
  Pipeline 间流水线执行（不等一个 Fragment 完成）

配置：
  SET enable_pipeline_engine = true;
  SET parallel_fragment_exec_instance_num = 8;  # 并行度
```

### Join 策略

```
Doris Join 策略：
  ├── Broadcast Join（小表广播）
  │   小表 → 广播到所有 BE → 本地 Join
  │   适用：小表 < 100MB
  │
  ├── Shuffle Join（数据重分布）
  │   两张表按 Join Key → Hash 分桶 → 相同桶 Join
  │   适用：大表 Join 大表
  │
  ├── Bucket Shuffle Join（同桶 Join）
  │   两张表分桶键相同 → 同节点 Join（无 Shuffle）
  │   适用：Colocate 表
  │
  └── Runtime Filter（动态过滤）
      Join 时生成 Bloom Filter → 下推到 Scan
      减少扫描数据量（10x+ 加速）

CBO 优化：
  基于统计信息估算 Join 代价
  自动选择最优 Join 策略
```

## Doris Vectorized Execution

```
向量化执行 = 按列批量处理（SIMD 加速）

传统行存执行：
  逐行处理 → 函数调用多 → 缓存不友好

向量化列存执行：
  按列批量处理（1024 行/批）
  SIMD 指令并行处理
  缓存命中率高（连续内存访问）

Pipeline 算子：
  ├── ScanOperator（列存扫描）
  ├── ProjectOperator（列投影）
  ├── FilterOperator（过滤）
  ├── AggregationOperator（聚合）
  ├── SortOperator（排序）
  └── JoinOperator（Join）

性能对比：
  向量化 vs 行存：聚合查询 5-10x 提升
  SIMD 加速：数值计算 2-4x 提升
```

## StarRocks CBO Optimizer

```
StarRocks CBO（Cost-Based Optimizer）= 基于代价的查询优化器

核心能力：
  1. 统计信息收集
     ANALYZE TABLE orders UPDATE HISTOGRAM;
     → 收集列分布/NDV/空值率等统计信息

  2. Join 重排
     多表 Join → CBO 估算所有 Join 顺序 → 选最优
     例：A JOIN B JOIN C → 可能 B JOIN C JOIN A 更优

  3. 分区裁剪
     WHERE date >= '2024-01-01' → 跳过 2024 年前分区

  4. 谓词下推
     过滤条件 → 下推到 Scan 减少 I/O

  5. 物化视图选择
     查询 → 自动匹配最优物化视图

配置：
  SET cbo_enable = true;
  SET cbo_use_node_stats_for_distributed = true;
  SET enable_pipeline_engine = true;
```

## StarRocks Lakehouse

```
StarRocks Lakehouse = 外部表直接查询数据湖

支持格式：
  ├── Apache Iceberg
  ├── Apache Hudi
  ├── Delta Lake
  └── Apache Hive

配置示例：
  CREATE EXTERNAL CATALOG hive_catalog
  PROPERTIES (
    "type" = "hive",
    "hive.metastore.uris" = "thrift://metastore:9083"
  );
  
  SELECT * FROM hive_catalog.db.table WHERE date = '2024-01-01';

查询优化：
  分区裁剪：跳过外部表不相关分区
  谓词下推：过滤条件下推到数据湖
  缓存：本地缓存热数据（避免重复读取）

优势：
  无需 ETL → 直接查询数据湖
  统一 SQL 接口
  高性能向量化执行
```

## Doris vs StarRocks Benchmark

```
性能对比（标准测试集）：

| 场景 | Doris 2.1 | StarRocks 3.x |
|------|-----------|---------------|
| 单表聚合 | 1.0x | 0.9x |
| 多表 Join | 1.0x | 0.85x |
| 实时导入 | 1.0x | 1.0x |
| 物化视图 | 1.0x | 0.95x |
| 冷热分层 | 支持 | 支持 |

功能对比：
  | 功能 | Doris | StarRocks |
  |------|-------|-----------|
  | CBO | 支持 | 支持（更成熟） |
  | 向量化 | 支持 | 支持 |
  | Pipeline | 支持 | 支持 |
  | 外部表 | 支持 | 支持 |
  | 物化视图 | 同步/异步 | 同步/异步 |

选型建议：
  开源优先/国内生态 → Doris
  性能优先/商业支持 → StarRocks
  功能接近，差异在细节
```

## Real-time Analytics with Doris

```
实时数仓架构：

Kafka → Doris（Routine Load）
  → 秒级可见
  → 实时分析

架构：
  数据源（MySQL Binlog/Kafka）→ Flink → Kafka
  → Doris（Routine Load 秒级导入）
  → BI 工具（查询分析）

关键配置：
  Routine Load:
    max_batch_interval = 10s    # 导入频率
    max_batch_rows = 200000     # 批次大小
    max_batch_interval_bytes = 104857600  # 批次大小

  导入优化：
    format = json
    strip_outer_array = true
    num_as_string = false
    
监控：
    routine_load_running_num   # 运行中的导入任务
    routine_load_success_num   # 成功导入数
    routine_load_fail_num      # 失败导入数
```

## Doris Rollup

```
Rollup = 同步物化视图（预聚合）

创建 Rollup：
  ALTER TABLE orders ADD ROLLUP rollup_daily (date, product_id, amount);

工作原理：
  数据导入 → 自动维护 Rollup
  查询 WHERE date AND product_id → 走 Rollup（省扫描量）

Rollup 选择：
  FE 自动选择最优 Rollup
  EXPLAIN 查看是否命中 Rollup
  
最佳实践：
  高频查询字段 → 建 Rollup
  避免过多 Rollup（影响写性能）
  定期 ANALYZE TABLE 更新统计信息
```

## StarRocks Primary Keys

```
Primary Key 模型 = 实时更新（Replace/聚合）

StarRocks 3.0+ Primary Key:
  支持部分列更新（Partial Update）
  支持条件更新（Conditional Update）

CREATE TABLE orders (
    order_id BIGINT,
    user_id BIGINT,
    status VARCHAR(20),
    amount DECIMAL(10,2)
) PRIMARY KEY (order_id)
DISTRIBUTED BY HASH(order_id) BUCKETS 8
PROPERTIES (
    "replication_num" = "3",
    "enable_unique_key_merge_on_write" = true  -- 写时合并（推荐）
);

优势：
  实时更新（毫秒级可见）
  无需 Compaction（写时合并）
  支持部分列更新（节省带宽）
```

## Shared-Data Architecture

```
StarRocks Shared-Data = 存算分离架构

原理：
  FE → 调度查询
  BE → 只负责计算（无本地存储）
  数据存 → 对象存储（S3/OSS/HDFS）

优势：
  计算存储独立扩展
  云上成本优化（冷数据存 S3）
  快速弹性扩缩容

配置：
  fe:
    shared_data_endpoint = s3://bucket/path
    
适用：
  云原生部署
  冷热分层（热数据 SSD，冷数据 S3）
  弹性计算需求
```

## 七、与其他板块的关系

- ClickHouse 对比见「[ClickHouse](./ClickHouse.md)」；
- 数仓分层见「[大数据/09-数据仓库与OLAP引擎](../大数据/09-数据仓库与OLAP引擎.md)」；
- 云上对应见「[云上数仓与大数据生态](./云上数仓与大数据生态.md)」；
- Flink 实时导入见「[Apache Flink 流处理](./ApacheFlink流处理.md)」。

> 一句话：**Doris/StarRocks = MPP 列式 + MySQL 协议 + 物化视图 + 多源导入——查询调优三板斧：分区裁剪 + 物化视图 + 向量化执行；生产选 Retain 回收 + WaitForFirstConsumer + 冷热分层**。

---

## Doris 前缀索引与 ZoneMap 剪枝

### 前缀索引原理

```
Doris 前缀索引 = 每个 Segment 的稀疏索引
  每 1024 行生成一个索引项（sparse index）
  索引项 = 前 N 个字段的最小值 + Segment 文件偏移量
  查询时先查索引 → 定位 Segment → 再精确查找

ZoneMap 索引 = 每列的 min/max 统计信息
  每个 Segment 记录每列的 min/max 值
  WHERE 条件 → 对比 ZoneMap → 跳过不匹配的 Segment
  效果：范围查询可跳过 80%+ 的数据

联合使用：
  查询 WHERE date='2024-01-01' AND user_id=12345
  → 前缀索引定位到 user_id 相关 Segment
  → ZoneMap 过滤 date 不匹配的 Segment
  → 最终只扫描少量数据
```

### 前缀索引设计规则

| 规则 | 说明 |
|------|------|
| 字段顺序决定索引 | 建表时字段顺序 = 前缀索引顺序 |
| 最多 36 字节 | 超过部分不参与前缀索引 |
| 不支持跳列 | 不能跳过中间字段 |
| 分区键不参与 | 分区键自动排除 |

```sql
-- 前缀索引生效示例
CREATE TABLE orders (
    dt DATE,
    user_id BIGINT,
    order_id BIGINT,
    amount DECIMAL(10,2)
)
DISTRIBUTED BY HASH(user_id) BUCKETS 16;

-- 查询走前缀索引（dt 排在最前面）
SELECT * FROM orders WHERE dt = '2024-01-01';

-- 查询不走前缀索引（跳过了 dt）
SELECT * FROM orders WHERE user_id = 12345;
```

> **口诀：前缀索引 = Segment 级稀疏索引，ZoneMap = 列级 min/max 剪枝——两者联合可跳过 80%+ 无用数据。**

---

## StarRocks Colocate Join 约束

### 原理

```
Colocate Join = 相同 Colocate Group 的表按相同分桶键分布
  → 同一桶的数据在同一节点
  → Join 无需 Shuffle（数据已在同节点）

约束：
  ① 分桶键类型和分桶数必须相同
  ② 同一 Colocate Group 内的表必须满足约束
  ③ 数据分布一致 → Bucket Shuffle Join 无 Shuffle

优势：
  大表 Join 大表：Shuffle 开销巨大 → Colocate Join 消除 Shuffle
  小表 Join 大表：Broadcast Join 更合适
```

```sql
-- 创建 Colocate Group
CREATE DATABASE db1;
CREATE TABLE orders (
    user_id BIGINT, dt DATE, amount DECIMAL(10,2)
)
DISTRIBUTED BY HASH(user_id) BUCKETS 16
PROPERTIES (
    "colocate_with" = "user_group"
);

CREATE TABLE users (
    user_id BIGINT, name VARCHAR(100)
)
DISTRIBUTED BY HASH(user_id) BUCKETS 16
PROPERTIES (
    "colocate_with" = "user_group"
);

-- Join 自动走 Colocate Join（无 Shuffle）
SELECT u.name, SUM(o.amount)
FROM users u JOIN orders o ON u.user_id = o.user_id
GROUP BY u.name;
```

### Colocate Join vs 其他 Join

| Join 类型 | 数据移动 | 适用场景 |
|-----------|---------|---------|
| Broadcast Join | 小表广播 | 小表 < 100MB |
| Shuffle Join | 两端重分布 | 无 Colocate 约束 |
| Colocate Join | 无 Shuffle | 同分桶键大表 Join |
| Bucket Shuffle Join | 部分 Shuffle | 分桶键部分相同 |

> **口诀：Colocate Join = "让相关数据住在一起"——同分桶键 + 同分桶数 = Join 零 Shuffle。**

---

## 物化视图异步刷新与查询改写

### 刷新机制

```
异步物化视图刷新策略：
  ① 定时刷新：CRON 表达式（如每小时）
  ② 手动刷新：REFRESH MATERIALIZED VIEW mv_name
  ③ 事件触发：Base 表数据变化时自动刷新（增量）
  ④ 全量刷新：每次全量重建（小数据集可用）

增量刷新原理：
  检测 Base 表分区变化 → 只刷新变化分区
  → 减少刷新数据量 → 提高实时性
```

### 查询改写

```
查询改写 = FE 自动将查询重写为物化视图查询

示例：
  物化视图 mv_daily 聚合了 date+product_id 的销量
  查询 SELECT date, SUM(amount) FROM orders GROUP BY date
  → FE 自动匹配 mv_daily → 走物化视图（省扫描量 100x）

FE 自动选择最优物化视图：
  多个物化视图 → CBO 估算代价 → 选最优
  EXPLAIN 查看是否命中物化视图
```

```sql
-- 创建异步物化视图
CREATE MATERIALIZED VIEW mv_daily
BUILD IMMEDIATE REFRESH AUTO ON SCHEDULE
EVERY 1 HOUR
AS SELECT date, product_id, SUM(amount) as total
FROM orders GROUP BY date, product_id;

-- 手动刷新
REFRESH MATERIALIZED VIEW mv_daily;

-- 查看物化视图状态
SHOW ALTER MATERIALIZED VIEW FROM db1;
```

> **口诀：异步物化视图 = "预计算 + 增量刷新"——定时刷新保持数据新鲜，查询改写自动走物化视图加速。**

---

## Broker Load/Routine Load 参数详解

### Broker Load 参数

```sql
LOAD LABEL db1.batch_load_001
(
    DATA INFILE("hdfs://namenode/data/orders/*")
    INTO TABLE orders
    FORMAT AS CSV
    COLUMNS TERMINATED BY ","
    (user_id, order_id, amount, dt)
)
BROKER broker1
PROPERTIES (
    "timeout" = "3600",           -- 超时时间（秒）
    "max_filter_ratio" = "0.1",   -- 最大容忍过滤率
    "strict_mode" = "false",      -- 严格模式
    "partition" = "p20240101",    -- 指定分区
    "load_parallelism" = "4"      -- 并行度
);
```

### Routine Load 参数

```sql
CREATE ROUTINE LOAD orders_kafka ON orders
COLUMNS(kafka_topic, kafka_partitions, kafka_offsets)
PROPERTIES (
    "format" = "json",
    "max_batch_interval" = "10",         -- 批次间隔（秒）
    "max_batch_rows" = "200000",         -- 批次行数
    "max_batch_interval_bytes" = "104857600", -- 批次字节数（100MB）
    "max_error_number" = "0",            -- 最大错误数（0=不限）
    "strict_mode" = "false"              -- 严格模式
)
FROM KAFKA (
    "kafka_broker_list" = "kafka:9092",
    "kafka_topic" = "orders",
    "kafka_partitions" = "0,1,2,3",
    "kafka_offsets" = "0,0,0,0"
);
```

| 参数 | 建议值 | 说明 |
|------|--------|------|
| max_batch_interval | 10s | 太小=频繁导入，太大=延迟高 |
| max_batch_rows | 200000 | 按内存调整 |
| max_batch_interval_bytes | 100MB | 按吞吐调整 |
| max_error_number | 0 | 生产建议不限（数据质量由上游保证） |

> **口诀：Broker Load = 离线大批量（HDFS/S3），Routine Load = 实时流式（Kafka）——Routine Load 关键调 batch_interval 和 batch_rows。**

---

## 存算分离 shared-data on S3

### 架构原理

```
StarRocks Shared-Data = 存算分离架构

组件：
  FE：调度查询（无变化）
  BE：只负责计算（无本地存储）
  数据存储：对象存储（S3/OSS/HDFS）
  缓存：本地 SSD 缓存热数据

优势：
  ① 计算存储独立扩展（按需扩计算/存储）
  ② 成本优化（冷数据存 S3，成本降低 50%+）
  ③ 快速弹性（扩缩容 BE 无需迁移数据）
  ④ 数据高可用（S3 本身 11 个 9 可靠性）

劣势：
  ① 查询延迟略高（热数据走缓存，冷数据走 S3）
  ② 首次查询冷数据有冷启动延迟
```

```sql
-- Shared-Data 配置示例
-- fe.conf
shared_data_endpoint = s3://bucket/path

-- 创建表时指定存算分离
CREATE TABLE orders (
    order_id BIGINT,
    user_id BIGINT,
    amount DECIMAL(10,2)
)
DISTRIBUTED BY HASH(order_id) BUCKETS 16
PROPERTIES (
    "replication_num" = "1",          -- 共享存储无需多副本
    "storage_cooldown_time" = "2592000" -- 30天后迁移到S3
);
```

### 与存算一体对比

| 维度 | 存算一体 | 存算分离 |
|------|---------|---------|
| 存储 | BE 本地磁盘 | S3/OSS 对象存储 |
| 弹性 | 扩缩容需迁移数据 | 计算存储独立扩展 |
| 成本 | SSD 成本高 | 冷数据存 S3 成本低 |
| 性能 | 热数据极快 | 首次冷查询有延迟 |
| 适用 | 性能优先 | 成本优先/弹性需求 |

> **口诀：存算分离 = "计算按需扩，存储按量付"——热数据走 SSD 缓存，冷数据走 S3，成本降 50%+。**

---

## 典型报表场景建模案例

### 电商日报建模

```sql
-- 原始订单表（Duplicate 模型）
CREATE TABLE orders (
    dt DATE,
    user_id BIGINT,
    product_id BIGINT,
    category_id BIGINT,
    amount DECIMAL(10,2),
    quantity INT
)
DISTRIBUTED BY HASH(user_id) BUCKETS 16
PARTITION BY RANGE(dt) (
    PARTITION p20240101 VALUES [("2024-01-01"), ("2024-01-02")),
    PARTITION p20240102 VALUES [("2024-01-02"), ("2024-01-03"))
);

-- 预聚合表（Aggregate 模型）——日报场景
CREATE TABLE daily_category_stats (
    dt DATE,
    category_id BIGINT,
    order_count BIGINT SUM,
    total_amount DECIMAL(18,2) SUM,
    unique_users BIGINT REPLACE
)
AGGREGATE KEY(dt, category_id)
DISTRIBUTED BY HASH(category_id) BUCKETS 8;

-- 物化视图自动维护聚合
CREATE MATERIALIZED VIEW mv_daily_category
AS SELECT dt, category_id, 
    COUNT(*) as order_count,
    SUM(amount) as total_amount,
    COUNT(DISTINCT user_id) as unique_users
FROM orders GROUP BY dt, category_id;
```

### 报表查询模式

| 查询类型 | 优化手段 |
|----------|---------|
| 日/周/月汇总 | 物化视图预聚合 |
| TopN 排行 | 分区裁剪 + LIMIT |
| 同比/环比 | 分区裁剪（按日期范围） |
| 多维度分析 | Rollup / 多物化视图 |

> **口诀：报表建模 = "Duplicate 存明细 + Aggregate 存聚合 + 物化视图自动维护"——查询走预聚合，省 100x 扫描量。**

## Doris 前缀索引与 ZoneMap 剪枝

---

## 六、Doris vs StarRocks 对比

| 维度 | Doris | StarRocks |
|------|-------|-----------|
| 分支 | Apache 顶级项目 | 商业公司主导 |
| CBO | 支持 | 支持（更成熟） |
| 物化视图 | 同步/异步 | 同步/异步 |
| 多源导入 | Stream/Broker/Routine/Spark | Stream/Broker/Routine |
| 存储引擎 | 明细/聚合/唯一 | 明细/聚合/唯一 |
| 向量化 | 支持 | 支持 |
| 社区 | Apache 社区 | 商业+开源 |
| 选型 | 开源优先/国内生态 | 性能优先/商业支持 |

---

## 七、生产调优深入

### 7.1 查询调优 Checklist

| 调优点 | 操作 |
|--------|------|
| 分区裁剪 | WHERE 条件带分区键 |
| 物化视图 | 预聚合热点查询 |
| 向量化执行 | 开启 pipeline engine |
| Runtime Filter | Join 动态过滤 |
| 物化视图选择 | FE 自动选择最优 |
| 统计信息 | ANALYZE TABLE 更新统计 |

### 7.2 导入调优

| 调优点 | 说明 |
|--------|------|
| 批量大小 | 合理设置 batch size |
| 并发度 | 调整导入并行度 |
| 写 Buffer | 增加写缓冲 |
| 限流 | 控制导入速率防打满 BE |

---

## 八、与其他板块的关系（扩展）

- ClickHouse 对比见「[ClickHouse](./ClickHouse.md)」；
- 数仓分层见「[大数据/09-数据仓库与OLAP引擎](../大数据/09-数据仓库与OLAP引擎.md)」；
- 云上对应见「[云上数仓与大数据生态](./云上数仓与大数据生态.md)」；
- Flink 实时导入见「[Apache Flink 流处理](./ApacheFlink流处理.md)」；
- 对比 Hive 见「[Hive 与数仓体系](../大数据/02-技术体系与架构演进.md)」；
- 对比 ClickHouse 见「[ClickHouse](./ClickHouse.md)」；
- 实时数仓见「[云上数仓与大数据生态](./云上数仓与大数据生态.md)」；
- 数据湖格式见「[Iceberg/Delta/Hudi](./云上数仓与大数据生态.md)」；
- Kafka 实时导入见「[Kafka](./Kafka.md)」；

## Doris 前缀索引与 ZoneMap 剪枝

```
Doris 查询优化机制：

  前缀索引（Prefix Index）
    ├── 每个 Segment 的前 36 字节生成稀疏索引
    ├── 适合等值/范围查询（按前缀匹配）
    ├── 主键设计影响查询性能
    └── 示例：主键 (user_id, order_id)
         → WHERE user_id = 100 快速定位
         → WHERE order_id = 123 无法利用

  ZoneMap（列级索引）
    ├── 每个 Segment 每列记录 min/max
    ├── 范围查询时快速跳过不匹配 Segment
    └── 建议高频过滤列放在前面

  Bloom Filter
    ├── 等值查询快速排除
    ├── 误判率可配置
    └── 适合低基数列

  倒排索引（2.0+）
    ├── 支持文本全文检索
    ├── LIKE '%keyword%' 走倒排
    └── 替代 ES 做简单搜索
```

```sql
-- 主键设计原则（高频过滤列在前）
CREATE TABLE orders (
    user_id BIGINT,
    order_id BIGINT,
    amount DECIMAL(10,2),
    ...
) UNIQUE KEY(user_id, order_id);

-- 查看前缀索引命中
EXPLAIN SELECT * FROM orders WHERE user_id = 100;
-- 输出中 prefix_index = true 表示命中

-- Bloom Filter 过滤
SET enable_bloom_filter = true;
SET bloom_filter_size = 256;

-- 倒排索引（2.0+）
CREATE TABLE logs (
    id BIGINT,
    message STRING,
    INDEX idx_msg(message) USING INVERTED COMMENT '倒排索引'
);
```

## Colocate Join 与数据本地化

```
Colocate Join 原理：

  表 A（Bucket 3）    表 B（Bucket 3，Colocate Group）
    ├── Bucket 0 → BE1    ├── Bucket 0 → BE1  ← 同一 BE
    ├── Bucket 1 → BE2    ├── Bucket 1 → BE2  ← 同一 BE
    └── Bucket 2 → BE3    └── Bucket 2 → BE3  ← 同一 BE

  JOIN 时：
    └── 同一 Bucket 数据在同一 BE → 无需 shuffle → 网络开销为 0
```

```sql
CREATE TABLE db1.user (
    user_id BIGINT,
    user_name STRING
) DISTRIBUTED BY HASH(user_id) BUCKETS 3
PROPERTIES ("colocate_with" = "user_group");

CREATE TABLE db1.orders (
    order_id BIGINT,
    user_id BIGINT,
    amount DECIMAL(10,2)
) DISTRIBUTED BY HASH(user_id) BUCKETS 3
PROPERTIES ("colocate_with" = "user_group");

SHOW PROC '/colocate_group';
```

## 报表系统落地案例

```
某电商 BI 报表系统架构：

  数据源：MySQL（订单）、HBase（日志）、Redis（实时指标）
  数据采集：Flink CDC → Doris（实时）、Flume → Kafka → Doris（批量）
  查询层：Metabase（自助 BI）、Superset（高级分析）
  性能指标：简单查询 P99 < 100ms、复杂聚合 < 3s、支持 500+ 并发
```
- ETL 调度见「[DolphinScheduler](./DolphinScheduler.md)」；
- 对比 Hive 见「[Hive 与数仓体系](../大数据/02-技术体系与架构演进.md)」；
- 向量化执行原理见「[ClickHouse](./ClickHouse.md)」。

---

## 九、速查表（扩展）

| 项 | 结论 |
|----|------|
| 类型 | MPP 列式 OLAP |
| 表模型 | Duplicate / Aggregate / Unique |
| 分桶键 | 查询高频字段，避免热点 |
| 查询优化 | CBO + 向量化 + 物化视图 + Runtime Filter |
| 导入 | Stream/Broker/Routine/Spark Load |
| 部署 | FE(3节点) + BE(3+节点) |
| 副本数 | 默认 3（生产必配） |
| 冷热分层 | SSD(热) + HDD(温) + S3(冷) |
| MySQL 协议 | 兼容 MySQL 客户端 |
| Doris vs StarRocks | 开源 vs 商业，功能接近 |
| 社区 | Apache 社区 vs 商业公司主导 |
| 许可证 | Apache 2.0 |
| 一句话 | 「国产 MPP 列式双雄——MySQL 协议 + 物化视图 + 多源导入」 |
