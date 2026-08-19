# Trino（Presto）联邦查询引擎（深入）

> Trino（原 PrestoSQL）是**多源联邦 SQL 查询引擎**：一条 SQL 同时查 MySQL + Hive + Kafka + 对象存储 + 云数仓。本篇深入拆解：Connector SPI、调度模型、性能调优、生产部署、与 Iceberg/Hudi 集成。

---

## 一、解决的问题与定位

**解决的问题**：
1. 数据分散在多个系统，分析要搬数据、建管道，周期长；
2. Hive/Spark 查询重、分钟级，交互式分析需要秒级；
3. 数据湖缺一个「直接 SQL 查询」的引擎。

**定位一句话**：**「不存数据、只算数据」的分布式 SQL 引擎——连接器（Connector）模式对接 N 种数据源，SQL 下推与跨源 Join。**

---

## 二、核心原理

### 2.1 Coordinator + Worker 架构

```
Coordinator: 解析 SQL → 生成分布式执行计划 → 调度给 Worker
Worker 并行执行 Task；数据按分区(partition)分片

Coordinator: 无状态（可多活），只做解析/优化/调度
Worker: 执行计算，可无限水平扩展（加 Worker = 加并发）
无状态 + 弹性: 查询结束即释放，不存用户数据
```

### 2.2 查询执行流程

```
SQL → Parser → Analyzer → Optimizer → LogicalPlan → PhysicalPlan
  → Stage 分解（Coordinator/Worker 多级 Stage）
  → Task 分发到 Worker
  → Worker 读取数据（通过 Connector）
  → 执行 Filter/Join/Aggregation
  → 结果返回 Coordinator → 返回客户端

Stage 类型：
  CoordinatorOnly: 只在 Coordinator 执行（如展示结果）
  Source: 从 Connector 读数据
  Fixed: 在 Worker 上执行计算
  Single: 在 Coordinator 上汇聚结果
```

### 2.3 连接器（Connector）体系

| 连接器 | 数据源 | 关键点 |
|--------|--------|--------|
| Hive/Iceberg/Delta Lake | 数据湖表格式 | 元数据从 HMS/Catalog 读，数据扫对象存储 |
| JDBC 类 | MySQL/PG/Doris/ClickHouse… | 谓词下推减少传输 |
| Kafka | 实时流 | 可当实时表查（低延迟小批） |
| 对象存储+File | S3/OSS 上 JSON/CSV/Parquet | 无目录表也行（Raw Query） |
| 云数仓 | Redshift/BigQuery/Snowflake | 跨云联邦 |
| Elasticsearch | 搜索索引 | 全文检索 + 聚合 |
| Redis | KV 存储 | 简单查询 |

### 2.4 Connector SPI 开发

```java
// 自定义 Connector 需要实现的接口
public interface Connector {
    ConnectorMetadata getMetadata();
    ConnectorFactory getConnectorFactory();
    ConnectorSplitManager getSplitManager();
    ConnectorPageSourceProvider getPageSourceProvider();
    ConnectorPageSinkProvider getPageSinkProvider();
}

// 元数据接口
public interface ConnectorMetadata {
    List<String> listSchemaNames();
    List<String> listTables(ConnectorSession session, String schemaName);
    ConnectorTableHandle getTableHandle(ConnectorSession session, SchemaTableName tableName);
    ConnectorTableMetadata getTableMetadata(ConnectorSession session, ConnectorTableHandle tableHandle);
}

// Split 管理（数据分片）
public interface ConnectorSplitManager {
    ConnectorSplitSource getSplits(ConnectorSession session, ConnectorTableHandle table, DynamicFilter dynamicFilter);
}
```

---

## 三、下推与优化

### 3.1 谓词下推

```sql
-- 原始查询
SELECT * FROM mysql.users u JOIN hive.orders o ON u.id = o.user_id
WHERE u.age > 25 AND o.amount > 100;

-- Trino 优化后：
-- MySQL 端：WHERE age > 25（只拉符合条件的用户）
-- Hive 端：WHERE amount > 100（只拉符合条件的订单）
-- 内存中：Join 两小结果集

-- 验证下推：EXPLAIN 输出看 ConnectorScanNode 的过滤条件
EXPLAIN SELECT * FROM mysql.users WHERE age > 25;
-- 输出中应包含 "FilterExpression: (age > 25)" 在 ConnectorScanNode 中
```

### 3.2 关键优化

| 优化 | 说明 |
|------|------|
| 谓词下推 | WHERE/HAVING 条件压到源端执行 |
| 列裁剪 | 只读查询需要的列（对象存储按列切片） |
| 分区裁剪 | 只读匹配分区的数据 |
| Join 优化 | 小表广播（Broadcast）、大表分区分发 |
| 字段裁剪 | 只读需要的字段（减少 IO） |
| 聚合下推 | 源端预聚合（减少传输量） |
| 时间旅行 | Iceberg 表的快照查询 |

---

## 四、性能调优

### 4.1 Worker 资源配置

```properties
# worker 节点配置
query.max-memory=50GB           # 单查询最大内存
query.max-memory-per-node=8GB   # 单节点单查询最大内存
query.max-total-memory-per-node=10GB  # 单节点总内存限制
query.max-run-time=1h           # 单查询最大执行时间
query.queue-config-file=queue.json  # 资源队列配置
```

### 4.2 资源队列

```json
{
  "queues": {
    "root": {
      "maxQueued": 100,
      "maxRunning": 50,
      "schedulingPolicy": "fair",
      "subqueues": {
        "interactive": {
          "maxQueued": 50,
          "maxRunning": 30,
          "schedulingPolicy": "weighted",
          "subqueues": {
            "team_a": { "maxQueued": 20, "maxRunning": 10, "weight": 1 },
            "team_b": { "maxQueued": 20, "maxRunning": 10, "weight": 2 }
          }
        },
        "batch": {
          "maxQueued": 50,
          "maxRunning": 20
        }
      }
    }
  }
}
```

### 4.3 常见性能问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 跨源 Join 慢 | 数据没下推，全量拉取 | EXPLAIN 检查下推情况 |
| 内存溢出 | 单查询内存太大 | 调 query.max-memory |
| 数据倾斜 | 某个 partition 数据量特别多 | 调整分区策略 / Salting |
| 元数据慢 | Hive Metastore 响应慢 | 缓存元数据 / 用 Iceberg |
| Worker OOM | 并发查询太多 | 资源队列 + 调并发限制 |

---

## 五、与 Iceberg 集成

### 5.1 Iceberg 表配置

```sql
-- 创建 Iceberg 表
CREATE TABLE iceberg.mydb.users (
    id BIGINT,
    name VARCHAR,
    age INT
) WITH (
    format = 'ORC',
    partitioning = ARRAY['age'],
    location = 's3://my-bucket/iceberg/mydb/users'
);

-- 时间旅行查询
SELECT * FROM iceberg.mydb.users FOR TIMESTAMP AS OF TIMESTAMP '2024-01-01 00:00:00';
SELECT * FROM iceberg.mydb.users FOR VERSION AS OF 12345;

-- Schema 演进
ALTER TABLE iceberg.mydb.users ADD COLUMN email VARCHAR;
```

### 5.2 Iceberg + Trino 优势

| 特性 | 说明 |
|------|------|
| 列统计 | 自动收集列统计信息优化查询 |
| 分区裁剪 | 按分区过滤，只读需要的数据 |
| 时间旅行 | 查询历史快照 |
| Schema 演进 | 安全地添加/删除列 |
| ACID 事务 | 并发写入安全 |
| 小文件合并 | 自动合并小文件 |

---

## 六、生产部署

### 6.1 部署模式

```
独立部署（Self-Hosted）：
  - Coordinator × 2（高可用）
  - Worker × N（按需扩缩）
  - 依赖：Metastore（HMS）+ 对象存储

云托管：
  - AWS EMR Trino
  - Google Cloud Dataproc Trino
  - Starburst Galaxy
  - Allen AI Trino

K8s 部署：
  - trino-kubernetes-operator
  - Helm Chart
```

### 6.2 生产检查清单

| 项目 | 建议 |
|------|------|
| Coordinator HA | 2 个 Coordinator + 负载均衡 |
| Worker 数量 | 按并发查询数 × 单查询资源需求 |
| 内存规划 | 每 Worker 16~64GB，JVM 堆占 70% |
| 网络 | Worker 间 10Gbps+（shuffle 吃带宽） |
| 元数据缓存 | HMS 缓存 / Iceberg 元数据缓存 |
| 监控 | JMX Exporter + Prometheus + Grafana |
| 日志 | 结构化日志 + 集中采集 |

---

## 七、与其他引擎对比

| 引擎 | 定位 | 存储 | 延迟 | 适用 |
|------|------|------|------|------|
| **Trino** | 联邦查询 | 不存数据 | 秒级 | 联邦/BI/Ad-hoc |
| **Spark** | 批处理 | 不存数据 | 分钟~小时 | ETL/ML |
| **Hive** | 离线数仓 | HDFS | 分钟~小时 | 离线分析 |
| **ClickHouse** | OLAP | 自存储 | 毫秒~秒 | 实时分析 |
| **Doris** | OLAP | 自存储 | 毫秒~秒 | 实时分析 |
| **PrestoDB** | 联邦查询 | 不存数据 | 秒级 | Facebook 生态 |

---

## 八、速查表

| 主题 | 一句话 |
|------|--------|
| 定位 | 无状态多源联邦 SQL 引擎，不存数据只算 |
| 架构 | Coordinator + 无状态 Worker，弹性扩展 |
| 连接器 | Hive/Iceberg/JDBC/Kafka/ES/对象存储全对接 |
| 关键优化 | 谓词下推 + 列裁剪 + 分区裁剪 + 内存 Join |
| 对比 | 查得快→Trino；ETL→Spark；要存数据→CK/Doris |
| 典型组合 | Iceberg 湖 + Trino 查询层；CK 热数据 + Trino 联邦 |

---

## 九、与其他板块的关系

- 数据湖格式见「[列式存储与数据湖格式](../基础知识/大数据/05-列式存储与数据湖格式.md)」；
- 与 Spark/ClickHouse 对比见对应文档；
- 云上对应见「[云上数仓与大数据生态](./云上数仓与大数据生态.md)」。

> 一句话：**Trino = 「哪里的数据都能查」的联邦 SQL——不是存储不是 ETL，是「分布式查询层」；生产核心：谓词下推 + 资源队列 + Iceberg 集成 + Worker 弹性扩缩**。
