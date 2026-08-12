# Apache Flink（流处理引擎 / 批流一体）

> Flink 是新一代**流批一体**计算引擎：以流为核心，流是批的超集。相比 Spark Streaming（微批）的延迟高、Storm（纯流）的吞吐低，Fink 实现了**真正的逐事件低延迟 + 高吞吐 + Exactly-once**。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、Flink 要解决的问题

| 痛点 | 说明 |
|------|------|
| 流批割裂 | 同一份业务逻辑要写两套（实时 Flink + Spark 批），口径不一致 |
| 延迟 vs 吞吐 | Storm 低延迟但吞吐低；Spark Streaming 吞吐高但秒级延迟 |
| 乱序事件 | 分布式上游导致事件到达乱序，需要事件时间语义 + Watermark |
| 状态一致性 | 故障恢复后状态与输出要一致（不能多不能少） |

> 核心认知：**Flink 把一切视为流（流是批的超集），用同一套 API/Runtime 处理实时与离线**。

---

## 二、Flink 核心原理

### 2.1 运行时架构

```
JobManager（Master）
  ├── JobGraph → ExecutionGraph 调度
  ├── Checkpoint 协调（Barrier 注入）
  └── ResourceManager 资源申请
TaskManager（Worker）
  ├── Task Slot（资源隔离单位）
  ├── Operator Chain（算子链：相同并行度算子合并为一个 Task，减少序列化）
  └── Network Buffer（数据传输缓冲）
```

### 2.2 时间语义

| 时间类型 | 含义 | 适用场景 |
|----------|------|----------|
| Event Time | 事件产生的时间（数据自带时间戳） | 乱序/延迟事件，结果确定 |
| Ingestion Time | 进入 Flink Source 的时间 | 简单场景 |
| Processing Time | 算子处理时的系统时间 | 不关心乱序，最快 |

**选型关注点**：生产环境几乎都用 **Event Time + Watermark**（处理乱序），Processing Time 只用于对时序无要求的场景。

### 2.3 Watermark（水位线）

- **作用**：衡量事件时间进展，告诉系统「时间 T 之前的数据到齐了，可以触发计算」
- **生成策略**：`Watermark = MaxEventTime - 最大乱序时间`
- **传播**：Watermark 在算子间广播，多输入取最小值
- **风险**：设太晚 → 延迟大；设太早 → 迟到数据需侧输出（Side Output）

### 2.4 窗口（Window）

| 窗口类型 | 说明 | 典型场景 |
|----------|------|----------|
| Tumbling Window | 固定大小、不重叠 | 每 5 分钟 PV/UV |
| Sliding Window | 固定大小、可滑动 | 最近 1 分钟每 10 秒 |
| Session Window | 按活跃间隔切分 | 用户会话分析 |
| Global Window | 不触发，自定义触发器 | 自定义逻辑 |

### 2.5 Checkpoint（分布式快照，Exactly-once 基石）

**原理**：基于 **Chandy-Lamport 算法**的异步 Barrier 快照。

1. JobManager 定期触发 Checkpoint，Source 注入 Barrier 到数据流
2. Barrier 随数据流向下游传播，算子收到所有输入的 Barrier 后：
   - 将本地状态异步快照到状态后端（RocksDB/S3/HDFS）
   - 向下游转发 Barrier
3. 所有算子完成 → Checkpoint 完成（元数据存 JobManager）

**故障恢复**：从最近 Checkpoint 恢复状态 + 重放数据（Source 支持回放，如 Kafka offset 回退）

**选型关注点**：Checkpoint 间隔 = RTO 与吞吐的权衡（间隔越短恢复越快，但吞吐损失越大），生产通常 1~10 分钟。

### 2.6 状态后端（State Backend）

| 后端 | 存储位置 | 吞吐 | 适用场景 |
|------|----------|------|----------|
| MemoryStateBackend | TM 内存 | 最快 | 小状态、调试 |
| FsStateBackend | TM 内存 + 文件系统 | 快 | 中等状态 |
| RocksDBStateBackend | 本地磁盘（RocksDB） | 慢但大 | 超大状态（生产首选） |

**选型关注点**：生产环境几乎都用 **RocksDB**（支持超大状态 + Incremental Checkpoint）。

---

## 三、Flink API 层次

| API 层次 | 类/接口 | 说明 |
|----------|---------|------|
| SQL / Table API | `SELECT ... FROM` | 声明式，最上层，BI/分析师友好 |
| Process Function | `processElement` | 最底层，全控制（状态/定时器/侧输出） |
| DataStream API | `map/filter/keyBy/window` | 编程式，工程师首选 |
| Stateful Stream Processing | `KeyedProcessFunction` | 有状态流处理核心 |

**选型关注点**：团队有 SQL 背景 → Table API/SQL；复杂事件处理/精细控制 → DataStream + ProcessFunction。

---

## 四、Flink 生态与连接器

| 连接器 | 说明 |
|--------|------|
| Kafka Source/Sink | 实时管道核心（Kafka → Flink → Kafka/ES/HDFS） |
| JDBC Sink | 写关系库 |
| HDFS/S3 Sink | 批流统一落盘（数据湖） |
| HBase/Redis/ES | 维表 JOIN / 实时 Upsert |
| CDC（Debezium/ Canal） | binlog → Flink → 实时数仓/ES |

---

## 五、Flink vs Spark Streaming vs Storm

| 维度 | Flink | Spark Streaming | Storm |
|------|-------|-----------------|-------|
| 处理模型 | 逐事件（真流） | 微批（Micro-batch） | 逐事件 |
| 延迟 | 毫秒~秒 | 秒~分钟 | 毫秒 |
| 吞吐 | 高 | 最高 | 中 |
| 语义 | Exactly-once | Exactly-once | At-least-once（Trident 可 Exactly-once） |
| 批流一体 | 同一 Runtime | 不同引擎（Spark SQL / Spark Streaming） | 纯流 |
| 状态管理 | 完善（RocksDB） | 有限 | Trident |
| 窗口 | 丰富 | 有限 | 基础 |
| 生态 | 实时数仓/事件驱动 | 离线分析为主 | 纯实时计算 |

**选型关注点**：实时数仓/事件驱动/复杂事件处理 → **Flink**；离线分析为主 + 少量实时 → Spark 全家桶；纯实时简单计算 → Storm（已逐渐被替代）。

---

## 六、Flink 生产部署

### 6.1 部署模式

| 模式 | 说明 |
|------|------|
| Standalone | 自建集群，简单 |
| YARN | 共享 Hadoop 集群资源 |
| Kubernetes | 云原生部署（主流趋势） |
| 托管服务 | 阿里云 DataFlow / AWS Kinesis Data Analytics |

### 6.2 关键生产配置

- **并行度**：按 Source（Kafka 分区数）定并行度
- **反压**：下游处理慢 → 自动反压（Credit-based Flow Control）
- **Savepoint**：手动触发的全量快照（升级/迁移用，比 Checkpoint 更稳定）
- **内存配置**：Managed Memory（排序/哈希表）+ Network Buffer + JVM 堆

---

## 七、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 实时数仓（实时 ETL） | Flink + Kafka | Spark Structured Streaming |
| 复杂事件处理（CEP） | Flink CEP | — |
| 实时大屏/聚合 | Flink + Redis/ClickHouse | Spark Streaming |
| 实时风控 | Flink + 规则引擎 | — |
| 实时推荐 | Flink + 特征工程 | — |
| 离线批处理 | Spark | Flink Batch |
| 流批一体 | Flink | Spark |

---

## 八、与其他板块的关系

- Kafka（Flink 的 Source/Sink 核心）见「[Kafka](./Kafka.md)」；
- 实时数仓/湖仓一体见「[云上数仓与大数据生态](./云上数仓与大数据生态.md)」；
- 大数据批处理见「[基础知识/大数据](../大数据/README.md)」；
- 云上中间件总览见「[云上中间件体系总览](./云上中间件体系总览.md)」。

> 一句话：**Flink = 流批一体 + Event Time/Watermark + Checkpoint Exactly-once + 丰富窗口；选型先看「延迟要求（毫秒/秒级）」，再定「状态大小（内存/RocksDB）」，最后定「部署模式（K8s/托管）」。**
