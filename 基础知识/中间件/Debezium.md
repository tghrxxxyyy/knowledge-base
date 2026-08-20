# Debezium（CDC 事件流 / 数据库变更捕获）

> Debezium 是 **Red Hat 开源的 CDC（Change Data Capture）框架**，基于 **Kafka Connect** 架构，把数据库的变更（insert/update/delete）实时变为**事件流**。相比 Canal（只支持 MySQL，阿里系）、Maxwell（只支持 MySQL，JSON 简单）、Flink CDC（计算引擎的 SQL 式 CDC）、AWS DMS（商业），Debezium 以「**多数据库（MySQL/PG/Oracle/SQL Server/MongoDB）+ Kafka 生态原生 + 快照+增量一体**」成为开源 CDC 事实标准。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 数据变更不可见 | 数据库的每次变更业务系统感知不到 |
| 同步时效差 | 定时批处理同步（T+1）不满足实时需求 |
| 双写不一致 | 业务代码同时写 DB 和缓存/ES，容易不一致 |
| 异构同步 | MySQL → ES/数仓/缓存/异构库需要实时管道 |
| 审计与事件 | 所有数据变更需要可追溯、可消费（数据事件化） |

> 核心认知：**CDC = 「把数据库变成消息源」**——数据库的 binlog/WAL 变化转成事件流，任何系统都能订阅消费，业务代码零侵入。

---

## 二、核心原理

### 2.1 架构

```
源数据库（MySQL binlog / PG WAL / Oracle LogMiner / MongoDB Oplog）
  └── Kafka Connect 集群
      └── Debezium Connector（每个数据源一个 Connector 任务）
          ├── 快照阶段（Snapshot）：首次全量读取已有数据
          └── 增量阶段：持续解析 binlog/WAL → 输出变更事件

Kafka（事件流落点，topic 按表命名：db.table）
  └── 消费者：实时数仓 / ES 同步 / 缓存失效 / 事件驱动业务 / 审计
```

### 2.2 变更事件结构（Change Event）

```json
{
  "payload": {
    "op": "c",                       // 操作类型：c=create u=update d=delete r=read
    "source": { "db": "order_db", "table": "orders", "ts_ms": 1690000000000, "snapshot": false },
    "before": { "id": 1001, "status": "PENDING" },   // 变更前（update/delete 有）
    "after":  { "id": 1001, "status": "PAID" }       // 变更后
  }
}
```

**选型关注点**：事件自带 before/after + 操作类型 + 来源元数据——下游可以做增量同步、审计、事件驱动，这是 CDC 的通用数据模型。

### 2.3 事件字段深入

```
op 字段：
  c（create）：新增 → 下游 INSERT/upsert
  u（update）：更新 → 下游 UPDATE
  d（delete）：删除 → 下游 DELETE/软删
  r（read）：快照阶段读取的历史数据（初始加载）

source 字段（溯源元数据）：
  version：Debezium 版本
  connector：连接器类型（mysql/postgres）
  db / schema / table：库表位置
  ts_ms：变更发生时间（数据库侧）
  pos / gtid / lsn：binlog/WAL 位置（精确位点）
  snapshot：是否为快照阶段数据
  file / row：binlog 文件名与偏移

用途：
  位点信息 → 重放/对齐/审计
  库表信息 → 多源多表分流路由
  before/after → 增量同步（upsert 直接拿新值）
```

### 2.4 快照 + 增量（增量快照机制）

```
首次启动：Snapshot 全量读取 → 同时记录 binlog 位点
增量阶段：从快照位点继续消费 binlog（无缝隙）
重试机制：Connector 崩溃后从 Kafka 已提交 offset 恢复
```

- **增量快照（Incremental Snapshot）**：大表快照分块进行，不阻塞线上写入；
- **Exactly-once 语义**：结合 Kafka 幂等/事务，保证下游不丢不重（配合 Sink 幂等）。

### 2.5 增量快照深入

```
传统快照问题：
  大表（亿级行）全量快照耗时长 → 期间 binlog 积压
  快照期间数据变更 → 快照数据与增量数据重复/错乱

Incremental Snapshot（Chunked Snapshot）：
  ① 表按主键范围分块（每块数千行）
  ② 每块快照完成 → 标记位点（水位线）
  ③ 块内数据 + 块间增量拼接（无缝隙、无重复）
  ④ 快照与增量并行推进（在线增量，不阻塞业务）

快照期间处理变更：
  块快照时记录水位（binlog 位置）
  块内变更：先快照后增量 → 用水位去重/覆盖
  全表快照完 → 纯增量模式
```

### 2.6 部署模型（Kafka Connect）

| 模式 | 说明 |
|------|------|
| 单机 Connect | 开发调试 |
| 分布式 Connect | 生产：多个 worker 自动负载均衡/故障恢复（REST API 管理） |
| 嵌入模式 | 直接嵌应用（不常用） |
| Debezium Server | 无 Kafka 场景：CDC → Pulsar/Kinesis/HTTP（轻量） |

**选型关注点**：生产用**分布式 Kafka Connect**（自带扩展/容错）；不想引 Kafka → Debezium Server 直出其他消息系统。

### 2.7 分布式 Connect 容错机制

```
分布式 Connect：
  多个 Worker 组成集群（同 group.id）
  Connector/Task 分布到各 Worker（均衡分配）
  Worker 故障 → 其上的 Task 自动迁移到其他 Worker（restart）
  配置/状态存 Kafka（config topic / status topic / offset topic）

Task 模型：
  一个 Connector 拆多个 Task（按表/分区分片）
  MySQL：Task 数 = 表分片数（chunk 并行）
  并行度提升 → 吞吐提升

Offset 管理：
  消费位点存 Kafka offset topic（提交）
  崩溃恢复 → 从提交位点继续（至少一次语义）
```

---

## 三、核心特性

| 特性 | 说明 |
|------|------|
| 多数据库 | MySQL/PostgreSQL/Oracle/SQL Server/MongoDB/Cassandra/DB2 |
| Kafka 原生 | 基于 Kafka Connect，无缝进 Kafka 生态 |
| 快照+增量 | 全量 + 增量一体，无缝隙 |
| 增量快照 | 大表分块快照，不阻塞业务 |
| 事件结构标准 | before/after/op/source 统一模型 |
| 变更数据脱敏 | 支持字段过滤/转换（单字段屏蔽） |
| Exactly-once | 配合 Kafka 事务语义 |
| 免侵入 | 不碰业务代码，只读 binlog/WAL |
| 高可用 | Connect 集群自动故障转移 |
| 转换器 | SMT（Single Message Transform）字段/格式处理 |

### 3.1 SMT（消息转换）

```
SMT = 在事件进入 Kafka 前做字段级处理（无需消费端处理）
  常见 SMT：
    字段重命名/过滤（RenameFields/FilterFields）
    字段裁剪（PruneFields：去掉敏感字段）
    时间戳转换（时间字段 → epoch/ISO）
    主题路由（TopicRouting：按条件分主题）
    值处理（ExtractNewRecordState：只保留 after 值）

典型用途：
  生产环境去掉身份证/手机号字段（脱敏前置）
  只同步需要的字段（减少流量）
  事件格式标准化（JSON/Avro 转换）
```

---

## 四、Debezium vs Canal vs Maxwell vs Flink CDC

| 维度 | Debezium | Canal | Maxwell | Flink CDC |
|------|----------|-------|---------|-----------|
| 支持数据库 | 多库（8+） | 仅 MySQL | 仅 MySQL | 多库（Debezium 内核） |
| 架构 | Kafka Connect | 自研（Server/Adapter） | 自研（binlog 行事件） | Flink 连接器 |
| 输出 | Kafka（多格式） | Kafka/DB/自定义 | JSON（Kafka） | Flink DataStream/SQL |
| 快照能力 | 强（增量快照） | 有 | 有 | 有（SQL 友好） |
| 运维成本 | 中（Connect） | 中 | 低 | 低（SQL 即管道） |
| 生态 | Kafka/多 Sink | 阿里生态 | 简单 JSON | 实时数仓 SQL |
| 社区 | 活跃（Red Hat） | 阿里，稳定 | 维护一般 | Flink 生态热 |

**选型关注点**：
- 多数据库 + Kafka 生态 → **Debezium**；
- 纯 MySQL + 阿里系 → **Canal**；
- 要 SQL 化实时数仓管道 → **Flink CDC**（内部就是 Debezium）；
- 简单 MySQL → JSON 事件 → **Maxwell**（最轻）。

---

## 五、生产实践

### 5.1 关键配置

| 配置 | 建议 |
|------|------|
| 数据库权限 | 需要 REPLICATION 权限（binlog 读） |
| binlog 格式 | MySQL 必须 ROW 模式（statement 拿不到 before/after） |
| 主键策略 | 表必须有主键（否则更新事件无行定位） |
| topic 分区 | 按主键分区保证单行有序 |
| 并发 | 大表多分区/分片 Connector（per-table 任务） |
| 幂等 Sink | 下游消费必须幂等（重放安全） |
| 监控 | Connect REST API + 指标（lag 关键指标） |
| 快照配置 | 增量快照开启 + 分块大小（chunk）调优 |

### 5.2 配置示例（MySQL Connector）

```json
{
  "name": "mysql-orders-connector",
  "config": {
    "connector.class": "io.debezium.connector.mysql.MySqlConnector",
    "database.hostname": "mysql-host",
    "database.port": "3306",
    "database.user": "debezium",
    "database.password": "debezium",
    "database.server.id": "184054",
    "database.server.name": "shop",
    "database.include.list": "order_db",
    "table.include.list": "order_db.orders,order_db.order_items",
    "database.history.kafka.bootstrap.servers": "kafka:9092",
    "database.history.kafka.topic": "schema-changes.shop",
    "topic.prefix": "shop",
    "snapshot.mode": "initial",
    "incremental.snapshot.chunk.size": "4096",
    "column.mask.with.length.chars": "4,card_no",
    "offset.storage.file.filename": ""
  }
}
```

### 5.3 下游消费注意事项

```
① 至少一次语义 → 下游必须幂等（按主键 upsert）
② delete 事件处理：物理删除 vs 软删（写删除标记）
③ 大事务：单事务修改万行 → 事件洪峰 → 下游批量消费
④ 顺序性：单主键事件按分区有序（同主键同分区）
⑤ Schema 变更：加列 → 事件结构变化（Avro Registry 兼容校验）
⑥ 位点监控：lag = 当前时间 - 最新事件时间（关键指标）
```

### 5.4 常见坑

- **DDL 变更**：表结构变更（加列）可能导致解析失败 → 升级 Connector 版本/兼容策略；
- **大事务阻塞**：超长事务的 binlog 解析延迟 → 关注 lag 告警；
- **无主键表**：无主键 update/delete 事件不可靠 → 强制补主键/唯一键；
- **版本兼容**：Debezium 版本与数据库小版本要匹配（尤其 PG/Oracle）；
- **Topic 无限增长**：按保留策略清理旧事件（否则 Kafka 磁盘爆）；
- **并行快照打爆源库**：增量快照 chunk 过小 + 并发高 → 源库 IO 压力 → chunk 调大/限流。

### 5.5 监控指标

```
关键指标（JMX/Prometheus）：
  lag（最新事件时间 vs 当前时间）—— 最核心
  快照进度（快照中/完成比例）
  已处理事件数/秒（吞吐）
  错误事件数（解析失败）
  Kafka Connect Task 状态（RUNNING/FAILED）
  binlog 位点与 Kafka offset 差距（积压）

告警：
  lag > 阈值（如 5 分钟）→ 告警（同步中断/变慢）
  Task FAILED → 立即告警
  快照异常/超时 → 告警
```

---

## 六、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 多数据库 CDC | Debezium | Flink CDC |
| MySQL → Kafka 实时管道 | Debezium/Canal | Maxwell |
| 实时数仓 SQL 化 | Flink CDC | Debezium + Flink |
| 缓存/ES 同步 | Debezium + Sink | Canal Adapter |
| 阿里云 RDS | Canal | DTS（商业） |
| 无 Kafka 场景 | Debezium Server | 云 DMS |
| 数据脱敏前置 | Debezium SMT | 消费端处理 |

### 6.1 决策树

```
数据库 > 1 种？→ 是 → Debezium（多库支持）
纯 MySQL + 阿里系？→ Canal
要 SQL 实时数仓？→ Flink CDC（SQL 友好）
无 Kafka 基础设施？→ Debezium Server（直出 Pulsar/HTTP）
简单 JSON 事件？→ Maxwell
```

---

## 七、与其他板块的关系

- Canal 对比见「[数据同步 CDC（Canal）](./数据同步CDC-Canal.md)」；
- Kafka（事件落点）见「[Kafka](./Kafka.md)」；
- Flink（实时数仓消费 CDC）见「[Apache Flink 流处理](./ApacheFlink流处理.md)」；
- 分库分表（binlog 迁移）见「[分库分表 ShardingSphere](./分库分表ShardingSphere.md)」；
- 云上数据同步见「[云上数据库与缓存生态](./云上数据库与缓存生态.md)」。

> 一句话：**Debezium = Kafka Connect + 多数据库（binlog/WAL）+ 快照增量一体 + 标准变更事件（before/after/op）；选型先看「数据库（多库→Debezium，纯 MySQL→Canal）」，再定「出口（Kafka→Connect，SQL 数仓→Flink CDC）」，最后配「ROW 格式 + 增量快照 + 幂等 Sink + lag 监控」**。