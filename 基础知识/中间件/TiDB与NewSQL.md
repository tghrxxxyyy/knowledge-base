# TiDB 与 NewSQL 深入（架构原理 / Percolator 事务 / Region 调度 / HTAP / 迁移实践 / 选型）

> TiDB 是 **NewSQL 代表**（PingCAP 开源，兼容 MySQL 协议），核心特性：**水平扩展（计算存储分离）+ 强一致分布式事务 + HTAP（行存列存双引擎）**。本篇深入拆解：整体架构、Percolator 分布式事务、Region 调度、TiFlash 列存、迁移实践、选型决策。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| MySQL 扩容难 | 单库容量/写入瓶颈，分库分表复杂（MyCat/ShardingSphere） |
| 分片运维重 | 预分片、扩容迁移、跨片事务——成本高 |
| 事务限制 | 分片方案跨片事务弱/性能差 |
| 分析查询弱 | 在线库做分析 → 影响业务 / 需要额外数仓 |
| 高可用 | MySQL 主从切换有延迟/丢数据风险 |

> 核心认知：**TiDB = 「MySQL 兼容 + 无限水平扩展 + 强一致事务 + 一库两用（OLTP+OLAP）的 NewSQL」**——把 MySQL 的痛点（分片、扩容、分析）从「应用层解决」变为「数据库层解决」。

---

## 二、整体架构（计算与存储分离）

```
SQL 层（TiDB Server，无状态，可水平扩展）
  ├── 解析 SQL → 生成执行计划
  ├── 分布式优化器（下推计算：谓词/聚合/Join）
  ├── 分布式执行引擎（并行扫描多 Region）
  └── 兼容 MySQL 协议（连接/权限/语法）

元数据与调度（PD - Placement Driver，PD Server）
  ├── 集群元数据（表/Region 分布）
  ├── Region 调度（分裂/合并/迁移/均衡）
  ├── TSO 分配（全局单调时间戳）
  └── 基于 Raft 的高可用（PD 集群）

存储层（TiKV - 行存，分布式 KV）
  ├── 数据按 Range 切 Region（默认 ~96MB）
  ├── Region 内 Raft 复制组（3 副本强一致）
  └── MVCC + Percolator 事务

分析引擎（TiFlash - 列存）
  ├── 列式存储（AP 查询加速）
  ├── Raft Learner（异步实时同步行存数据）
  └── TiDB 优化器自动选择行存/列存（HTAP）
```

---

## 三、TiKV 存储引擎（深入）

### 3.1 数据组织

```
表数据 → 编码为 KV：
  t{tableID}_r{rowID} → 行数据
  索引 → i{indexID}_... → 主键

Region 划分：
  数据按 Key Range 切成 Region（默认 96MB）
  每个 Region 是复制/迁移的基本单位
  热点 Region 自动分裂（写入热点 → 拆 Region）

存储结构（RocksDB）：
  行数据：Raft 日志落盘（WAL）→ MemTable → SST
  列数据（TiFlash）：DeltaTree 存储
```

### 3.2 Region 与 Raft

```
每个 Region = 一个 Raft 组（Leader + Followers）

Raft 共识：
  Leader 处理读写（读在 Leader 线性一致 / 或 Learner）
  写入：Leader → 复制到 Followers（多数派确认）→ 提交
  选举：Leader 故障 → Followers 选举新 Leader

3 副本容错：
  任意 1 副本故障可用（多数派 2/3）
  不丢数据（Raft 日志持久化）

Region 状态：
  Raft Leader / Follower / Learner（只同步不参与投票）
  Region 分裂/合并（数据量变化自动调整）
```

---

## 四、分布式事务（Percolator 模型，深入）

### 4.1 两阶段提交思想

```
Percolator = 基于 BigTable 的两阶段提交（2PC）+ 全局时间戳

时间戳：
  PD 分配 TSO（全局单调递增）
  事务 startTS / commitTS

事务流程：
  1. 写事务预写（Primary Key 写 Lock）
  2. 提交：提交 Primary（写入 Commit 记录）
  3. 提交 Secondary（异步批量）
  4. 清理 Lock
```

### 4.2 TiDB 事务细节

```
写路径（两阶段）：
  Phase 1（prewrite）：
    写事务数据 + 加锁（每个 Key 一个 Lock，标记 primary）
    primary 加锁成功 = 预写成功
  Phase 2（commit）：
    提交 primary（commitTS 写入）
    异步提交 secondary

读路径（MVCC）：
  读时检查版本（startTS 之前的提交版本）
  遇锁：等待/回滚（resolve lock）

冲突处理：
  写冲突（同 Key 并发写）→ 等待锁 / 重试（悲观锁模式）
  事务重试 → 新 startTS（乐观模式）
  死锁检测（Wait-for graph）

隔离级别：
  默认 REPEATABLE READ（快照隔离）
  支持悲观锁模式（SELECT ... FOR UPDATE 等场景）
```

### 4.3 大事务注意事项

```
限制：
  事务大小限制（5.0+ 放宽）：单事务 KV 数 ≤ 300k（默认）
  大事务提交慢（同步复制开销）

优化：
  批量写入分批提交
  避免大事务（拆小批）
  批量删除用 DELETE ... LIMIT
```

---

## 五、Region 调度（PD 核心职责）

### 5.1 调度机制

```
PD 收集 Region 状态（心跳）→ 决策调度 → 下发

调度类型：
  均衡调度：Region 在 TiKV 间分布均衡（容量/读写负载）
  热点调度：热点 Region 分裂/迁移（写入/读取热点）
  故障恢复：节点故障 → Region 副本自动补齐
  下线调度：TiKV 下线 → 数据迁走
  分裂合并：Region 过大分裂 / 过小合并

调度目标：
  负载均衡（CPU/磁盘/网络）
  数据安全（副本分散在不同故障域）
  容量均衡（磁盘水位）
```

### 5.2 故障恢复

```
节点故障流程：
  1. Leader 故障 → Raft 选举新 Leader（秒级）
  2. 副本缺失 → PD 调度在健康节点补副本
  3. 数据均衡恢复

丢失数据保护：
  Raft 日志（多数派已持久化 → 不丢）
  Region 数据有 3 副本 → 单节点故障无损

多副本策略：
  跨机架/跨可用区（placement rules）
  数据本地性（就近副本）
```

---

## 六、HTAP 双引擎（深入）

### 6.1 原理

```
TiFlash（列存）：
  每个 Region 的 Learner 角色（同步行存数据到列存）
  异步实时同步（秒级延迟，不阻塞行存写入）

查询分流（TiDB 优化器决策）：
  OLTP 查询（点查/小范围）→ TiKV（行存，低延迟）
  OLAP 查询（聚合/扫描大表）→ TiFlash（列存，高吞吐）
  自动选择 or 强制 Hint（/*+ read_from_storage(tiflash[t]) */）

列存优势：
  列式压缩（体积小）
  向量化执行（批量计算）
  MPP 引擎（并行多节点计算，Join 下推）
```

### 6.2 HTAP 使用场景

```
在线分析：
  业务报表实时查询（数据秒级可见）
  实时大屏/指标看板
  运营分析（不建数仓直接查）

对比传统方案：
  传统：业务库 → CDC → 数仓（T+1 或准实时）
  HTAP：业务库 + TiFlash（无需数据搬运，实时性更强）

注意：
  TiFlash 增加存储/内存成本（双份数据）
  复杂分析仍建议大数据平台（数据湖/数仓）
```

---

## 七、TiDB vs MySQL vs NewSQL 生态

| 维度 | TiDB | MySQL | CockroachDB | OceanBase |
|------|------|-------|-------------|-----------|
| 协议兼容 | MySQL | 原生 | PostgreSQL | MySQL |
| 水平扩展 | 原生 | 分片方案 | 原生 | 原生 |
| 分布式事务 | Percolator 2PC | 无 | 串行化（2PC） | Paxos 事务 |
| HTAP | TiKV+TiFlash | 无 | 无（扩展版有） | 有（列存） |
| 生态工具 | 丰富（Lightning/CDC/DM） | 极丰富 | 一般 | 阿里系 |
| 学习成本 | 中（MySQL 语法） | 低 | 中 | 中 |
| 适用 | 海量数据 MySQL 兼容 | 中小规模 | 分布式 PG 需求 | 阿里生态 |

**选型关注点**：
- MySQL 协议 + 海量数据扩展 → **TiDB**；
- 开源自建 → **TiDB / CockroachDB**（PG 语法选后者）；
- 阿里生态 → **OceanBase / PolarDB-X**；
- 已有 MySQL 中小规模 → 优化/分片方案即可。

---

## 八、迁移实践（从 MySQL 到 TiDB）

### 8.1 迁移路径

```
方案一：全量 + 增量（推荐）
  DM（Data Migration）工具：
    → 全量迁移（dumpling 导出 + Lightning 导入）
    → 增量同步（binlog 持续复制）
    → 切换（停写窗口短，秒级）

方案二：双写 + 切换（无停服）
  业务双写（MySQL + TiDB）→ 校验 → 切读 → 切写

迁移要点：
  语法兼容性检查（DDL/DML 差异）
  索引/分区设计（TiDB 分区策略）
  字符集/时区
  大表优先迁移（分批）
  验证数据一致性（checksum）
```

### 8.2 迁移后优化

```
表设计优化：
  主键选择（避免自增热点 → 用雪花 ID/无序主键）
  分区表（时间分区适合归档查询）
  索引设计（TiDB 执行计划分析）

热点优化：
  自增主键热点 → 随机主键（Snowflake）
  唯一索引 → 降低写热点
  大表扫描 → 下推聚合（MPP）

资源规划：
  内存（TiKV 缓存 + TiFlash 列存）
  磁盘（行存 + 列存双份）
  网络（集群内部复制流量）
```

---

## 九、运维与监控

### 9.1 核心组件监控

```
TiDB：查询延迟/QPS/慢查询/执行计划
PD：Region 数量/调度/TSO 延迟
TiKV：写入延迟/磁盘 IO/Region 状态/GC 进度
TiFlash：同步延迟/查询延迟

关键指标：
  TiKV 写入延迟 P99
  Region 状态（异常数）
  热点 Region
  GC 落后（版本堆积 → 存储膨胀）
  慢查询（EXPLAIN ANALYZE 定位）
```

### 9.2 常见坑

| 坑 | 说明 | 对策 |
|----|------|------|
| 自增主键热点 | 单 Region 写热点 | 随机主键 |
| 大事务 | 提交慢/内存高 | 拆批 |
| GC 堆积 | 版本过多存储膨胀 | 监控 GC 进度 |
| 慢查询 | 无索引扫描全表 | 执行计划分析 |
| TSO 延迟 | PD 压力 | PD 扩容 |
| TiFlash 落后 | 同步延迟 | 检查磁盘/网络 |

---

## 十、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| MySQL 兼容 + 海量数据扩展 | TiDB | OceanBase |
| 新系统原生分布式 | TiDB | CockroachDB |
| 在线分析（HTAP） | TiDB（TiFlash） | OceanBase |
| 阿里云生态 | PolarDB-X | OceanBase |
| 开源自建 | TiDB | CockroachDB |
| PostgreSQL 语法 | CockroachDB | — |
| 存量 MySQL 分片改造 | TiDB（DM 迁移） | Vitess/MyCat |

---

## 十一、与其他板块的关系

- 分片方案对比见「[MyCat 与 Vitess](./MyCat与Vitess.md)」与「[分库分表 ShardingSphere](./分库分表ShardingSphere.md)」；
- 存储引擎见「[RocksDB 与嵌入式 KV 存储](./RocksDB与嵌入式KV存储.md)」；
- MySQL 基础见「[MySQL 知识](../mysql知识.md)」；
- 数据迁移生态见「[云上数据库与缓存生态](./云上数据库与缓存生态.md)」。

> 一句话：**TiDB = TiDB（无状态 SQL 层）+ PD（元数据/TSO/调度）+ TiKV（Raft 行存）+ TiFlash（列存 HTAP）——事务走 Percolator 两阶段提交，扩展靠 Region 自动分裂迁移——选型先看「MySQL 兼容+海量数据→TiDB」，迁移走 DM 全量+增量，生产守则：随机主键防热点、大事务拆批、GC 监控、执行计划分析**。