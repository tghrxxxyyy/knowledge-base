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
- 对比 Hive 见「[大数据/Hive](../大数据/Hive.md)」；
- 对比 ClickHouse 见「[ClickHouse](./ClickHouse.md)」；
- 实时数仓见「[云上数仓与大数据生态](./云上数仓与大数据生态.md)」；
- 数据湖格式见「[Iceberg/Delta/Hudi](./云上数仓与大数据生态.md)」；
- Kafka 实时导入见「[Kafka](./Kafka.md)」；
- ETL 调度见「[DolphinScheduler](./DolphinScheduler.md)」；
- 对比 Hive 见「[大数据/Hive](../大数据/Hive.md)」；
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
