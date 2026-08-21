# Cassandra / ScyllaDB 深入（Compaction / Tombstone / 多DC复制 / 性能调优）

> Cassandra 是 **Dynamo 风格**的分布式宽列 NoSQL。本篇深入拆解：Compaction 策略选择、Tombstone 处理、多数据中心复制、性能调优、生产 Checklist。

---

## 一、核心原理

### 1.1 Dynamo 架构

```
P2P 环状无主节点，任意节点可读写（可调一致性）

写入流程：
  Client → 任意节点 → Gossip 发现副本 → 复制到 N 副本
  一致性级别决定需要多少副本确认

读取流程：
  Client → 任意节点 → 读取一致性级别决定读几个副本
  → 合并结果（反熵/读修复修复不一致）
```

### 1.2 数据模型

```
Keyspace(库) → Table(表) → Row(行)
  Partition Key(分区键): 决定数据存哪节点（哈希分布）
  Clustering Key(聚簇键): 行内排序

查询模型受限：
  必须按 Partition Key 查（单分区/等值）
  支持分区内范围查询
  不能随意二级索引/全表扫描
```

### 1.3 一致性级别

| 级别 | 写 | 读 | 一致性 |
|------|----|----|--------|
| ANY | 1 副本（含 Hint） | — | 最低 |
| ONE | 1 副本确认 | 1 副本返回 | 弱 |
| TWO | 2 副本确认 | — | 中 |
| QUORUM | ⌈N/2⌉+1 副本确认 | ⌈N/2⌉+1 副本返回 | 强 |
| ALL | 所有副本确认 | 所有副本返回 | 最强 |

> **读写一致公式**：W + R > N → 读写有交集 → 强一致

---

## 二、Compaction 策略（深入）

### 2.1 为什么需要 Compaction

```
SSTable 只追加不修改 → 同一个 key 可能出现在多个 SSTable
Compaction = 合并多个 SSTable → 去重/删除过期数据/Tombstone 清理

写放大 = Compaction 反复重写数据
空间放大 = 未合并的 SSTable 占用额外空间
```

### 2.2 三种策略

| 策略 | 原理 | 适用 |
|------|------|------|
| SizeTiered | 按大小合并（小文件合并成大文件） | 写密集、时序数据 |
| Leveled | 每层大小固定，合并保证层内无重叠 | 读密集、低空间放大 |
| TimeWindow | 按时间窗口合并（如每小时/每天） | **时序数据首选** |

### 2.3 选择指南

```
IoT 传感器/事件流 → TimeWindow（按时间窗口合并，写放大最低）
读多写少 → Leveled（空间放大低，读性能好）
写多读少 → SizeTiered（写放大低）
混合负载 → SizeTiered + 合理窗口

配置：
  compaction = {'class': 'TimeWindowCompactionStrategy',
                'compaction_window_size': 1,
                'compaction_window_unit': 'HOURS'}
```

---

## 三、Tombstone 处理

### 3.1 Tombstone 是什么

```
Cassandra 不支持物理删除（SSTable 只追加）
删除 = 写入一个 Tombstone 标记
Compaction 时清理 Tombstone + 被标记的数据

Tombstone 生命周期：
  1. 写入 Tombstone（标记删除）
  2. 传播到所有副本（gossip）
  3. GC Grace Seconds（默认 10 天）后清理
  4. Compaction 时物理删除
```

### 3.2 Tombstone 问题

```
问题：
  大量 Tombstone → 查询时扫描大量已删除数据 → 超时/OOM
  GC Grace 期内 Tombstone 未清理 → 数据"复活"（最坏情况）

常见坑：
  全表删除 → 大量 Tombstone → 查询超时
  Tombstone 超过阈值（默认 1000）→ 抛 Tombstone 异常
```

### 3.3 解决方案

| 方案 | 说明 |
|------|------|
| 调整 GC Grace | 缩短 GC Grace Seconds（如 1 天），但影响反熵修复窗口 |
| TTL | 设置 TTL 自动过期，避免手动删除 |
| 分区设计 | 避免大分区（减少 Tombstone 数量） |
| 后台清理 | `nodetool compact` 强制触发 Compaction |

---

## 四、多数据中心复制

### 4.1 架构

```
DC1（数据中心1）+ DC2（数据中心2）
  → 数据写入任意 DC → 异步复制到另一个 DC
  → 本地 QUORUM 优先（低延迟）
  → 跨 DC 异步（最终一致）

NetworkTopologyStrategy：
  定义每个 DC 的复制因子
  本地 DC 同步，跨 DC 异步

CREATE KEYSPACE mykeyspace
WITH replication = {
  'class': 'NetworkTopologyStrategy',
  'DC1': 3,
  'DC2': 3
};
```

### 4.2 多 DC 最佳实践

| 实践 | 说明 |
|------|------|
| 本地优先 | 查询走本地 DC（低延迟） |
| 跨 DC 异步 | 复制延迟可接受（秒级） |
| DC 故障 | 单 DC 挂了不影响另一个 DC |
| 数据本地化 | 按 DC 隔离数据（如按地域） |
| 负载均衡 | 读写均匀分布到多个 DC |

---

## 五、性能调优

### 5.1 写入优化

| 优化 | 说明 |
|------|------|
| 批量写 | 同一 Partition Key 的数据批量写（原子性） |
| 减少 Tombstone | 避免全表删除，用 TTL |
| 降低一致性 | 写 ONE（非 QUORUM） |
| 增加 Commit Log 缓冲 | commitlog_sync = batch（性能最好） |

### 5.2 读取优化

| 优化 | 说明 |
|------|------|
| 限制返回列 | SELECT 指定列，避免 SELECT * |
| 分区裁剪 | WHERE 带 Partition Key |
| 限制结果集 | LIMIT 限制返回行数 |
| 布隆过滤器 | 布隆过滤器拦截不存在的分区 |

### 5.3 JVM 调优

```
堆内存：
  -Xms = -Xmx（避免动态调整）
  推荐：数据量 10%~20%（如 16GB 数据 → 2~4GB 堆）
  堆外内存：offheapMemAllocatorTotal（索引缓存）

GC：
  G1GC（推荐）：-XX:+UseG1GC -XX:MaxGCPauseMillis=200
  避免 CMS（已废弃）

JVM 参数：
  -XX:MaxTenuringThreshold=0（减少晋升延迟）
  -XX:ParallelGCThreads=8（并行 GC 线程）
```

---

## 六、生产 Checklist

| 检查项 | 说明 |
|--------|------|
| 副本数 | 生产 ≥ 3（跨 3 个可用区） |
| 一致性级别 | 写 QUORUM + 读 ONE（或写 ONE + 读 QUORUM） |
| Compaction | 时序数据选 TimeWindow |
| Tombstone | 监控 Tombstone 数量，设置告警 |
| GC Grace | 根据网络延迟调整（跨 DC 适当延长） |
| 分区大小 | 单分区 < 100MB（避免大分区） |
| 节点监控 | CPU/内存/磁盘/延迟 |
| 备份 | 定期 Snapshot 备份 |

---

## 七、与其他板块的关系

- HBase 对比见「[HBase 列式存储](./HBase列式存储.md)」；
- 大数据写入见「[大数据/06-分布式NoSQL与HBase](../大数据/06-分布式NoSQL与HBase.md)」；
- 云上对应见「[云上数据库与缓存生态](./云上数据库与缓存生态.md)」（AWS Keyspaces/ScyllaDB Cloud）。

> 一句话：**Cassandra = 写为王的去中心化宽列库：无主环 + 可调一致性 + vnode 免重分——生产关键：Compaction 策略选 TimeWindow + Tombstone 监控 + 多 DC 本地优先**。

---

## 六、Cassandra vs HBase vs DynamoDB

| 维度 | Cassandra | HBase | DynamoDB |
|------|-----------|-------|----------|
| 架构 | 去中心化（无主） | 主从（HMaster + RegionServer） | 全托管 |
| 数据模型 | 宽列 | 宽列 | KV + 文档 + 宽列 |
| 一致性 | 可调（ONE/QUORUM/ALL） | 强一致 | 最终/强一致 |
| 写性能 | 极高（无锁追加） | 高（LSM-Tree） | 高（托管） |
| 读性能 | 中（需分区键） | 高（列族缓存） | 高（索引） |
| 扩展 | 线性扩展 | Region 拆分 | 自动扩展 |
| 运维 | 中（P2P 自愈） | 重（HDFS + ZK） | 免运维 |
| 适用 | 时序/IoT/事件流 | 大数据宽表 | 通用 |

---

## 七、ScyllaDB（Cassandra 替代）

ScyllaDB 是用 C++ 重写的 Cassandra 替代品：

| 特性 | ScyllaDB | Cassandra |
|------|----------|-----------|
| 语言 | C++（无 GC） | Java（有 GC） |
| 性能 | 10x+ 提升 | 基准 |
| 延迟 | P99 更低 | 中等 |
| 兼容性 | 完全兼容 CQL | CQL |
| 资源占用 | 低 | 高（JVM） |
| 运维 | 更简单 | 中等 |

---

## 八、生产 Checklist（扩展）

| 检查项 | 说明 |
|--------|------|
| 副本数 | 生产 ≥ 3（跨 3 个可用区） |
| 一致性级别 | 写 QUORUM + 读 ONE（或写 ONE + 读 QUORUM） |
| Compaction | 时序数据选 TimeWindow |
| Tombstone | 监控 Tombstone 数量，设置告警 |
| GC Grace | 根据网络延迟调整（跨 DC 适当延长） |
| 分区大小 | 单分区 < 100MB（避免大分区） |
| 节点监控 | CPU/内存/磁盘/延迟 |
| 备份 | 定期 Snapshot 备份 |
| 多 DC | 本地优先读写，跨 DC 异步复制 |
| 扩容 | 原地扩容（加节点 + 重分 token） |

---

## 九、CQL（Cassandra Query Language）

```sql
-- 创建表
CREATE TABLE user_events (
    user_id UUID,
    event_time TIMESTAMP,
    event_type TEXT,
    event_data MAP<TEXT, TEXT>,
    PRIMARY KEY ((user_id), event_time)
) WITH CLUSTERING ORDER BY (event_time DESC);

-- 查询（必须带 Partition Key）
SELECT * FROM user_events WHERE user_id = ? AND event_time > '2026-01-01';

-- 插入
INSERT INTO user_events (user_id, event_time, event_type)
VALUES (uuid(), toTimestamp(now()), 'login');

-- 删除（写入 Tombstone）
DELETE FROM user_events WHERE user_id = ? AND event_time = ?;

-- TTL（自动过期）
INSERT INTO user_events (user_id, event_time, event_type)
VALUES (uuid(), toTimestamp(now()), 'session')
USING TTL 86400;
```

### CQL vs SQL 区别

| 特性 | CQL | SQL |
|------|-----|-----|
| WHERE | 必须带 Partition Key | 任意字段 |
| JOIN | 不支持 | 支持 |
| GROUP BY | 有限支持 | 完整支持 |
| 二级索引 | 支持但性能差 | 支持 |
| 事务 | 轻量事务（Paxos） | 完整事务 |

---

## 十、与其他板块的关系（扩展）

- HBase 对比见「[HBase 列式存储](./HBase列式存储.md)」；
- 大数据写入见「[大数据/06-分布式NoSQL与HBase](../大数据/06-分布式NoSQL与HBase.md)」；
- 云上对应见「[云上数据库与缓存生态](./云上数据库与缓存生态.md)」（AWS Keyspaces/ScyllaDB Cloud）；
- 时序场景见「[时序库](../时序库/README.md)」；
- 对比 MongoDB 见「[MongoDB](./MongoDB.md)」。

---

## 十、速查表（扩展）

| 项 | 结论 |
|----|------|
| 类型 | 去中心化宽列 NoSQL |
| 架构 | Dynamo 风格（无主、gossip 协议） |
| 一致性 | 可调（ONE/QUORUM/ALL） |
| 存储 | LSM-Tree（SSTable + Commit Log） |
| Compaction | SizeTiered / Leveled / TimeWindow |
| Tombstone | 删除标记，GC Grace 后清理 |
| 多 DC | NetworkTopologyStrategy（本地优先） |
| 查询 | 必须按 Partition Key 查 |
| 许可证 | Apache 2.0 |
| 一句话 | 「写为王的去中心化宽列库——时序/IoT/事件流首选」 |
