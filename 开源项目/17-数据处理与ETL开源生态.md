# 数据处理与 ETL 开源生态

> 本文梳理批处理、流处理、编排调度与数据建模（dbt）领域的核心开源项目：Apache Spark、Apache Flink、Apache Kafka（含 Kafka Streams）、Apache Airflow、Dagster、dbt、Apache Beam、Trino/Presto。重点讲清各自的定位、编程模型、适用场景与组合方式。特性以官方文档为准。

## 1. 数据处理的三类范式

- **批处理（Batch）**：对有限数据集一次性计算，如 T+1 报表、离线特征。代表：Spark Batch、MapReduce 思想延续。
- **流处理（Streaming）**：对无界数据流持续计算，如实时风控、监控。代表：Flink、Kafka Streams。
- **编排（Orchestration）**：把多个任务按依赖组织成 DAG 并调度执行，本身不一定计算数据，只管"谁先跑、谁后跑、失败怎么办"。代表：Airflow、Dagster。

现实中往往是"流批混合 + 编排调度"的组合：Kafka 接数据源 → Flink 实时清洗 → 结果写 OLAP；同时 Airflow 每天触发 Spark 离线回算校正。

## 2. Apache Spark：统一的批处理引擎

### 2.1 定位

Spark 以 RDD（弹性分布式数据集）为基础抽象，提供 DataFrame/Dataset API，在内存计算上大幅优于早期 MapReduce。核心是**有向无环图（DAG）调度 + 内存迭代**。

### 2.2 核心概念

- **RDD**：不可变、分区的数据集合，血缘（lineage）记录如何从父 RDD 变换而来，失败时按血缘重算而非持久化中间结果。
- **DAGScheduler**：将用户作业划分为 Stage（以 Shuffle 为边界），TaskScheduler 把 Task 派发到 Executor。
- **宽依赖 vs 窄依赖**：窄依赖（如 map）分区一一对应可流水线；宽依赖（如 groupByKey）触发 Shuffle，是性能与容错的关键分界。
- **Catalyst 优化器**：Spark SQL 的基于规则的优化 + 基于代价的优化（CBO），把 DataFrame 逻辑计划转成高效物理计划。

### 2.3 编程模型示例（PySpark）

```python
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("etl").getOrCreate()
df = spark.read.parquet("s3a://raw/orders/")
result = (df
          .filter(df.status == "PAID")
          .groupBy("user_id")
          .agg({"amount": "sum"})
          .withColumnRenamed("sum(amount)", "total"))
result.write.mode("overwrite").saveAsTable("dwd.user_paid_total")
```

### 2.4 Structured Streaming

Spark 用"微批（micro-batch）"把流当作"无限表"处理，提供接近批的 API。它胜在统一 API、生态广，但在真正低延迟（毫秒级）场景不如 Flink。

### 2.5 适用与局限

- 适用：离线 ETL、大规模 SQL、ML（MLlib）、图计算（GraphX）。
- 局限：流延迟较高（秒级起）；Shuffle 与内存管理仍需精细调优；资源占用偏大。

## 3. Apache Flink：真正的流优先引擎

### 3.1 定位

Flink 以"流是本质、批是有界流"为哲学，提供**事件时间（Event Time）+ 水位线（Watermark）** 的精确乱序处理，支持 exactly-once 状态一致，是实时数仓与实时特征的主流选择。

### 3.2 核心概念

- **DataStream / Table API**：底层 DataStream 与高层 SQL/Table API 双栈。
- **事件时间 vs 处理时间**：事件时间是数据产生时间，处理时间是到达时间；实时业务必须用事件时间才能保证正确性。
- **Watermark**：衡量"事件时间进展"的机制，表示"小于等于该时间戳的数据基本到齐"，用于触发窗口计算与处理迟到数据。
- **State & Checkpoint**：Flink 把状态（ValueState/ListState/MapState）后台存储，通过 Barrier 对齐的 Checkpoint 实现故障恢复与 exactly-once。
- **Window**：滚动、滑动、会话窗口；结合允许迟到（allowedLateness）与侧输出（sideOutput）处理迟到数据。

### 3.3 示例（事件时间滚动窗口）

```java
stream.assignTimestampsAndWatermarks(
        WatermarkStrategy.<Order>forBoundedOutOfOrderness(Duration.ofSeconds(5))
            .withTimestampAssigner((o, ts) -> o.getEventTime()))
    .keyBy(Order::getUserId)
    .window(TumblingEventTimeWindows.of(Time.minutes(1)))
    .aggregate(new SumAmount(), new ProcessWindowFunction<...> {...})
    .addSink(...);
```

### 3.4 精确一次与端到端

Flink 通过两阶段提交（TwoPhaseCommitSinkFunction）或事务性 sink（如 Kafka 事务、支持事务的 OLAP）实现端到端 exactly-once。Checkpoint 成功才算提交，失败回滚。

### 3.5 适用与局限

- 适用：实时数仓、实时风控、实时监控、CEP（复杂事件处理）。
- 局限：状态后端（RocksDB）调优有门槛；SQL 生态比 Spark 略弱（但持续改进）；团队学习曲线相对陡。

## 4. Kafka 与 Kafka Streams

Kafka 是分布式日志/消息总线，既是数据管道也是流处理的数据源与汇。Kafka Streams 是构建在 Kafka 之上的轻量流处理库（无需独立集群，嵌入应用）。

- **核心抽象**：Topic（分区、有序、可重放）、Consumer Group（并行消费）、Log Compaction（保留每个 key 最新值）。
- **Streams DSL**：提供 `map/filter/join/windowedBy` 等，适合"轻量实时转换 + 维表 join + 聚合"。
- **与 Flink 区别**：Kafka Streams 适合简单流转换、与 Kafka 深度绑定、运维简单；Flink 适合复杂有状态、多源 join、精确窗口语义。

## 5. 编排：Airflow 与 Dagster

### 5.1 Airflow

Airflow 用 Python 定义 DAG（有向无环图），每个节点是 Operator（BashOperator、PythonOperator、SparkSubmitOperator 等），调度器按依赖与时序触发。

```python
from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime, timedelta

with DAG("etl_daily", schedule="@daily",
         start_date=datetime(2024, 1, 1),
         default_args={"retries": 2, "retry_delay": timedelta(minutes=5)}) as dag:
    extract = PythonOperator(task_id="extract", python_callable=extract_fn)
    transform = PythonOperator(task_id="transform", python_callable=transform_fn)
    load = PythonOperator(task_id="load", python_callable=load_fn)
    extract >> transform >> load
```

特点：生态广、Operator 多、UI 成熟；但动态 DAG、强时序、重调度器是运维痛点。适合"定时批任务编排"。

### 5.2 Dagster

Dagster 强调"资产（Asset）"导向与可测试性，用 `@asset` 定义数据资产及其依赖，强调类型、IO 管理与可观测。理念比 Airflow 更现代，适合数据团队做资产化治理。

## 6. dbt：数据建模的 SQL 优先方案

dbt（data build tool）专注"转换（T）"这一层：用 SQL + Jinja 模板定义模型（model）、测试、文档，把原始表转换为语义清晰的 mart。它不移动数据，只在数据仓库内用 SQL 计算。

- **model**：一个 `.sql` 文件即一个模型，编译为 `CREATE TABLE/VIEW AS`。
- **ref()/source()**：声明依赖，dbt 自动解析 DAG。
- **test**：对字段做唯一/非空/关系测试，保障质量。
- **incremental**：增量模型，仅处理增量分区，控制成本。

dbt 常与 Snowflake/BigQuery/Redshift/ClickHouse 等云数仓搭配，是现代"ELT"中 T 层的事实标准。

## 7. 查询引擎：Trino / Presto

Trino（原 PrestoSQL）是分布式 SQL 查询引擎，支持跨数据源（Hive、MySQL、Kafka、对象存储）联邦查询，适合交互式分析（ad-hoc）。它"不存数据"，只负责把 SQL 下推/拉取并汇总，是数据中台的查询入口常客。

## 8. 典型组合架构

```
                 ┌──────────────┐
   业务库/日志 ──▶│   Kafka      │──▶ Flink(实时清洗/特征)
                 └──────────────┘         │
                                          ▼
                                     OLAP( ClickHouse/
                                          Doris )
   Airflow(每日) ──▶ Spark(离线回算/校正) ──▶ dbt(建模) ──▶ 数仓 mart
   Trino ── 跨源联邦查询 ──▶ BI / 即席分析
```

## 9. 选型速查

| 需求 | 首选 | 理由 |
|---|---|---|
| 离线大规模 ETL/SQL | Spark | 生态成熟、Catalyst 优化 |
| 实时流、精确窗口 | Flink | 事件时间 + 状态一致 |
| 轻量 Kafka 内转换 | Kafka Streams | 无独立集群、运维轻 |
| 定时批任务编排 | Airflow | 调度成熟、Operator 多 |
| 资产化数据治理 | Dagster | 测试性/类型化资产 |
| 数仓内建模(T) | dbt | SQL 优先、质量内建 |
| 交互式联邦查询 | Trino | 跨源、即席 |

## 10. 常见踩坑

1. **Flink 时间语义用错**：用处理时间导致乱序数据算错，应明确事件时间 + 合理 watermark 延迟。
2. **Spark 小文件/Shuffle 倾斜**：groupBy 热点 key 导致长尾，需加盐、广播 join、调整分区。
3. **Kafka 消费积压**：消费者能力不足或分区数不够，需扩分区 + 提升并行度，而非只加机器。
4. **Airflow DAG 动态生成陷阱**：在循环里动态生成 task 易出不可重现 DAG，应固定结构。
5. **dbt 全量刷新成本爆炸**：未设 incremental 导致每次重算全表，应按分区/增量设计。

## 11. 小结

数据处理生态没有"唯一正确答案"，而是按延迟、规模、团队能力组合：实时用 Flink、离线用 Spark、编排用 Airflow/Dagster、建模用 dbt、查询用 Trino。理解各项目的编程模型与一致性边界，比记住 benchmark 数字更重要。
