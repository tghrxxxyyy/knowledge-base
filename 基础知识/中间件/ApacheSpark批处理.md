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

## 七、Spark Catalyst 优化器内部原理

### 7.1 优化流程

```mermaid
graph TD
    A[SQL/API] --> B[解析器 Parser]
    B --> C[逻辑计划 Logical Plan]
    C --> D[分析器 Analyzer]
    D --> E[优化逻辑计划 Optimized Logical Plan]
    E --> F[物理计划生成 Planner]
    F --> G[物理计划 Physical Plan]
    G --> H[代码生成 Code Generation]
    H --> I[可执行 RDD]
```

### 7.2 四大优化阶段

| 阶段 | 说明 | 示例 |
|------|------|------|
| 解析 | SQL → 未解析逻辑计划 | `SELECT * FROM t WHERE id=1` |
| 分析 | 解析元数据（表/列） | 确认 `t` 表存在，`id` 列类型 |
| 优化 | 谓词下推/列裁剪/常量折叠 | `WHERE id=1` 下推到 Scan |
| 物理 | 选择 Join 策略/ Shuffle 方式 | Broadcast Join vs Sort Merge Join |

### 7.3 核心优化规则

| 优化 | 说明 |
|------|------|
| 谓词下推 | `WHERE` 条件推到数据源 |
| 列裁剪 | 只读取需要的列 |
| 常量折叠 | `1+2` 编译期计算为 `3` |
| 消除子查询 | 子查询 → Join/Union |
| Join 重排序 | 小表放左侧/广播 |

### 7.4 Whole-Stage Code Generation

```
传统执行：
  算子 A → 行化接口 → 算子 B → 行化接口 → 算子 C
  每步都有虚函数调用/缓存未命中

Whole-Stage Code Generation：
  算子 A + B + C 合并为一个 Stage
  生成单个 Java 函数（无虚调用）
  类似手写代码性能

示例：
  Filter → Project → Aggregate
  编译为：单个循环 + 累加器
  性能提升 2~10x
```

---

## 八、Tungsten 执行引擎

### 8.1 内存管理

```
Tungsten 内存管理：
  堆外内存（Off-Heap）：避免 GC
  二进制格式：数据紧凑存储
  缓存友好：数据布局优化

内存布局：
  8 字节对齐 → CPU 缓存行命中
  紧凑编码 → 减少内存占用
  指针跳转少 → 减少间接寻址
```

### 8.2 排序优化

| 优化 | 说明 |
|------|------|
| Unsafe 排序 | 堆外内存直接排序 |
| Prefix 排序 | 多列排序只比较前缀 |
| Radix Sort | 整数排序用基数排序 |
| Page-Based 排序 | 按页排序减少内存分配 |

### 8.3 缓存感知计算

```
数据结构对齐 CPU 缓存行（64 字节）：
  行数据紧凑存储（不像 Java 对象有对象头）
  嵌套循环 Join 优化：内表按缓存行对齐
  Hash 聚合：桶数对齐缓存行

性能提升：
  减少 CPU Cache Miss
  减少 TLB Miss
  提升内存带宽利用率
```

---

## 九、Spark Shuffle 深入

### 9.1 Shuffle 写入流程

```mermaid
graph TD
    A[Task 输出] --> B[Buffer 溢写]
    B --> C[Sort 按分区排序]
    C --> D[Spill 到磁盘]
    D --> E[Merge 合并文件]
    E --> F[通知下游 Task 位置]
```

### 9.2 Shuffle 读取流程

```mermaid
graph TD
    A[获取 Map 输出位置] --> B[远程/本地读取]
    B --> C[反序列化]
    C --> D[归并排序]
    D --> E[返回给 Task]
```

### 9.3 Shuffle 优化策略

| 优化 | 说明 | 配置项 |
|------|------|--------|
| Broadcast Join | 小表广播避免 Shuffle | `spark.sql.autoBroadcastJoinThreshold` |
| 预分区 | 提前按 Join Key 分区 | `repartition()` |
| Map 端聚合 | 预聚合减少 Shuffle 数据量 | `spark.sql.mapKeyDedupPolicy` |
| Sort-Based Shuffle | 替代 Hash Shuffle | `spark.shuffle.manager=sort` |
| 外部 Shuffle 服务 | 跨 Executor 读取 Shuffle 数据 | `spark.shuffle.service.enabled` |

### 9.4 Shuffle 调优参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `spark.sql.shuffle.partitions` | 200 | Shuffle 分区数 |
| `spark.shuffle.compress` | true | Shuffle 数据压缩 |
| `spark.shuffle.spill.compress` | true | 溢写数据压缩 |
| `spark.shuffle.file.buffer` | 32K | Shuffle 写缓冲 |
| `spark.reducer.maxSizeInFlight` | 48M | Shuffle 读缓冲 |

---

## 十、Spark on Kubernetes

### 10.1 部署架构

```mermaid
graph TD
    A[用户提交 Spark 任务] --> B[Spark Driver Pod]
    B --> C[申请 Executor Pod]
    C --> D[Executor Pod 1]
    C --> E[Executor Pod 2]
    C --> F[Executor Pod N]
    D --> G[本地磁盘 Shuffle]
    E --> G
    F --> G
```

### 10.2 配置示例

```bash
spark-submit \
  --master k8s://https://k8s-master:6443 \
  --deploy-mode cluster \
  --name spark-job \
  --class com.example.Main \
  --conf spark.kubernetes.container.image=my-spark:latest \
  --conf spark.kubernetes.executor.instances=4 \
  --conf spark.kubernetes.executor.memory=8g \
  --conf spark.kubernetes.executor.cores=4 \
  --conf spark.kubernetes.driver.memory=4g \
  --conf spark.kubernetes.authenticate.driver.serviceAccountName=spark \
  --conf spark.kubernetes.driver.podTemplateFile=driver-pod.yaml \
  --conf spark.kubernetes.executor.podTemplateFile=executor-pod.yaml \
  local:///opt/spark/jars/app.jar
```

### 10.3 K8s 部署关键配置

| 配置项 | 说明 |
|--------|------|
| `spark.kubernetes.container.image` | Docker 镜像 |
| `spark.kubernetes.executor.instances` | Executor 数量 |
| `spark.kubernetes.executor.deleteOnTermination` | 结束后删除 Pod |
| `spark.kubernetes.submission.waitAppCompletion` | 等待完成 |
| `spark.kubernetes.allocation.batch.size` | 批量申请 Pod 数 |

### 10.4 动态资源分配

```properties
spark.dynamicAllocation.enabled=true
spark.dynamicAllocation.minExecutors=2
spark.dynamicAllocation.maxExecutors=20
spark.dynamicAllocation.executorIdleTimeout=60s
spark.shuffle.service.enabled=true
```

---

## 十一、Spark Structured Streaming

### 11.1 核心概念

| 概念 | 说明 |
|------|------|
| Input Table | 无限输入表（流数据视为表） |
| Result Table | 查询结果表 |
| Output Mode | 输出方式（Append/Complete/Update） |
| Trigger | 触发间隔（Processing Time/Event Time） |
| Watermark | 处理延迟数据 |

### 11.2 Output Mode 对比

| Mode | 说明 | 适用 |
|------|------|------|
| Append | 新行追加 | 无聚合/窗口聚合 |
| Complete | 全部结果覆盖 | 聚合查询 |
| Update | 只更新行 | 聚合查询（非全量） |

### 11.3 使用示例

```python
# 读取 Kafka 流
df = spark.readStream \
    .format("kafka") \
    .option("kafka.bootstrap.servers", "localhost:9092") \
    .option("subscribe", "orders") \
    .load()

# 处理
result = df.selectExpr("CAST(value AS STRING)") \
    .groupBy(window("timestamp", "5 minutes"), "value") \
    .count()

# 写入
query = result.writeStream \
    .outputMode("complete") \
    .format("console") \
    .start()
```

### 11.4 Structured Streaming vs Flink

| 维度 | Structured Streaming | Flink |
|------|---------------------|-------|
| 处理模型 | 微批 | 真流 |
| 延迟 | 秒级 | 毫秒级 |
| API | DataFrame | DataStream/SQL |
| 状态管理 | 有限 | RocksDB |
| 事件时间 | 支持 | 支持 |
| 适用 | 批流统一 | 复杂流处理 |

---

## 十二、Spark AQE 深入

### 12.1 AQE 三大优化

| 优化 | 说明 | 效果 |
|------|------|------|
| 动态合并分区 | 自动合并小分区 | 减少 Task 数 |
| 动态切换 Join | 运行时发现小表切 Broadcast | 避免 Shuffle |
| 动态倾斜处理 | 自动拆分倾斜分区 | 均衡负载 |

### 12.2 配置项

```properties
# 开启 AQE
spark.sql.adaptive.enabled=true
spark.sql.adaptive.coalescePartitions.enabled=true
spark.sql.adaptive.skewJoin.enabled=true

# 合并分区阈值
spark.sql.adaptive.coalescePartitions.minPartitionNum=1
spark.sql.adaptive.coalescePartitions.targetPostShuffleInputSize=64MB

# 倾斜处理
spark.sql.adaptive.skewJoin.skewedPartitionFactor=5
spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes=256MB
```

### 12.3 AQE 工作原理

```
传统查询：
  编译期确定执行计划（静态）
  无法感知运行时数据分布

AQE：
  编译期生成多个可切换计划
  运行时采集统计信息
  动态调整执行计划
  Shuffle 后重新评估 Join 策略
  自动处理数据倾斜
```

---

## 十三、Spark 动态分区裁剪

### 13.1 原理

```
传统 JOIN：
  SELECT * FROM fact JOIN dim ON fact.id = dim.id
  → 全量扫描 fact 表

动态分区裁剪：
  编译期：识别 JOIN 中的等值条件
  运行时：dim 表的结果动态裁剪 fact 表分区
  → 只扫描相关分区

性能提升：
  分区数 × 裁剪比例 = 减少的扫描量
  通常提升 2~10x
```

### 13.2 触发条件

| 条件 | 说明 |
|------|------|
| JOIN 键 = 分区键 | 等值 JOIN 条件 |
| 分区表 | 目标表是分区表 |
| AQE 开启 | `spark.sql.adaptive.enabled=true` |

### 13.3 示例

```sql
-- 动态分区裁剪示例
SELECT * FROM sales s
JOIN products p ON s.product_id = p.product_id
WHERE p.category = 'electronics';

-- 传统：全量扫描 sales
-- 动态裁剪：只扫描 electronics 相关分区
```

---

## 十四、Spark vs Presto/Trino

| 维度 | Spark | Presto/Trino |
|------|-------|--------------|
| 处理模型 | 批处理（内存+磁盘） | MPP（纯内存） |
| 延迟 | 秒~分钟 | 秒 |
| 吞吐 | 最高 | 中 |
| SQL 标准 | Spark SQL | ANSI SQL |
| 生态 | 最丰富（SQL/ML/Graph） | 纯 SQL |
| 交互查询 | 不支持（需 Thrift） | 支持 |
| 内存 | 磁盘可溢写 | 纯内存（OOM 风险） |
| 适用 | 离线批处理/ML | 交互式 SQL 查询 |

**选型决策**：
- 交互式查询/BI 报表 → Presto/Trino
- 离线批处理/ML → Spark
- 大规模 ETL → Spark
- Ad-hoc 查询 → Presto/Trino

---

## 十四-2、AQE 自适应查询执行三阶段

### Stage 1：Shuffle 后动态合并分区

```
传统：编译期固定 200 个 Shuffle 分区
AQE：运行时根据数据量合并小分区

触发条件：
  spark.sql.adaptive.coalescePartitions.enabled=true
  targetPostShuffleInputSize=64MB（每个分区目标大小）

效果：小分区合并后减少 Task 数，避免资源浪费
```

### Stage 2：动态切换 Join 策略

```
运行时发现某表实际很小 → 自动切 Broadcast Join
无需预估表大小，避免手动调参

触发条件：
  spark.sql.adaptive.localShuffleReader.enabled=true
```

### Stage 3：动态倾斜处理（Skew Join）

```
检测到某分区数据量远大于其他 → 自动拆分倾斜分区

原理：
  1. 统计各分区数据量
  2. 识别倾斜分区（数据量 > 中位数 × skewFactor）
  3. 将倾斜分区拆分为多个子分区
  4. 子分区独立处理，避免单 Task 过载

配置：
  spark.sql.adaptive.skewJoin.enabled=true
  spark.sql.adaptive.skewJoin.skewedPartitionFactor=5
  spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes=256MB
```

## 十四-3、Shuffle 外部排序器内存管理

```
UnsafeExternalSorter = Spark 的 Shuffle 写入排序器

内存管理：
  1. 首次使用堆内内存（On-Heap）
  2. 内存不足 → Spill 到磁盘（溢写）
  3. 多次溢写 → Merge 合并文件

排序优化：
  Prefix Sort：多列排序只比较前缀（减少比较次数）
  Radix Sort：整数排序用基数排序（O(n) 复杂度）
  Page-Based：按页排序减少内存分配

监控指标：
  shuffle_spill_count：溢写次数（突增=内存不足）
  shuffle_spill_disk_size：溢写磁盘大小
```

## 十四-4、Broadcast Join 触发阈值与副作用

```
触发条件：
  表大小 < spark.sql.autoBroadcastJoinThreshold（默认 10MB）
  AQE 开启时可动态切换

副作用：
  1. Driver 收集全表数据 → Driver 内存压力大
  2. 全量广播到所有 Executor → 网络开销
  3. 大表 Join 小表时如果阈值设错 → 全量广播 OOM

最佳实践：
  小表 < 10MB → Broadcast Join（最优）
  小表 10~100MB → 按内存评估是否广播
  小表 > 100MB → Sort-Merge Join

代码控制：
  spark.conf.set("spark.sql.autoBroadcastJoinThreshold", "50m")
  // 或 SQL 强制广播
  SELECT /*+ BROADCAST(dim) */ * FROM fact JOIN dim ON ...
```

## 十五、Spark on K8s Driver/Executor Pod 资源分配公式

```
资源分配公式：

Executor Pod：
  CPU = spark.executor.cores（如 4）
  Memory = spark.executor.memory（如 8G）
  JVM 堆 = memory × 0.75（约 6G）
  Off-Heap = memory × 0.25（约 2G）
  Pod Request = CPU + Memory

Driver Pod：
  CPU = spark.driver.cores（如 2）
  Memory = spark.driver.memory（如 4G）
  Driver 通常比 Executor 小

总资源 = Driver 内存 + Executor 数 × Executor 内存
  如 1 Driver(4G) + 4 Executor(8G) = 36G

K8s 资源请求/限制：
  resources.requests：调度依据（保证最低资源）
  resources.limits：硬限制（超限 OOM Kill）
  建议 requests ≈ limits（避免资源竞争）
```

## 十五-2、Spark 历史服务器排查

```
排查流程：
  1. 启动 History Server
     spark-history-server.sh start

  2. 访问 Web UI
     http://history-server:18080

  3. 查看关键信息：
     Job 执行时间（哪个 Stage 慢）
     Shuffle 读写量（数据倾斜）
     Task 处理记录数（是否分布不均）
     GC 时间（GC 停顿频繁）
     失败 Task（异常原因）

  4. 常见排查点：
     某 Stage 耗时远超其他 → 数据倾斜
     Task 处理时间差异大 → 分区不均
     Shuffle 写量突增 → 数据膨胀
     GC 占比 > 10% → 调整内存/GC
```

## 十六、AQE 自适应查询执行三阶段详解

### 16.1 Stage 1：Shuffle 后动态合并分区（Coalesce Partitions）

```
传统模式：编译期固定 200 个 Shuffle 分区（spark.sql.shuffle.partitions=200）
问题：数据量小时 200 个分区产生大量空/小分区，Task 启动开销占比过高

AQE 动态合并：
  触发条件：spark.sql.adaptive.coalescePartitions.enabled=true
  执行时机：Shuffle 完成后、下一 Stage 执行前
  合并策略：按 targetPostShuffleInputSize（默认 64MB）合并相邻小分区
  
  效果示例：
    原始：200 个分区，每个平均 5MB → 1000MB 总数据
    合并后：约 16 个分区，每个 64MB → Task 数从 200 降到 16
    Task 启动开销节省：200×50ms = 10s → 16×50ms = 0.8s

配置项：
  spark.sql.adaptive.coalescePartitions.minPartitionNum=1    # 最少分区数
  spark.sql.adaptive.coalescePartitions.targetPostShuffleInputSize=64MB
  spark.sql.adaptive.coalescePartitions.initialPartitionNum=200  # 初始分区数
```

| 场景 | 合并效果 | 调优建议 |
|------|---------|---------|
| 小表 Join | 大量空分区被合并 | 开启 AQE 即可 |
| 数据倾斜 | 合并后仍可能倾斜 | 配合 skewJoin |
| 动态分区表 | 分区数不可预测 | targetPostShuffleInputSize 按数据量调整 |

### 16.2 Stage 2：动态切换 Join 策略

```
传统问题：编译期基于统计信息估算表大小，可能误判
  如：维表实际 5MB，但统计信息过期显示 500MB → Sort-Merge Join（慢）

AQE 动态切换：
  执行时机：Shuffle 完成后重新评估表大小
  切换条件：某表实际大小 < spark.sql.autoBroadcastJoinThreshold
  效果：自动从 Sort-Merge Join 切换为 Broadcast Join
  
  流程：
    Stage 1 完成 → 统计 Shuffle 数据量
    → 发现 dim 表实际 5MB < 10MB 阈值
    → 重新生成物理计划：Broadcast Join
    → Stage 2 用 Broadcast Join 执行（无需 Shuffle）

配置项：
  spark.sql.adaptive.localShuffleReader.enabled=true  # 允许本地 Shuffle 读
  spark.sql.autoBroadcastJoinThreshold=10MB           # 广播阈值
```

### 16.3 Stage 3：动态倾斜处理（Skew Join）

```
数据倾斜：某个 Key 的数据量远超其他 Key → 单 Task 处理数据过多 → 瓶颈

AQE 倾斜检测与处理：
  1. Shuffle 后统计各分区数据量
  2. 识别倾斜分区：数据量 > 中位数 × skewedPartitionFactor（默认 5）
     且数据量 > skewedPartitionThresholdInBytes（默认 256MB）
  3. 将倾斜分区拆分为多个子分区（如 1 个大分区 → 4 个小分区）
  4. 子分区独立处理，避免单 Task 过载

配置项：
  spark.sql.adaptive.skewJoin.enabled=true
  spark.sql.adaptive.skewJoin.skewedPartitionFactor=5
  spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes=256MB

效果：
  原始：1 个 Task 处理 2GB 倾斜数据 → 耗时 10 分钟
  拆分后：4 个 Task 各处理 500MB → 耗时 2.5 分钟
```

## 十七、Shuffle 内存管理与 Spill 策略

### 17.1 UnsafeExternalSorter 内存管理

```
UnsafeExternalSorter = Spark Shuffle 写入的核心排序器

内存使用流程：
  1. 首次分配堆内内存（On-Heap），用于排序和缓冲
  2. 内存不足时 Spill 到磁盘（溢写）
  3. 多次溢写后 Merge 合并所有溢写文件

Spill 触发条件：
  当前使用内存 > 申请的内存页（Page）数量 × 页大小
  页大小由 spark.shuffle.spill.initialBufferSize 控制（默认 1MB）

Spill 策略：
  ① 排序后溢写（Sorted Spill）：先按分区排序再写磁盘
  ② 直接溢写（Unsorted Spill）：内存满直接写（性能差，少用）
  
排序优化：
  Prefix Sort：多列排序只比较前缀字节，减少比较次数
  Radix Sort：整数排序用基数排序，O(n) 复杂度
  Page-Based：按页排序减少内存分配次数

监控指标：
  shuffle_spill_count：溢写次数（突增 = 内存不足）
  shuffle_spill_disk_size：溢写磁盘总大小
  shuffle_spill_memory_size：溢写时内存占用
```

### 17.2 内存配置调优

| 参数 | 默认值 | 说明 | 调优建议 |
|------|--------|------|---------|
| `spark.memory.fraction` | 0.6 | Execution+Storage 占堆比例 | 数据密集调到 0.8 |
| `spark.memory.storageFraction` | 0.5 | Storage 占 Execution+Storage 的比例 | cache 多调大 |
| `spark.shuffle.spill.initialBufferSize` | 1MB | 溢写初始缓冲 | 排序密集调大 |
| `spark.shuffle.sort.bypassMergeThreshold` | 400 | 分区数少于该值跳过排序 | 小分区多可调大 |

## 十八、Broadcast Join 触发条件与副作用详解

### 18.1 触发条件

```
自动触发：
  表大小 < spark.sql.autoBroadcastJoinThreshold（默认 10MB）
  AQE 开启时可运行时动态切换

手动强制：
  SQL Hint：SELECT /*+ BROADCAST(dim) */ * FROM fact JOIN dim ON ...
  代码设置：spark.conf.set("spark.sql.autoBroadcastJoinThreshold", "50m")

判断依据：
  表的统计信息（大小、行数）来自 Catalog
  未 ANALYZE TABLE 的表可能统计信息缺失 → 不触发广播
```

### 18.2 副作用与风险

| 副作用 | 说明 | 防范措施 |
|--------|------|---------|
| Driver 内存压力 | Driver 收集全表数据，大表会 OOM | 阈值不要设太大 |
| 网络开销 | 全量广播到所有 Executor | 内网环境可接受 |
| 序列化开销 | 大表序列化/反序列化耗时 | 大表慎用 |
| 统计信息不准 | 未 ANALYZE 导致误判 | 定期 ANALYZE TABLE |
| AQE 误切换 | 运行时数据量与编译期差异大 | 监控 Join 策略切换日志 |

### 18.3 最佳实践

```
小表 < 10MB：放心广播（最优）
小表 10~100MB：评估内存和网络后决定
小表 > 100MB：不用广播，走 Sort-Merge Join

生产建议：
  定期 ANALYZE TABLE 更新统计信息
  监控 broadcastHashJoin 算子使用情况
  大表 Join 小表场景优先考虑广播
  多表 Join 时注意广播顺序（小表先广播）
```

## 十九、Spark on K8s 资源分配公式

### 19.1 Executor Pod 资源计算

```
Executor Pod 资源分配：

  CPU：
    spark.executor.cores = 每个 Executor 的 CPU 核数
    Pod requests.cpu = executor.cores（保证调度）
    Pod limits.cpu = executor.cores × 1.5（允许突发）
    建议：CPU 密集型 = 物理核数/2，IO 密集型 = 物理核数

  内存：
    spark.executor.memory = Executor 总内存
    JVM 堆 = memory × 0.75（约 75%）
    Off-Heap = memory × 0.25（约 25%）
    Pod requests.memory = executor.memory + 1GB（系统开销）
    Pod limits.memory = executor.memory + 2GB

  计算公式：
    总资源 = Driver 内存 + Executor 数 × Executor 内存
    如：1 Driver(4G) + 4 Executor(8G) = 36G
    K8s 节点数 = 总资源 / 单节点可分配资源
```

### 19.2 Driver Pod 资源计算

```
Driver Pod 资源分配：

  spark.driver.memory = Driver 内存（通常 2~8GB）
  spark.driver.cores = Driver CPU 核数（通常 1~2）
  
  Driver 通常比 Executor 小：
    Driver 只做调度和状态维护
    重计算在 Executor 上执行
    
  特殊场景需加大 Driver：
    collect() 收集大量数据到 Driver
    broadcast 广播大表
    UDF 中在 Driver 做全局操作
```

### 19.3 K8s 资源请求/限制策略

| 策略 | requests | limits | 适用场景 |
|------|----------|--------|---------|
| 保证型 | CPU=实际值 | CPU=实际值 | 稳定负载 |
| 弹性型 | CPU=实际值×0.5 | CPU=实际值×2 | 波动负载 |
| 混合型 | CPU=实际值 | CPU=实际值×1.5 | 推荐 |

```
resources:
  requests:
    cpu: "4"        # 保证 4 核
    memory: "8Gi"   # 保证 8G
  limits:
    cpu: "6"        # 最多用 6 核
    memory: "10Gi"  # 最多用 10G（超限 OOM Kill）
```

## 二十、Spark 历史服务器排查步骤

```
排查流程（History Server）：

  Step 1：启动 History Server
    spark-history-server.sh start
    访问 http://history-server:18080

  Step 2：定位问题 Job
    找到耗时异常的 Job → 点击进入 Stage 列表

  Step 3：分析 Stage
    查看各 Stage 耗时 → 找到最慢的 Stage
    查看 Task 处理记录数 → 是否分布不均（数据倾斜）
    查看 Shuffle 读写量 → 是否数据膨胀

  Step 4：分析 Task
    查看 Task 处理时间分布 → 是否有长尾
    查看 GC 时间占比 → >10% 需调优内存
    查看失败 Task → 异常原因（OOM/网络/磁盘）

  Step 5：常见问题定位
    某 Stage 耗时远超其他 → 数据倾斜
    Task 处理时间差异大 → 分区不均
    Shuffle 写量突增 → 数据膨胀
    GC 占比 > 10% → 调整内存/GC
    Shuffle 读超时 → 网络/磁盘瓶颈
```

### 20.1 关键排查指标

| 指标 | 正常范围 | 异常处理 |
|------|---------|---------|
| Task 处理时间差异 | <2x | 加盐/两阶段聚合 |
| GC 时间占比 | <5% | 调小 Executor 内存/换 G1GC |
| Shuffle 写量 | 稳定 | 检查是否有数据膨胀 |
| Spill 次数 | 0 或很少 | 增加 Executor 内存 |
| Shuffle 读延迟 | <5s | 检查网络/磁盘 IO |

## 二十一、Spark 调优检查清单

| 调优项 | 检查点 | 优先级 |
|--------|--------|--------|
| AQE 开启 | spark.sql.adaptive.enabled=true | P0 |
| 广播阈值 | spark.sql.autoBroadcastJoinThreshold 合理 | P0 |
| 并行度 | spark.sql.shuffle.partitions = 核心数×2~3 | P0 |
| 序列化 | KryoSerializer（比 Java 快 10x） | P1 |
| 内存分配 | execution:storage = 7:3 | P1 |
| 数据本地性 | PROCESS_LOCAL > NODE_LOCAL | P1 |
| GC 调优 | G1GC + 合理堆大小 | P1 |
| Shuffle 压缩 | spark.shuffle.compress=true | P2 |
| 动态资源分配 | spark.dynamicAllocation.enabled=true | P2 |
| 磁盘 IO | 多磁盘分散 Shuffle 写入 | P2 |
| 数据倾斜 | 加盐/两阶段聚合/Broadcast Join | P0 |
| 小文件治理 | 合并小分区/文件 | P1 |

## 二十二、Spark on Kubernetes 部署模式

### 部署模式对比

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| Client | Driver 在客户端 | 调试 |
| Cluster | Driver 在集群 | 生产 |
| K8s Native | 原生 K8s 调度 | 云原生 |

### K8s 部署配置

```bash
spark-submit \
  --master k8s://https://k8s-master:6443 \
  --deploy-mode cluster \
  --name spark-etl \
  --class com.example.ETLJob \
  --conf spark.kubernetes.container.image=spark:3.5.0 \
  --conf spark.kubernetes.namespace=spark-jobs \
  --conf spark.kubernetes.authenticate.driver.serviceAccountName=spark \
  --conf spark.kubernetes.driver.request.cores=2 \
  --conf spark.kubernetes.executor.instances=10 \
  --conf spark.kubernetes.executor.request.cores=4 \
  --conf spark.kubernetes.executor.memory=8g \
  local:///opt/spark/jars/etl-job.jar
```

## 二十三、动态资源分配（Dynamic Allocation）

### 动态分配配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| spark.dynamicAllocation.enabled | false | 启用动态分配 |
| spark.shuffle.service.enabled | true | 外部 Shuffle 服务 |
| spark.dynamicAllocation.minExecutors | 0 | 最小 Executor |
| spark.dynamicAllocation.maxExecutors | ∞ | 最大 Executor |
| spark.dynamicAllocation.executorIdleTimeout | 60s | 空闲超时 |
| spark.dynamicAllocation.schedulerBacklogTimeout | 1s | 调度积压超时 |

### 动态分配调优

```
动态分配策略：
  1. 启用外部 Shuffle 服务（避免 Executor 退出丢失 Shuffle 数据）
  2. 设置合理的最小/最大 Executor 数
  3. 调整空闲超时时间
  4. 监控 Executor 数量变化

监控指标：
  activeExecutors：活跃 Executor 数
  idleExecutors：空闲 Executor 数
  pendingTasks：等待任务数
  shuffleBytesWritten：Shuffle 写入量
```

## 二十四、推测执行（Speculative Execution）

### 推测执行配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| spark.speculation | false | 启用推测执行 |
| spark.speculation.multiplier | 3 | 倍数 |
| spark.speculation.quantile | 0.9 | 分位数 |
| spark.speculation.interval | 100ms | 检查间隔 |

### 推测执行策略

```
推测执行原理：
  1. 持续监控任务进度
  2. 如果任务进度落后于中位数的 N 倍
  3. 启动一个相同的任务副本
  4. 先完成的任务结果生效
  5. 另一个任务被取消

适用场景：
  数据倾斜（部分任务慢）
  网络抖动（偶发慢任务）
  磁盘 IO 不均（部分节点慢）

不适用场景：
  CPU 密集型（双倍 CPU 消耗）
  网络带宽瓶颈（双倍网络）
```

## 二十五、Spark History Server 配置

### History Server 配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| spark.eventLog.enabled | true | 启用事件日志 |
| spark.eventLog.dir | hdfs://... | 事件日志目录 |
| spark.eventLog.compress | true | 压缩事件日志 |
| spark.history.fs.logDirectory | hdfs://... | History 日志目录 |
| spark.history.ui.port | 18080 | History UI 端口 |

### History Server 启动

```bash
# 启动 History Server
$SPARK_HOME/sbin/start-history-server.sh

# 停止 History Server
$SPARK_HOME/sbin/stop-history-server.sh

# 配置 yarn 模式
export SPARK_HISTORY_OPTS="-Dspark.history.fs.logDirectory=hdfs:///spark-logs -Dspark.history.ui.port=18080"
```

## 二十六、Spark 3.x 新特性

### Spark 3.x 关键特性

| 特性 | 说明 |
|------|------|
| Adaptive Query Execution (AQE) | 自适应查询执行 |
| Dynamic Partition Pruning | 动态分区裁剪 |
| Join Hints | Join 提示 |
| Z-Ordering | 数据聚簇 |
| Structured Streaming UI | 流处理 UI |
| Arrow 集成增强 | 向量化执行 |

### AQE 配置

```scala
// 启用 AQE
spark.conf.set("spark.sql.adaptive.enabled", true)
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", true)
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", true)
spark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionFactor", 5)
spark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes", 256 * 1024 * 1024)
```

## 二十七、Spark SQL 优化最佳实践

### SQL 优化策略

| 策略 | 说明 |
|------|------|
| 广播 Join | 小表广播避免 Shuffle |
| 分区剪裁 | 只读取需要的分区 |
| 列式存储 | 使用 Parquet/ORC |
| 列剪裁 | 只读取需要的列 |
| 谓词下推 | 过滤条件下推到数据源 |
| Join 重排 | 避免笛卡尔积 |

### SQL 优化示例

```sql
-- 启用 AQE 自动优化
SET spark.sql.adaptive.enabled=true;

-- 广播 Hint
SELECT /*+ BROADCAST(small_table) */ *
FROM large_table JOIN small_table ON large_table.id = small_table.id;

-- 分区剪裁
SELECT * FROM events WHERE date = '2024-01-01';

-- 列剪裁
SELECT id, name FROM users WHERE age > 18;

-- 谓词下推（自动）
SELECT * FROM parquet_table WHERE date = '2024-01-01';
```

## 二十八、Spark Shuffle 优化

### Shuffle 优化参数

| 参数 | 默认值 | 说明 | 建议值 |
|------|--------|------|--------|
| spark.sql.shuffle.partitions | 200 | Shuffle 分区数 | 根据数据量调整 |
| spark.shuffle.compress | true | 压缩 Shuffle 数据 | true |
| spark.shuffle.spill.compress | true | 压缩溢写数据 | true |
| spark.reducer.maxSizeInFlight | 48m | Reducer 缓冲区 | 64~128m |
| spark.shuffle.file.buffer | 32k | Shuffle 文件缓冲 | 64~128k |

### Shuffle 分区数计算

```
Shuffle 分区数 = 数据量 / 单分区大小
  推荐单分区大小：128MB~256MB

  示例：100GB 数据 / 256MB = 400 分区

  过小：过多小文件，IO 开销大
  过大：单分区数据量大，内存溢出
```

## 二十九、Spark 内存管理

### 内存布局

```
Executor 内存布局：
  ├── Reserved Memory（300MB）
  ├── User Memory（(1-0.4) * 可用内存）
  └── Storage Memory（0.4 * 可用内存）
      ├── Unroll Memory
      ├── Broadcast 变量
      └── 缓存数据
```

### 内存配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| spark.executor.memory | 1g | Executor 内存 |
| spark.executor.memoryOverhead | 384m | 额外内存（堆外） |
| spark.memory.fraction | 0.6 | 执行+存储内存比例 |
| spark.memory.storageFraction | 0.5 | 存储内存比例 |

### 内存溢出处理

```
内存溢出类型：
  1. OOM（堆内）：数据量超过 Executor 内存
  2. OOM（堆外）：Netty/Arrow 内存不足
  3. Shuffle 溢写：Shuffle 数据写磁盘
  4. 缓存溢写：缓存数据写磁盘

解决方案：
  1. 增加 Executor 内存
  2. 增加分区数（减小单分区数据量）
  3. 启用堆外内存
  4. 使用列式存储（Parquet）
```

## 三十、Spark 常见问题排查

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 数据倾斜 | 分区键分布不均 | 加盐/repartition |
| OOM | 数据量过大 | 增加内存/分区数 |
| Shuffle 超时 | 网络/IO 瓶颈 | 增加分区数/优化 Join |
| GC 频繁 | 内存不足 | 调整内存参数 |
| 数据丢失 | Shuffle 网络抖动 | 启用外部 Shuffle 服务 |
| 任务挂起 | 资源不足 | 增加 Executor/调整配置 |

### 问题排查流程

```
问题排查：
  1. 查看 Spark UI（任务/阶段/Shuffle）
  2. 检查 Executor 日志（OOM/异常）
  3. 分析 DAG（Stage 划分/数据倾斜）
  4. 检查资源使用（CPU/内存/IO）
  5. 优化配置（分区数/内存/并行度）
```

## 二十二、与其他板块的关系

- Flink（流处理对比）见「[Apache Flink 流处理](./ApacheFlink流处理.md)」；
- 大数据全链路见「[基础知识/大数据](../大数据/README.md)」；
- Hive（数据仓库）见「[基础知识/大数据](../大数据/README.md)」；
- 云上大数据见「[云上数仓与大数据生态](./云上数仓与大数据生态.md)」。

---

## 二十三、Shuffle 管理

### Shuffle 架构

```mermaid
graph TB
    subgraph Map
        M1[Map Task 1]
        M2[Map Task 2]
        M3[Map Task 3]
    end
    subgraph Shuffle
        S1[Shuffle Write]
        S2[Shuffle Read]
        S3[Sort/Merge]
    end
    subgraph Reduce
        R1[Reduce Task 1]
        R2[Reduce Task 2]
    end
    M1 --> S1
    M2 --> S1
    M3 --> S1
    S1 --> S2
    S2 --> S3
    S3 --> R1
    S3 --> R2
    style S1 fill:#ffcc99
    style S2 fill:#99ccff
    style S3 fill:#99ff99
```

### Shuffle 调优参数

| 参数 | 默认值 | 推荐值 | 说明 |
|------|--------|--------|------|
| spark.sql.shuffle.partitions | 200 | 数据量/128MB | 分区数 |
| spark.shuffle.compress | true | true | 压缩 |
| spark.shuffle.spill.compress | true | true | 溢出压缩 |
| spark.reducer.maxSizeInFlight | 48m | 96m | 读缓冲 |
| spark.shuffle.file.buffer | 32k | 64k | 写缓冲 |

---

## 二十四、数据倾斜处理

### 倾斜检测

```sql
-- 检测数据倾斜
SELECT key, COUNT(*) as cnt
FROM data
GROUP BY key
ORDER BY cnt DESC
LIMIT 10;

-- 输出示例：
-- key    | cnt
-- -------+-------
-- normal | 1000
-- skew   | 1000000  -- 倾斜key
```

### 倾斜解决方案

| 方案 | 说明 | 适用场景 |
|------|------|----------|
| Salting | 加盐分散key | 倾斜不严重 |
| 两阶段聚合 | 先局部聚合 | 可聚合场景 |
| 广播Join | 小表广播 | 大小表Join |
| 自适应合并 | AQE自动处理 | Spark 3.0+ |

### Salting 实现

```python
# Salting 处理数据倾斜
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("skew").getOrCreate()

# 添加随机后缀
df_with_salt = df.withColumn(
    "salted_key",
    F.concat(col("key"), F.lit("_"), (F.rand() * 10).cast("int"))
)

# 第一次聚合（局部）
partial_agg = df_with_salt.groupBy("salted_key").agg(F.sum("value").alias("partial_sum"))

# 第二次聚合（全局）
final_agg = partial_agg.withColumn(
    "original_key",
    F.split(col("salted_key"), "_")[0]
).groupBy("original_key").agg(F.sum("partial_sum").alias("total_sum"))
```

---

## 二十五、推测执行

### 推测执行原理

```mermaid
graph TB
    A[任务提交] --> B{检测慢任务}
    B -->|是| C[启动推测任务]
    B -->|否| D[正常执行]
    C --> E[两个任务同时执行]
    E --> F[先完成的结果]
    D --> G[结果输出]
    style C fill:#ffcc99
    style E fill:#99ccff
```

### 推测执行配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| spark.speculation | false | 启用推测 |
| spark.speculation.interval | 100ms | 检测间隔 |
| spark.speculation.multiplier | 1.5 | 倍数阈值 |
| spark.speculation.quantile | 0.75 | 分位数 |

---

## 二十六、Spark on K8s

### K8s 部署架构

```mermaid
graph TB
    subgraph K8s
        M[Master]
        W1[Worker Pod 1]
        W2[Worker Pod 2]
        W3[Worker Pod 3]
    end
    subgraph 资源
        R1[CPU]
        R2[Memory]
        R3[GPU]
    end
    M --> W1
    M --> W2
    M --> W3
    W1 --> R1
    W1 --> R2
    W2 --> R1
    W2 --> R3
    style M fill:#99ccff
    style W1 fill:#99ff99
    style W2 fill:#99ff99
    style W3 fill:#99ff99
```

### K8s 部署命令

```bash
# 提交Spark应用到K8s
spark-submit \\
  --master k8s://https://kubernetes:6443 \\
  --deploy-mode cluster \\
  --name my-spark-app \\
  --class com.example.Main \\
  --conf spark.kubernetes.container.image=my-spark:latest \\
  --conf spark.kubernetes.authenticate.driver.serviceAccountName=spark \\
  --conf spark.dynamicAllocation.enabled=true \\
  --conf spark.dynamicAllocation.shuffleTracking.enabled=true \\
  local:///opt/spark/examples/jars/spark-examples.jar
```

---

## 二十七、动态资源分配

### 动态分配原理

| 参数 | 默认值 | 说明 |
|------|--------|------|
| spark.dynamicAllocation.enabled | false | 启用动态分配 |
| spark.dynamicAllocation.minExecutors | 0 | 最小Executor |
| spark.dynamicAllocation.maxExecutors | ∞ | 最大Executor |
| spark.dynamicAllocation.initialExecutors | 0 | 初始Executor |
| spark.dynamicAllocation.executorIdleTimeout | 60s | 空闲超时 |

### Shuffle Tracking

```yaml
# 启用Shuffle Tracking
spark:
  dynamicAllocation:
    enabled: true
    shuffleTracking:
      enabled: true
      timeout: 3600s
```

---

## 二十八、Spark History Server

### History Server 配置

```properties
# spark-defaults.conf
spark.eventLog.enabled=true
spark.eventLog.dir=hdfs:///spark-logs
spark.history.fs.logDirectory=hdfs:///spark-logs
spark.history.ui.port=18080
spark.history.retainedApplications=50
spark.history.fs.cleaner.enabled=true
spark.history.fs.cleaner.interval=1d
spark.history.fs.cleaner.maxAge=7d
```

### History Server 启动

```bash
# 启动History Server
$SPARK_HOME/sbin/start-history-server.sh

# 停止History Server
$SPARK_HOME/sbin/stop-history-server.sh
```

---

## 二十九、Spark 3.x 新特性

### 新特性概览

| 特性 | 说明 | 适用场景 |
|------|------|----------|
| AQE | 自适应查询执行 | 动态优化 |
| Dynamic Partition Pruning | 动态分区裁剪 | Join优化 |
| Structured Streaming UI | 流处理UI | 监控 |
| Vectorized UDF | 向量化UDF | 性能提升 |
| CDC Support | CDC支持 | 数据同步 |

### AQE 配置

```properties
spark.sql.adaptive.enabled=true
spark.sql.adaptive.coalescePartitions.enabled=true
spark.sql.adaptive.skewJoin.enabled=true
spark.sql.adaptive.skewJoin.skewedPartitionFactor=5
spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes=256m
```

---

## 三十、广播 Join

### 广播 Join 原理

```mermaid
graph TB
    subgraph 大表
        L1[分片1]
        L2[分片2]
        L3[分片3]
    end
    subgraph 小表广播
        S[小表]
    end
    subgraph 执行
        E1[每个分片join小表]
    end
    L1 --> E1
    L2 --> E1
    L3 --> E1
    S --> E1
    style S fill:#ffcc99
    style E1 fill:#99ff99
```

### 广播 Join 配置

```sql
-- SQL广播Hint
SELECT /*+ BROADCAST(dim) */ *
FROM fact
JOIN dim ON fact.id = dim.id;

-- 配置广播阈值
spark.sql.autoBroadcastJoinThreshold=10m
```

---

## 三十一、Spark 调优清单

### 调优检查项

| 检查项 | 检查方法 | 优化方向 |
|--------|----------|----------|
| 数据倾斜 | 查看Stage时长 | Salting/AQE |
| Shuffle过多 | 查看Shuffle写量 | 减少Shuffle |
| 分区不合理 | 查看分区大小 | 调整分区数 |
| 内存溢出 | 查看GC日志 | 增加内存 |
| 序列化慢 | 查看序列化时间 | Kryo优化 |

### 调优脚本

```python
# Spark性能监控
from pyspark import SparkContext

def monitor_job(sc):
    # 获取Job信息
    status = sc.statusTracker()
    
    # 获取Stage信息
    for stage_id in status.getStageIds():
        stage_info = status.getStageInfo(stage_id)
        print(f"Stage {stage_id}: {stage_info.numTasks} tasks, "
              f"{stage_info.executorRunTime}ms runtime")
    
    # 获取Executor信息
    for executor_id, info in status.getExecutorInfos().items():
        print(f"Executor {executor_id}: {info.host}, "
              f"{info.maxMemory} max memory")
```

---

## 三十二、Spark 监控与告警

### 监控指标

| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| Job执行时间 | Job总时长 | >预期2倍 |
| Stage失败数 | 失败Stage数 | >0 |
| Shuffle溢出 | Shuffle溢出量 | >0 |
| GC时间占比 | GC时间 | >10% |
| 数据倾斜度 | 分区大小差异 | >10倍 |

### 告警配置

```yaml
alerts:
  - name: spark_job_slow
    condition: job_duration > expected * 2
    severity: warning
    description: "Spark Job执行时间过长"
  
  - name: spark_stage_failure
    condition: stage_failures > 0
    severity: critical
    description: "Spark Stage失败"
  
  - name: spark_data_skew
    condition: partition_size_ratio > 10
    severity: warning
    description: "数据倾斜"
```

---

## 三十三、Spark 参数速查表

### 核心参数

| 参数 | 默认值 | 推荐值 | 说明 |
|------|--------|--------|------|
| spark.executor.instances | 2 | 按需 | Executor数量 |
| spark.executor.memory | 1g | 4-8g | Executor内存 |
| spark.executor.cores | 1 | 4-5 | Executor核数 |
| spark.driver.memory | 1g | 2-4g | Driver内存 |
| spark.sql.shuffle.partitions | 200 | 按数据量 | Shuffle分区 |

### 性能参数

| 参数 | 默认值 | 推荐值 | 说明 |
|------|--------|--------|------|
| spark.serializer | Java | Kryo | 序列化 |
| spark.sql.adaptive.enabled | false | true | AQE |
| spark.shuffle.compress | true | true | 压缩 |
| spark.memory.fraction | 0.6 | 0.75 | 内存比例 |
| spark.memory.storageFraction | 0.5 | 0.3 | 存储比例 |

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

## 十三、Spark Structured Streaming与批处理统一编程模型

### 13.1 统一编程模型原理

```text
统一编程模型原理：

  核心思想：
    同一套代码既能处理批数据，也能处理流数据
    DataFrame/Dataset API统一批流处理
    SQL语法统一批流查询

  批处理模式：
    读取完整数据集
    一次性处理所有数据
    输出结果到存储
    适用：ETL、数据分析

  流处理模式：
    读取数据流（增量）
    持续处理新数据
    输出结果到存储（追加/更新）
    适用：实时监控、实时计算

  统一优势：
    代码复用：一套代码处理批流
    学习成本低：只需掌握一套API
    维护简单：统一的代码库
    测试方便：批模式测试流逻辑
```

### 13.2 统一编程模型实现

```scala
// 批处理模式
val batchDF = spark.read.parquet("/data/orders")
batchDF.write.parquet("/output/orders-batch")

// 流处理模式（同一套API）
val streamDF = spark.readStream.parquet("/data/orders-stream")
streamDF.writeStream.parquet("/output/orders-stream")

// 统一SQL查询
// 批模式
spark.sql("""
    SELECT product, COUNT(*) as cnt, SUM(amount) as total
    FROM orders
    GROUP BY product
""").show()

// 流模式（同一套SQL）
spark.sql("""
    SELECT product, COUNT(*) as cnt, SUM(amount) as total
    FROM orders_stream
    GROUP BY product, TUMBLE(event_time, INTERVAL '1 hour')
""").writeStream.outputMode("update").start()

// 测试流逻辑（用批数据测试）
val testBatchDF = spark.read.parquet("/test/data")
val resultDF = processStream(testBatchDF)  // 同一处理逻辑
resultDF.show()
```

### 13.3 批流对比

| 维度 | 批处理 | 流处理 | 统一模型优势 |
|------|--------|--------|--------------|
| 数据处理 | 全量数据 | 增量数据 | 一套代码 |
| 处理时间 | 一次性 | 持续性 | 逻辑复用 |
| 输出模式 | 完整结果 | 增量结果 | 统一输出 |
| 容错机制 | 重算 | WAL+Checkpoint | 统一容错 |
| 状态管理 | 无状态 | 有状态 | 统一状态管理 |
| 测试方式 | 直接测试 | 模拟流测试 | 统一测试 |

## 十四、Spark SQL AQE三大优化

### 14.1 合并小分区优化

```text
合并小分区优化：

  问题：
    Shuffle后产生大量小分区
    每个分区一个Task
    小文件问题严重

  优化原理：
    运行时根据Shuffle统计信息
    自动合并过小的分区
    减少Task数量

  配置：
    spark.sql.adaptive.enabled=true
    spark.sql.adaptive.coalescePartitions.enabled=true
    spark.sql.adaptive.coalescePartitions.minPartitionSize=1MB
    spark.sql.adaptive.coalescePartitions.initialPartitionNum=200

  效果：
    减少Task数量：从2000减少到200
    减少调度开销：Task调度时间减少90%
    提升缓存命中率：更少的Task → 更好的缓存

  监控：
    Spark UI → SQL → 查看AQE优化详情
    检查是否合并了小分区
    检查Task数量变化
```

### 14.2 动态Join策略选择

```text
动态Join策略选择：

  问题：
    静态分析时选择Join策略
    可能选择次优策略
    性能损失

  优化原理：
    运行时根据统计信息
    动态选择最优Join策略
    自动切换Broadcast/Sort Merge Join

  配置：
    spark.sql.adaptive.enabled=true
    spark.sql.adaptive.localShuffleReader.enabled=true

  策略选择：
    小表Join大表 → Broadcast Join（避免Shuffle）
    大表Join大表 → Sort Merge Join（内存友好）
    动态切换：根据运行时统计信息自动选择

  效果：
    自动选择最优Join策略
    性能提升：10-100倍（取决于数据量）
    减少调参负担

  监控：
    Spark UI → SQL → 查看Join策略
    检查是否使用了Broadcast Join
    检查Join性能提升
```

### 14.3 Skew Join处理

```text
Skew Join处理：

  问题：
    数据倾斜导致长尾Task
    某个分区数据量远超其他分区
    整体性能下降

  优化原理：
    自动检测数据倾斜
    拆分倾斜分区
    避免长尾Task

  配置：
    spark.sql.adaptive.enabled=true
    spark.sql.adaptive.skewJoin.enabled=true
    spark.sql.adaptive.skewJoin.skewedPartitionFactor=5
    spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes=256MB

  处理流程：
    1. 检测倾斜：某分区数据量 > 平均值 × 因子
    2. 拆分分区：将倾斜分区拆分为多个子分区
    3. 并行处理：子分区并行处理
    4. 合并结果：合并子分区结果

  效果：
    避免长尾Task：从小时级减少到分钟级
    提升整体性能：消除倾斜瓶颈
    自动化：无需手动干预

  监控：
    Spark UI → Stage → 查看Task数据量分布
    检查是否有倾斜分区
    检查Skew Join处理效果
```

### 14.4 AQE配置汇总

```properties
# AQE核心配置
spark.sql.adaptive.enabled=true                    # 开启AQE
spark.sql.adaptive.coalescePartitions.enabled=true  # 合并小分区
spark.sql.adaptive.coalescePartitions.minPartitionSize=1MB  # 最小分区大小
spark.sql.adaptive.coalescePartitions.initialPartitionNum=200  # 初始分区数

# Join策略配置
spark.sql.adaptive.localShuffleReader.enabled=true  # 本地Shuffle读取

# Skew Join配置
spark.sql.adaptive.skewJoin.enabled=true            # 开启倾斜Join
spark.sql.adaptive.skewJoin.skewedPartitionFactor=5  # 倾斜因子
spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes=256MB  # 倾斜阈值

# 监控配置
spark.sql.adaptive.logLevel=INFO  # 日志级别
```

## 十五、Spark数据倾斜解决方案

### 15.1 Salted Join方案

```scala
// Salted Join方案
// 原理：给倾斜Key加随机后缀打散
val skewedDF = spark.read.parquet("/data/skewed")
val normalDF = spark.read.parquet("/data/normal")

// 给倾斜Key加盐
val saltedSkewedDF = skewedDF.withColumn("salt", (rand() * 10).cast("int"))
    .withColumn("salted_key", concat(col("key"), lit("_"), col("salt")))

// 给正常Key加盐（相同数量）
val saltedNormalDF = normalDF.crossJoin(
    spark.range(0, 10).withColumnRenamed("id", "salt")
).withColumn("salted_key", concat(col("key"), lit("_"), col("salt")))

// 执行Salted Join
val result = saltedSkewedDF.join(saltedNormalDF, "salted_key")
    .groupBy("key").agg(sum("value").as("total"))

// 效果：
//   将倾斜Key拆分为10个子Key
//   每个子Key处理1/10的数据
//   避免长尾Task
```

### 15.2 Broadcast Join方案

```scala
// Broadcast Join方案
// 原理：小表广播避免Shuffle
val largeDF = spark.read.parquet("/data/large")
val smallDF = spark.read.parquet("/data/small")

// 广播小表
val result = largeDF.join(broadcast(smallDF), "key")

// 配置
spark.sql.autoBroadcastJoinThreshold=10MB  # 自动广播阈值

// 效果：
//   避免Shuffle
//   性能提升：10-100倍
//   适用：小表 < 10MB
```

### 15.3 Skew Join Hint方案

```scala
// Skew Join Hint方案
// 原理：手动提示倾斜Join
val skewedDF = spark.read.parquet("/data/skewed")
val normalDF = spark.read.parquet("/data/normal")

// 使用Skew Join Hint
val result = skewedDF.hint("skew", "key").join(normalDF, "key")

// 或使用两阶段聚合
val partialAgg = skewedDF.groupBy("key").agg(sum("value").as("partial_sum"))
val finalAgg = partialAgg.groupBy("key").agg(sum("partial_sum").as("total"))

// 效果：
//   手动提示倾斜列
//   Spark自动处理倾斜
//   适用：已知倾斜列
```

### 15.4 解决方案对比

| 方案 | 实现复杂度 | 适用场景 | 优缺点 |
|------|------------|----------|--------|
| Salted Join | 中 | 倾斜Key有限 | 简单有效，但增加Shuffle |
| Broadcast Join | 低 | 小表Join大表 | 性能好，但受内存限制 |
| Skew Join Hint | 低 | 已知倾斜列 | 简单，但需手动提示 |
| 两阶段聚合 | 中 | GroupBy聚合 | 效果好，但需改代码 |
| AQE Skew Join | 低 | 通用 | 自动化，但需Spark 3.0+ |

## 十六、Spark on YARN资源分配

### 16.1 资源分配公式

```text
资源分配公式：

  Executor数量：
    = min(集群总核数 / executor-cores, maxExecutors)
    计算：集群总核数 × 动态分配比例

  Executor核心数（executor-cores）：
    推荐：2~5核/executor
    计算：min(可用核心数/预期executor数, 5)
    过多 → GC压力大
    过少 → 线程切换开销

  Executor内存（executor-memory）：
    = spark.executor.memory + spark.executor.memoryOverhead
    overhead = max(executor-memory × 0.1, 384MB)
    推荐：4GB~32GB

  Driver内存（driver-memory）：
    小作业：4GB
    中等作业：8GB
    大作业：16GB
    计算：取决于collect数据量和广播表大小

  分区数（shuffle.partitions）：
    = 输入数据量 / 128MB（推荐）
    ≥ 2 × executor总核数
    计算：max(输入数据量/128MB, 2 × executor总核数)
```

### 16.2 推荐配置表

| 作业类型 | executor-cores | executor-memory | driver-memory | shuffle.partitions |
|----------|----------------|-----------------|---------------|-------------------|
| 小作业 | 4 | 8GB | 4GB | 200 |
| 中等作业 | 4 | 16GB | 8GB | 500 |
| 大作业 | 5 | 32GB | 16GB | 2000 |
| 流式作业 | 4 | 16GB | 8GB | 200 |
| ML作业 | 4 | 16GB | 8GB | 200 |

### 16.3 资源分配最佳实践

```text
资源分配最佳实践：

  Executor核心数：
    推荐4核（平衡GC和并行度）
    避免超过6核（GC压力大）
    考虑HDFS客户端并发（每executor最多5个并发）

  Executor内存：
    Storage和Execution共享（spark.memory.fraction=0.6）
    预留30%给User Memory和Reserved
    堆外内存：spark.memory.offHeap.size=4g

  Driver内存：
    collect大结果：增加driver-memory
    广播大表：增加driver-memory
    避免：driver-oom导致作业失败

  动态分配：
    spark.dynamicAllocation.enabled=true
    spark.dynamicAllocation.minExecutors=2
    spark.dynamicAllocation.maxExecutors=20
    spark.dynamicAllocation.shuffleTracking.enabled=true

  监控指标：
    Executor CPU利用率：> 70%为佳
    Executor内存利用率：> 80%为佳
    GC时间占比：< 10%为佳
    Shuffle Read/Write：均匀分布为佳
```

## 十七、Spark Shuffle管理

### 17.1 Sort Shuffle原理

```text
Sort Shuffle原理：

  写入流程：
    1. 每个Task写入内存缓冲（spark.shuffle.file.buffer，默认32KB）
    2. 内存满 → 排序后溢出到磁盘文件（按分区排序）
    3. 合并（merge）多个溢出文件 → 一个分区一个文件
    4. 写索引文件（记录每个分区在数据文件中的offset）

  关键参数：
    spark.shuffle.spill.numElementsForceSpillThreshold
      → 内存中元素数超阈值强制溢出（防OOM）

  优势：
    文件数：每个Task输出一个文件（而非每个Reduce一个文件）
    排序：按分区排序，便于后续合并
    压缩：支持压缩（spark.shuffle.compress=true）

  劣势：
    排序开销：需要排序
    内存压力：内存满时溢出
```

### 17.2 Unsafe Shuffle原理

```text
Unsafe Shuffle原理：

  核心优化：
    堆外内存直接写入（避免GC）
    二进制排序（Unsafe.sort）
    零拷贝序列化

  配置：
    spark.shuffle.spill.compress=true（压缩溢出文件）
    spark.io.compression.codec=lz4/zstd

  优势：
    高性能：避免GC和序列化开销
    低延迟：堆外内存直接写入
    高吞吐：零拷贝序列化

  劣势：
    内存管理复杂：需要手动管理堆外内存
    调试困难：堆外内存问题难以排查
```

### 17.3 Tungsten Shuffle原理

```text
Tungsten Shuffle原理：

  核心优化：
    堆外内存直接写入（避免GC）
    二进制排序（Unsafe.sort）
    零拷贝序列化
    Whole-Stage Code Generation

  配置：
    spark.shuffle.spill.compress=true（压缩溢出文件）
    spark.io.compression.codec=lz4/zstd

  优势：
    高性能：避免GC和序列化开销
    低延迟：堆外内存直接写入
    高吞吐：零拷贝序列化
    代码生成：减少虚函数调用

  劣势：
    内存管理复杂：需要手动管理堆外内存
    调试困难：堆外内存问题难以排查
    兼容性：需要Spark 2.x+
```

### 17.4 Shuffle管理对比

| 维度 | Sort Shuffle | Unsafe Shuffle | Tungsten Shuffle |
|------|--------------|----------------|------------------|
| 内存管理 | 堆内内存 | 堆外内存 | 堆外内存 |
| GC压力 | 高 | 低 | 低 |
| 序列化 | Java序列化 | 零拷贝 | 零拷贝 |
| 性能 | 中 | 高 | 最高 |
| 兼容性 | 所有版本 | Spark 2.x+ | Spark 2.x+ |
| 适用场景 | 通用 | 高性能 | 高性能 |
