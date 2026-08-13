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

### 2.3 快照 + 增量（增量快照机制）

```
首次启动：Snapshot 全量读取 → 同时记录 binlog 位点
增量阶段：从快照位点继续消费 binlog（无缝隙）
重试机制：Connector 崩溃后从 Kafka 已提交 offset 恢复
```

- **增量快照（Incremental Snapshot）**：大表快照分块进行，不阻塞线上写入；
- **Exactly-once 语义**：结合 Kafka 幂等/事务，保证下游不丢不重（配合 Sink 幂等）。

### 2.4 部署模型（Kafka Connect）

| 模式 | 说明 |
|------|------|
| 单机 Connect | 开发调试 |
| 分布式 Connect | 生产：多个 worker 自动负载均衡/故障恢复（REST API 管理） |
| 嵌入模式 | 直接嵌应用（不常用） |
| Debezium Server | 无 Kafka 场景：CDC → Pulsar/Kinesis/HTTP（轻量） |

**选型关注点**：生产用**分布式 Kafka Connect**（自带扩展/容错）；不想引 Kafka → Debezium Server 直出其他消息系统。

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

### 5.2 常见坑

- **DDL 变更**：表结构变更（加列）可能导致解析失败 → 升级 Connector 版本/兼容策略；
- **大事务阻塞**：超长事务的 binlog 解析延迟 → 关注 lag 告警；
- **无主键表**：无主键 update/delete 事件不可靠 → 强制补主键/唯一键；
- **版本兼容**：Debezium 版本与数据库小版本要匹配（尤其 PG/Oracle）；
- **Topic 无限增长**：按保留策略清理旧事件（否则 Kafka 磁盘爆）。

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

---

## 七、与其他板块的关系

- Canal 对比见「[数据同步 CDC（Canal）](./数据同步CDC-Canal.md)」；
- Kafka（事件落点）见「[Kafka](./Kafka.md)」；
- Flink（实时数仓消费 CDC）见「[Apache Flink 流处理](./ApacheFlink流处理.md)」；
- 分库分表（binlog 迁移）见「[分库分表 ShardingSphere](./分库分表ShardingSphere.md)」；
- 云上数据同步见「[云上数据库与缓存生态](./云上数据库与缓存生态.md)」。

> 一句话：**Debezium = Kafka Connect + 多数据库（binlog/WAL）+ 快照增量一体 + 标准变更事件（before/after/op）；选型先看「数据库（多库→Debezium，纯 MySQL→Canal）」，再定「出口（Kafka→Connect，SQL 数仓→Flink CDC）」，最后配「ROW 格式 + 幂等 Sink + lag 监控」**。
