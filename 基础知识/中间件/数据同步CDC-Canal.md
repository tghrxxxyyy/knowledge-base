# 数据同步 CDC（Canal）

> 经典痛点：MySQL 改了数据，Redis 缓存还是旧的（超卖）；或要把 MySQL 实时同步到 ES 做搜索、到数仓做分析——定时任务太慢。本文讲清 **Canal 怎么基于 binlog 做毫秒级增量同步**，以及 CDC 的整体套路。
> 开源参考：[alibaba/canal](https://github.com/alibaba/canal)（Java，阿里开源，MySQL binlog 增量订阅 & 消费组件，伪装 slave 拉 binlog，可投递 Kafka / RocketMQ / ES，多语言客户端）。

---


## 〇、本体介绍（它是什么 / 适用场景 / 核心概念）

**它是什么**：Canal 是阿里开源的 **CDC（Change Data Capture，变更数据捕获）** 工具，通过「伪装成 MySQL Slave」订阅 binlog，把数据库的增删改实时同步到下游（Redis、ES、消息队列、数仓等）。

**解决什么痛点**：传统双写（业务代码同时写 MySQL 和缓存/ES）易不一致、侵入大。Canal 基于 binlog 订阅，对业务零侵入，保证「MySQL 变更 → 下游近实时同步」，常用于缓存一致性、异构数据同步、数据分发。

**核心概念**：binlog（ROW 模式）、MySQL Slave 协议（dump 协议）、Event（变更事件）、Instance（实例）、Canal Server/Client、消息投递（Kafka/RocketMQ）、位点（position/GTID）、ACK 确认、与 Flink CDC/Debezium 对比。

**适用场景**：MySQL→Redis 缓存一致性、MySQL→ES 搜索同步、数据分发到数仓、异构库同步。
**不适用**：非 MySQL 源（如 PostgreSQL 应选 Debezium/Flink CDC）。

---

## 一、CDC 是什么，为什么需要

**CDC（Change Data Capture，变更数据捕获）**：捕获数据库的增删改，实时同步到别处。

典型场景：

| 场景 | 说明 |
|------|------|
| 缓存一致性 | MySQL 改了 → 实时刷 Redis，避免超卖 / 脏读 |
| 异构索引 | MySQL 数据实时同步 ES 做搜索 |
| 实时数仓 | binlog → Kafka → Flink 实时计算 |
| 数据库镜像 / 备份 | 跨机房实时同步 |
| 业务解耦 | 数据变更事件驱动下游（如发消息、记审计） |

传统定时任务（每分钟扫一次）延迟高、扫全表压力大 → **CDC 基于 binlog 才是正解**。

---

## 二、Canal 核心原理：伪装成 MySQL Slave

```mermaid
sequenceDiagram
    participant M as MySQL Master
    participant C as Canal Server
    participant MQ as Kafka/RocketMQ
    participant D as 下游(ES/Redis/数仓)
    M->>C: binlog dump 协议推送
    Note over C: 解析 binlog 为结构化事件(Insert/Update/Delete)
    C->>MQ: 投递变更事件
    MQ->>D: 消费并写入目标
```

基于 MySQL 主从复制协议：

1. MySQL master 写变更到 **binlog**。
2. Canal 伪装成 MySQL **slave**，向 master 发 `dump` 协议。
3. master 推送 binlog 给 Canal。
4. Canal 解析 binlog 字节流 → 结构化 `CanalEntry`（行级变更）。
5. 投递到下游（TCP / Kafka / RocketMQ / 经 adapter 写 ES、HBase 等）。

> 前置条件：MySQL 必须开启 binlog 且格式为 **ROW**（行模式，才能拿到行级前后值）；Canal 用户需 `REPLICATION SLAVE` + `REPLICATION CLIENT` 权限；`server-id` 不能与 master 及其他 slave 冲突。

---

## 三、Canal 架构组件

| 组件 | 作用 |
|------|------|
| **canal.deployer（Server）** | 伪装 slave、连 master、解析 binlog，按 instance 管理同步通道 |
| **canal.instance** | 一个同步实例对应一个数据源，配置库地址 / 账号 / 表过滤规则 |
| **canal.adapter** | 可选适配器，直接把数据写目标（ES / HBase / RDB），支持全量 + 增量 |
| **canal.admin** | Web 控制台，集中管理 instance 配置、监控、日志 |
| **client** | 自写客户端订阅 Canal Server，自定义消费逻辑 |

投递能力：原生支持 **Kafka / RocketMQ**；adapter 可对接 ES、HBase、RDB 等；多语言客户端（Java / Go / Python / C# / PHP / Rust / Node）。

---

## 四、实战：MySQL → Redis 缓存一致性

最常见的用法。流程：Canal 监听订单表 binlog → 投递到应用消费 → 更新 Redis。

```java
// 伪代码：消费 Canal 变更，刷新缓存
@StreamListener("canalOrder")
public void onChange(CanalEntry entry) {
    for (RowChange row : entry.getRowChanges()) {
        if (row.getEventType() == UPDATE || row.getEventType() == INSERT) {
            Order o = parse(row.getAfterColumns());
            redis.set("order:" + o.getId(), o);          // 更新缓存
        } else if (row.getEventType() == DELETE) {
            redis.del("order:" + entry.getBeforeColumns().getId());
        }
    }
}
```

注意：**收到变更即刷新**，可能有「binlog 顺序 vs 缓存写顺序」问题，下游要保证**幂等**（以最新版本号 / 时间戳覆盖）。

---

## 五、实战：MySQL → Elasticsearch

用 canal.adapter 的 `es7/*.yml` 配置表级映射：

```yaml
dataSourceKey: defaultDS
destination: example
groupId: g1
esMapping:
  _index: user
  _id: user_id
  sql: "SELECT id AS user_id, username, fullname FROM user"
  commitBatch: 3000
```

---

## 六、一致性保障机制（生产必看）

| 机制 | 作用 |
|------|------|
| **位点（Position）管理** | 记录 binlog 消费位点（ZM / 本地文件），宕机恢复续传，不丢数据 |
| **ACK 机制** | 客户端处理完一批才 ACK，服务端才删除，防丢 |
| **事务粒度** | 按事务聚合 binlog 事件，保证一个事务整体处理 |
| **幂等设计** | 下游必须幂等（重试 / 重复投递不重复写） |
| **断点续传** | 支持从断点继续消费 |

---

## 七、与其他 CDC 方案对比

| 方案 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| **Canal（阿里）** | 伪装 slave 解析 binlog | 成熟、生态全、国内案例多 | 主要 MySQL；admin 运维 |
| **Debezium** | 基于 Kafka Connect 捕获 | 多数据库（MySQL/PG/Oracle）、云原生 | 依赖 Kafka Connect，较重 |
| **Maxwell** | binlog → JSON → Kafka | 轻量、输出规整 JSON | 功能较简单 |
| **Flink CDC** | 流批一体捕获 | 直接进 Flink 计算、无独立中间件 | 需 Flink 栈 |

选型：Java 栈、MySQL、要可视化管控 → **Canal**；已用 Flink / 多数据源 → **Debezium / Flink CDC**。

---

## 八、常见坑

1. **binlog 格式不是 ROW**：Canal 拿不到行级前后值 → 必须 `binlog-format=ROW`。
2. **server-id 冲突**：Canal 的 slaveId 与 MySQL server-id 或其他 slave 重复 → 主从复制冲突，同步失败。
3. **下游消费慢 / 堆积**：Canal 推送快、消费慢 → 用 Kafka 解耦 + 增加消费并发；监控 lag。
4. **乱序导致缓存脏数据**：下游用版本号 / 时间戳保证以最新为准。
5. **DDL 变更**：表结构变了，adapter 映射可能失效，需同步更新配置。
6. **大事务 binlog**：超大事务产生巨量 binlog，Canal 内存压力 → 拆分业务事务。
7. **位点丢失**：ZK / 文件损坏导致重头消费 → 定期备份位点，下游幂等兜底。

---

## 面试高频问题（20+ 条）

1. **Canal 的核心原理？** 伪装成 MySQL Slave，向 Master 发送 dump 协议订阅 binlog（ROW 模式），解析 binlog Event 推送给客户端/消息队列，实现零侵入的变更捕获。

2. **为什么要用 ROW 模式 binlog？** ROW 模式记录每行的前后镜像，能精确还原变更；STATEMENT 模式只记 SQL，可能因函数/环境不同导致下游不一致。Canal 依赖 ROW 模式。

3. **Canal 与 Flink CDC / Debezium 区别？** Canal 是阿里专为 MySQL 写的轻量 CDC，生态集中在 Java/消息队列；Flink CDC/Debezium 基于 Kafka Connect，支持多源（PG/Oracle 等）、与流处理集成更强、exactly-once 语义更好。

4. **断点续传怎么实现？** Canal 记录消费位点（binlog file + position，或 GTID），重启从位点继续拉取；下游 ACK 确认后才推进位点，避免丢数据。

5. **单线程瓶颈？** 早期 Canal 解析/投递偏单线程，高吞吐下可能延迟；可多 Instance 分库并行、或接 Kafka 多分区提升并发。

6. **MySQL→Redis 缓存一致性怎么做的？** Canal 订阅 binlog → 解析出变更 → 写 Redis（或发 MQ 由消费者写）。相比双写更可靠，业务零侵入，近实时一致。

7. **MySQL→Elasticsearch 同步？** Canal 解析 binlog 后调用 ES Bulk API 更新索引；适合商品/文章搜索实时同步，注意 Mapping 与批量写入。

8. **Canal 组件？** Canal Server（解析 binlog）、Instance（每个 MySQL 实例一个）、Canal Client（业务消费）、可接 Kafka/RocketMQ 投递。

9. **保证不丢消息？** 位点持久化 + 下游 ACK；投递失败重试；MQ 模式下用 MQ 的可靠性（如 RocketMQ 事务/重试）。

10. **Canal 与消息队列如何配合？** Canal 把变更发到 Kafka/RocketMQ，下游多个消费者（缓存、ES、数仓）各自消费，解耦且可重放。

11. **GTID 模式好处？** 基于 GTID 的位点不依赖具体 binlog 文件名/偏移，主从切换后位点连续，切换更平滑。

12. **Canal 能捕获 DDL 吗？** 可以解析 DDL（表结构变更）事件，但下游同步表结构需自行处理（如自动建表/改字段）。

13. **与双写方案对比？** 双写（业务代码同时写 MySQL 和缓存）侵入大、易不一致；Canal 订阅 binlog 无侵入、一致性更好，但有一致性延迟（通常秒级）。

14. **延迟来源？** binlog 产生→Canal 拉取解析→投递下游→下游消费，每一环都可能延迟；高并发下需优化吞吐。

15. **多表 Join 的下游同步？** Canal 只捕获单表变更，跨表聚合（如宽表）需下游自己关联或借助 Flink 做流 Join。

16. **Canal 高可用？** 多 Canal Server + ZooKeeper 选主，Instance 故障自动切换；避免单点。

17. **与 DataX 区别？** DataX 是离线批量同步（定时全量/增量），Canal 是实时增量 CDC；二者常互补（DataX 初始化全量 + Canal 增量）。

18. **坑：binlog 格式/权限？** 必须 ROW 模式 + 开启 binlog；Canal 账号需 REPLICATION SLAVE/CLIENT 权限；否则连不上或读不到。

19. **数据过滤？** Canal 可按库/表/字段过滤 event，减少无效投递，降低下游压力。

20. **与 MaxWell 对比？** MaxWell 也是 MySQL binlog CDC，输出 JSON 到 Kafka，轻量；Canal 更偏向阿里生态、支持直连客户端与多投递。

21. **下游消费幂等？** binlog 可能重复投递（如重试），下游按主键/唯一键 upsert 保证幂等，避免重复写。

22. **选型建议？** MySQL 实时同步到缓存/ES/数仓 → Canal；多数据源/流处理/更强一致性 → Flink CDC；纯离线 → DataX。

---
## 十、与其他板块的关系

- 和「**基础知识/MQ**」：Canal 常投递到 Kafka / RocketMQ，再由下游消费。
- 和「**基础知识/ES 体系**」：Canal 是把 MySQL 实时同步到 ES 的标准管道。
- 和「**基础知识/Redis**」：Canal 是解决「缓存与 DB 一致性」的权威方案。
- 和「**大数据/Flink**」：binlog → Kafka → Flink 构成实时数仓链路。
