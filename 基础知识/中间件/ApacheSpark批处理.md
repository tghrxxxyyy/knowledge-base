# Apache Spark（批处理引擎 / 大数据计算）

> Spark 是大数据**批处理**的事实标准：基于内存的 DAG 引擎，比 MapReduce 快 10~100 倍。相比 Flink（流为主）、Hive（MapReduce on Tez），Spark 以**批流统一（Structured Streaming）+ 生态丰富（SQL/ML/Graph）+ 内存计算**成为大数据首选。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| MapReduce 慢 | 中间结果写磁盘，迭代计算（ML）极慢 |
| 批流割裂 | 离线 Spark + 实时 Flink 两套引擎 |
| 生态碎片化 | SQL/ML/Graph 各搞各的 API |
| 内存受限 | TB 级数据内存放不下 |

> 核心认知：**Spark = 内存计算 + DAG 调度 + 批流统一**——用内存换速度，用 DAG 优化执行。

---

## 二、Spark 核心原理

### 2.1 架构

```
Driver（驱动器）
  ├── SparkSession（入口）
  ├── DAG Scheduler（将 Job 切分为 Stage）
  ├── Task Scheduler（将 Stage 切分为 Task 调度到 Executor）
  └── Block Manager（块管理/缓存）

Executor（执行器）
  ├── Task（执行的最小单位）
  ├── Cache（内存缓存：persist/cache）
  └── Shuffle（跨节点数据重分配）

Cluster Manager（资源管理）
  ├── Standalone（Spark 自带）
  ├── YARN（Hadoop 生态）
  ├── Kubernetes（云原生）
  └── Mesos（少用）
```

### 2.2 核心抽象：RDD / DataFrame / Dataset

| 抽象 | 说明 | 性能 |
|------|------|------|
| RDD | 弹性分布式数据集（底层 API，类型不安全） | 中 |
| DataFrame | 命名列的分布式集合（DSL，Catalyst 优化） | 高 |
| Dataset | DataFrame + 类型安全（Scala/Java） | 高 |

**选型关注点**：生产几乎都用 **DataFrame/Dataset**（Catalyst 优化器自动优化），RDD 只在需要底层控制时用。

### 2.3 执行流程

```
1. 用户代码（DataFrame/Dataset 转换）
2. Catalyst 优化器
   ├── 解析 → 逻辑计划
   ├── 优化（谓词下推/列裁剪/常量折叠）
   → 优化的逻辑计划
3. 物理计划生成（选择 Join 策略/Shuffle 方式）
4. 代码生成（Whole-Stage Code Gen）→ 手写代码级别优化
5. DAG Scheduler → 按宽依赖切 Stage
6. Task Scheduler → 按数据本地性调度 Task
7. Executor 执行
```

**选型关注点**：Catalyst 优化器是 Spark 高性能的核心——自动谓词下推、列裁剪、Join 策略选择。

### 2.4 Shuffle（洗牌）

- **定义**：跨分区数据重分配（Join/GroupBy/OrderBy 触发）
- **代价**：网络传输 + 磁盘 IO + 排序
- **优化**：减少 Shuffle（broadcast join/预分区/Map 端预聚合）

**选型关注点**：Shuffle 是 Spark 最大性能瓶颈，减少 Shuffle 是第一优化原则。

### 2.5 内存管理

| 区域 | 说明 |
|------|------|
| Execution Memory | Shuffle/Join/Sort/Aggregation 的内存 |
| Storage Memory | cache/persist 的内存 |
| User Memory | 用户数据结构 |
| Reserved Memory | 系统预留（300MB） |

**选型关注点**：内存不足 → Spill 到磁盘（性能骤降），合理配置内存 + 减少 cache 是调优关键。

---

## 三、Spark 生态

| 组件 | 说明 |
|------|------|
| Spark SQL | 结构化数据查询（SQL + DataFrame API） |
| Spark Streaming | 微批流处理（DStream API） |
| Structured Streaming | 结构化流处理（DataFrame API，批流统一） |
| MLlib | 机器学习库（分类/回归/聚类/推荐） |
| GraphX | 图计算（PageRank/连通分量） |
| SparkR / PySpark | R/Python 接口 |

**选型关注点**：Structured Streaming 是 Spark 流处理的未来（与批处理统一 API），新项目推荐。

---

## 四、Spark vs Flink vs Hive vs Presto

| 维度 | Spark | Flink | Hive | Presto |
|------|-------|-------|------|--------|
| 处理模型 | 批（微批流） | 流（批是流的特例） | 批（MapReduce/Tez） | 批（MPP） |
| 延迟 | 秒（Structured Streaming） | 毫秒 | 分钟~小时 | 秒~分钟 |
| 吞吐 | 最高 | 高 | 高 | 中 |
| 内存 | 内存优先 | 内存+磁盘 | 磁盘 | 内存 |
| SQL | Spark SQL | Flink SQL | HiveQL | ANSI SQL |
| 流处理 | Structured Streaming | 原生流 | 不支持 | 不支持 |
| ML | MLlib | 无（需集成） | 无 | 无 |
| 生态 | 最丰富 | 丰富 | 丰富 | 中 |
| 交互查询 | 不支持（需 Spark Thrift） | 不支持 | 支持 | 支持 |

**选型关注点**：
- 离线批处理 + ML + SQL → **Spark**（生态最全）
- 实时流处理 → **Flink**
- 离线 SQL 报表 → **Spark SQL / Hive**
- 交互式 SQL 查询 → **Presto / Trino**
- 批流一体 → **Flink** 或 **Spark Structured Streaming**

---

## 五、Spark 生产部署

### 5.1 部署模式

| 模式 | 说明 |
|------|------|
| Standalone | Spark 自带集群管理 |
| YARN | 共享 Hadoop 集群 |
| Kubernetes | 云原生部署（主流趋势） |
| 托管服务 | AWS EMR / HDInsight / Dataproc / 阿里云 EMR |

### 5.2 关键调优

| 调优维度 | 建议 |
|----------|------|
| 并行度 | spark.sql.shuffle.partitions = 核心数 × 2~3 |
| 内存 | executor 内存 4~8GB，过多 GC 高 |
| 序列化 | Kryo 序列化（比 Java 快） |
| 数据本地性 | PROCESS_LOCAL > NODE_LOCAL > RACK_LOCAL |
| 广播 Join | 小表 < spark.sql.autoBroadcastJoinThreshold（默认 10MB） |
| 数据倾斜 | 加盐/Map Join/AQE |

### 5.3 AQE（Adaptive Query Execution，Spark 3.0+）

- **动态合并 Shuffle 分区**：自动减少小分区
- **动态切换 Join 策略**：运行时发现小表自动切 Broadcast Join
- **动态倾斜处理**：自动拆分倾斜分区

**选型关注点**：Spark 3.0+ 开启 AQE 是生产必备（大幅减少手动调优）。

---

## 六、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 离线批处理 | Spark | Hive/MapReduce |
| 实时流处理 | Flink | Spark Structured Streaming |
| SQL on Hadoop | Spark SQL | Hive/Presto |
| 交互式查询 | Presto/Trino | Spark Thrift |
| 机器学习 | Spark MLlib | Flink ML |
| 图计算 | Spark GraphX | Neo4j/JanusGraph |
| 批流一体 | Flink | Spark |
| 云原生部署 | Spark on K8s | — |

---

## 七、与其他板块的关系

- Flink（流处理对比）见「[Apache Flink 流处理](./ApacheFlink流处理.md)」；
- 大数据全链路见「[基础知识/大数据](../大数据/README.md)」；
- Hive（数据仓库）见「[基础知识/大数据](../大数据/README.md)」；
- 云上大数据见「[云上数仓与大数据生态](./云上数仓与大数据生态.md)」。

---

## 八、Spark 生产配置清单

### 8.1 spark-defaults.conf 关键配置

```properties
# 资源配置
spark.executor.instances=4
spark.executor.memory=8g
spark.executor.cores=4
spark.driver.memory=4g

# Shuffle 配置
spark.sql.shuffle.partitions=200
spark.sql.adaptive.enabled=true
spark.sql.adaptive.coalescePartitions.enabled=true

# 序列化
spark.serializer=org.apache.spark.serializer.KryoSerializer

# 内存
spark.memory.fraction=0.8
spark.memory.storageFraction=0.3
```

### 8.2 监控指标

```
Spark 关键指标：
  Job 成功/失败数
  Stage 执行时间
  Task 处理记录数
  Shuffle 读写量
  GC 时间占比
  内存使用（Execution/Storage）
```

### 8.3 常见问题排查

| 问题 | 原因 | 解决 |
|------|------|------|
| 数据倾斜 | Key 分布不均 | 加盐/两阶段聚合/Broadcast Join |
| OOM | 内存不足 | 增加 Executor 内存/减少 cache |
| Shuffle 慢 | 分区数太多/太少 | 调整 shuffle.partitions |
| GC 停顿 | 堆过大 | 减小 Executor 内存/用 G1GC |

---

## 九、Spark 性能调优清单

| 调优项 | 建议 |
|--------|------|
| 并行度 | shuffle.partitions = 核心数 × 2~3 |
| 序列化 | KryoSerializer（比 Java 快 10x） |
| 内存 | execution:storage = 7:3 |
| 广播 | 小表 < 10MB 自动广播 |
| 数据本地性 | PROCESS_LOCAL > NODE_LOCAL |

---

## 十、Spark SQL 常用语法

```sql
-- 创建数据源
CREATE TABLE spark_table (
  id INT,
  name STRING,
  ts TIMESTAMP
) USING parquet
LOCATION '/data/spark_table';

-- 窗口函数
SELECT id, name, 
  ROW_NUMBER() OVER (PARTITION BY id ORDER BY ts DESC) as rn
FROM spark_table;

-- 多表 JOIN
SELECT a.id, b.name
FROM table_a a
JOIN table_b b ON a.id = b.id;
```

---

## 十、Spark MLlib 常用算法

| 算法 | 说明 | 适用场景 |
|------|------|----------|
| LogisticRegression | 逻辑回归 | 二分类 |
| RandomForest | 随机森林 | 分类/回归 |
| GBTRegressor | 梯度提升树 | 回归 |
| KMeans | K 均值聚类 | 聚类 |
| ALS | 交替最小二乘 | 推荐系统 |

---

## 十一、Spark Streaming vs Structured Streaming

| 维度 | Spark Streaming（DStream） | Structured Streaming |
|------|---------------------------|----------------------|
| API | DStream（RDD） | DataFrame/Dataset |
| 处理模型 | 微批 | 微批（可调） |
| 容错 | RDD 血统 | WAL + Checkpoint |
| 事件时间 | 手动处理 | 原生支持 |
| SQL | 不支持 | 支持 |

---

## 十二、Spark on Kubernetes 部署

```yaml
# spark-submit 配置
spark-submit \
  --master k8s://https://k8s-master:6443 \
  --deploy-mode cluster \
  --name spark-job \
  --class com.example.Main \
  --conf spark.kubernetes.container.image=my-spark:latest \
  --conf spark.kubernetes.executor.instances=4 \
  --conf spark.kubernetes.executor.memory=8g \
  local:///opt/spark/jars/app.jar
```

---

> 一句话：**Spark = 内存计算 + DAG 调度 + Catalyst 优化 + 丰富生态（SQL/ML/Graph）；选型先看「计算类型（批→Spark，流→Flink）」，再定「规模（YARN/K8s/托管）」，最后开「AQE + 广播 Join + 减少 Shuffle」**。
