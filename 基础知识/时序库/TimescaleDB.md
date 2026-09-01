# TimescaleDB 详解

> 时序库板块子文档。概述见 [README](./README.md)。

TimescaleDB 是**基于 PostgreSQL 的时序数据库扩展（extension）**，以插件形式运行在 PostgreSQL 之上，复用 PG 的 SQL、事务、索引、扩展与生态。它的核心卖点是：**在保留完整关系型能力（JOIN、事务、窗口函数、丰富类型）的同时，通过超表（hypertable）、连续聚合、列式压缩获得时序场景的高性能与低成本**。适合「既有时序数据，又需要关系分析 / 强一致事务」的混合型业务。

---

## 1. 定位与适用场景

### 1.1 定位

- 不是另起炉灶的专用 TSDB，而是 **PostgreSQL 的一个扩展（extension）**，通过 `CREATE EXTENSION timescaledb;` 启用。
- 100% 兼容 PG：可用 JDBC/psycopg/任何 PG 驱动，支持事务、外键、JSONB、PostGIS 等全部 PG 能力。
- 面向「**时序 + 关系混合**」：设备元数据在关系表，指标在超表，二者直接 JOIN。

### 1.2 适用场景

| 场景 | 说明 |
|------|------|
| 监控 / 可观测性 | 指标存超表，主机/服务元数据存关系表，关联分析 |
| IoT 平台 | 设备上报时序 + 设备档案关系数据同库 |
| DevOps / 业务指标 | 既做聚合看板，又做明细钻取与事务写入 |
| 金融 / 交易时序 | 需要事务一致性的订单/报价时序 |
| 地理时序 | 配合 PostGIS 做轨迹/位置时序 |

### 1.3 不适用

- 超高频纯写入（千万 points/s 级）、极致压缩比需求 → 专用 TSDB（TDengine / Lindorm）更优。
- 不愿运维 PostgreSQL、希望全托管 Serverless → 考虑云厂商托管或专用 TSDB。

---

## 2. 核心概念

### 2.1 Hypertable（超表）

- 超表是**用户视角的逻辑表**，使用方式与普通 PG 表完全一致（INSERT/SELECT/JOIN）。
- 引擎在底层把它按时间（和可选空间维度）**自动切成多个 chunk（物理分区）**，对用户透明。

### 2.2 Chunk（数据分片）

- chunk 是超表的物理分区，每个 chunk 是底层一张真实的 PG 表（内部命名 `_hyper_<id>_chunk`）。
- 按时间区间（如每 7 天）或空间维度（如 device_id 哈希）切分。
- 好处：旧 chunk 可独立压缩、删除、迁移；新数据写入只触及活跃 chunk，避免全局索引膨胀。

### 2.3 维度分区

- **时间维度**：必选，按时间戳切 chunk。
- **空间维度**：可选，按某列（如 `device_id`、`location_id`）哈希/列表分到不同 chunk，利于多设备并行写入。

```mermaid
flowchart TB
    subgraph HT["Hypertable（逻辑表 sensor_readings）"]
        direction TB
        C1["chunk: 2026-07-01 ~ 07-07"]
        C2["chunk: 2026-07-08 ~ 07-14"]
        C3["chunk: 2026-07-15 ~ 07-21"]
        C4["chunk: 2026-07-22 ~ 07-28"]
    end

    Raw[("原始时序写入")] --> HT
    HT --> Q[("查询：自动路由到相关 chunk")]

    subgraph Life["生命周期管理"]
        L1[热 chunk：行存 + 索引]
        L2[冷 chunk：列式压缩]
        L3[超期 chunk：按保留策略删除/沉降]
    end

    C4 -. 当前写入 .-> L1
    C1 & C2 & C3 -. 策略触发 .-> L2
    L2 -. TTL 到期 .-> L3
```

---

## 3. 连续聚合（Continuous Aggregates）

连续聚合是 TimescaleDB 的「物化视图式降采样」：后台按策略将明细聚合结果物化到一张聚合超表，查询直接命中物化结果，避免每次重算。

```sql
-- 1) 创建基础超表
CREATE TABLE sensor_readings (
    time        TIMESTAMPTZ NOT NULL,
    device_id   TEXT,
    temperature DOUBLE PRECISION,
    humidity    DOUBLE PRECISION
);
SELECT create_hypertable('sensor_readings', 'time',
       chunk_time_interval => INTERVAL '7 days');

-- 2) 创建连续聚合：每 1 小时每设备平均温湿度
CREATE MATERIALIZED VIEW readings_hourly
WITH (timescaledb.continuous) AS
SELECT device_id,
       time_bucket('1 hour', time) AS bucket,
       AVG(temperature) AS avg_temp,
       MAX(temperature) AS max_temp,
       AVG(humidity)    AS avg_hum
FROM sensor_readings
GROUP BY device_id, time_bucket('1 hour', time);

-- 3) 配置自动刷新策略（每 1 小时刷新最近 3 天窗口）
SELECT add_continuous_aggregate_policy('readings_hourly',
       start_offset => INTERVAL '3 days',
       end_offset   => INTERVAL '1 hour',
       schedule_interval => INTERVAL '1 hour');
```

查询时直接读聚合表，速度极快：

```sql
SELECT * FROM readings_hourly
WHERE device_id = 'dev-01'
  AND bucket >= NOW() - INTERVAL '24 hours'
ORDER BY bucket;
```

---

## 4. 原生列压缩（Columnar Compression）

TimescaleDB 对 chunk 启用**列式压缩**（基于 Gorilla / 字典 / 数组压缩，依赖 `timescaledb_toolkit`/内置），将行存 chunk 转成列存压缩格式，压缩率通常 4:1 ~ 10:1，且**压缩后仍可查询**（自动解压）。

```sql
-- 对超表启用压缩，并指定压缩顺序列（与时间相关的列优先）
ALTER TABLE sensor_readings SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'time DESC',
    timescaledb.compress_segmentby = 'device_id'
);

-- 配置压缩策略：chunk 超过 7 天自动压缩
SELECT add_compression_policy('sensor_readings', INTERVAL '7 days');

-- 查看压缩前后大小
SELECT hypertable_size('sensor_readings') AS total_bytes,
       pg_size_pretty(hypertable_size('sensor_readings')) AS pretty;
```

```sql
-- 手动压缩 / 解压某个具体 chunk
SELECT compress_chunk('_timescaledb_internal._hyper_1_2_chunk');
SELECT decompress_chunk('_timescaledb_internal._hyper_1_2_chunk');
```

> 实测参考：温度（double，变化平滑）配合 `segmentby=device_id` + `orderby=time`，常见压缩比 **8:1 ~ 15:1**；压缩后点查/区间扫描性能接近行存，聚合扫描因列存更优。

---

## 5. 数据保留策略与 Chunk 管理

### 5.1 保留策略（自动删旧）

```sql
-- 超过 90 天的数据自动删除
SELECT add_retention_policy('sensor_readings', INTERVAL '90 days');

-- 也可「沉降」而非删除：配合压缩 + 外部冷存（需自行归档 chunk）
```

### 5.2 Chunk 管理

```sql
-- 查看所有 chunk
SELECT show_chunks('sensor_readings');

-- 查看某个时间范围的 chunk
SELECT show_chunks('sensor_readings',
       older_than => INTERVAL '30 days',
       newer_than => INTERVAL '60 days');

-- 手动删除旧 chunk（等价于保留策略效果）
SELECT drop_chunks('sensor_readings', INTERVAL '90 days');

-- 将某 chunk 迁移到不同表空间（冷热分离）
SELECT move_chunk('_timescaledb_internal._hyper_1_2_chunk',
       destination_tablespace => 'cold_ssd');
```

### 5.3 手动 / 自动 Compaction

底层 chunk 经大量 UPDATE/DELETE 后会产生膨胀，TimescaleDB 的压缩动作本身即完成「重写 + 压缩」。也可结合 PG 原生 `VACUUM` / `pg_repack` 处理未压缩活跃 chunk 的膨胀。

---

## 6. 分布式（Multinode）

TimescaleDB 支持 **multinode**：一个 **access node**（协调节点，接受 SQL、做计划分发）连接多个 **data node**（存储与计算 chunk）。

```mermaid
flowchart LR
    App[("应用 SQL")] --> AN["Access Node\n(协调节点)"]
    AN --> DN1["Data Node 1\n(chunk 分片)"]
    AN --> DN2["Data Node 2\n(chunk 分片)"]
    AN --> DN3["Data Node 3\n(chunk 分片)"]
```

```sql
-- 添加数据节点（需在每台 PG 上先装 timescaledb 扩展）
SELECT add_data_node('dn1', host => '10.0.1.11', port => 5432);
SELECT add_data_node('dn2', host => '10.0.1.12', port => 5432);

-- 创建分布式超表（指定空间维度分片到数据节点）
SELECT create_distributed_hypertable('sensor_readings', 'time',
       'device_id', replication_factor => 1);
```

> 注意：TimescaleDB 的 multinode 在较新版本中定位调整（社区版以单实例 + 压缩为主，云版提供更多分布式能力），生产前核对所用版本的官方支持状态。

---

## 7. 写入 / 查询示例（SQL）

```sql
-- 建表 + 超表
CREATE TABLE metrics (
    time    TIMESTAMPTZ NOT NULL,
    host    TEXT,
    cpu     DOUBLE PRECISION,
    mem     DOUBLE PRECISION
);
SELECT create_hypertable('metrics', 'time',
       chunk_time_interval => INTERVAL '1 day',
       partitioning_column => 'host',    -- 空间维度
       number_partitions   => 4);

-- 批量写入
INSERT INTO metrics (time, host, cpu, mem) VALUES
  ('2026-07-28 10:00:00+08', 'web01', 0.81, 0.62),
  ('2026-07-28 10:00:00+08', 'web02', 0.74, 0.58),
  ('2026-07-28 10:01:00+08', 'web01', 0.83, 0.64);

-- 区间聚合 + 降采样（每 5 分钟）
SELECT time_bucket('5 minutes', time) AS bucket,
       host,
       AVG(cpu) AS avg_cpu,
       MAX(cpu) AS max_cpu
FROM metrics
WHERE time >= NOW() - INTERVAL '6 hours'
GROUP BY bucket, host
ORDER BY bucket, host;

-- 与关系表 JOIN（设备元数据）
SELECT m.time, m.host, m.cpu, d.owner, d.region
FROM metrics m
JOIN devices d ON d.host = m.host
WHERE m.time >= NOW() - INTERVAL '1 hour';
```

---

## 8. 与纯 TSDB（InfluxDB / TDengine）对比

| 维度 | TimescaleDB | InfluxDB | TDengine |
|------|-------------|----------|----------|
| SQL 能力 | 完整 PG SQL | InfluxQL / Flux（有限 SQL） | TDengine SQL（类 SQL） |
| 事务 | 强（PG ACID） | 弱 | 弱 |
| 生态扩展 | 极强（PostGIS/JSONB/任意 PG 扩展） | 中（TICK 生态） | 中 |
| 关系分析 | 强（原生 JOIN） | 弱 | 弱 |
| 写入吞吐 | 中（PG 行存上限，靠批写/压缩改善） | 高 | 很高 |
| 压缩比 | 中高（4~10:1） | 高 | 很高（自研） |
| 部署运维 | 需懂 PG | 单进程较简单 | 较简单 |
| 适用 | 时序+关系混合、要事务 | 纯监控/DevOps | 国产 IoT/运维替代 |

**优势**：SQL/事务/生态完整，开发无需学新查询语言，关系分析强。
**劣势**：超高写入吞吐与极限压缩比弱于专用 TSDB；运维要懂 PostgreSQL；单实例扩展天花板低于存算分离架构。

---

## 9. 生产实践与踩坑

### 9.1 Chunk 大小（关键调参）

- chunk 太大（如 30 天）→ 压缩/删除粒度粗，单 chunk 索引大。
- chunk 太小（如 1 小时）→ chunk 数量爆炸，元数据与规划开销大。
- **经验**：单 chunk 压缩前 25MB~数 GB、压缩后数 MB~数百 MB 为宜；高频写入用 1~7 天，低频用更长。用 `chunk_time_interval` 控制。

### 9.2 连续聚合刷新策略

- `end_offset` 留余量（如 1 小时）避免「最新数据尚未物化」导致看板缺口。
- `start_offset` 不用太大，否则每次刷新扫描过旧数据、浪费资源。
- 聚合层级可叠加：明细 → 1 分钟 → 1 小时 → 1 天，逐级物化。

### 9.3 压缩后查询

- 压缩 chunk **可直接查**，但**大量 UPDATE/DELETE 到已压缩 chunk 会触发自动解压并重压缩**，写入放大明显。
- 已压缩数据视为不可变：业务上对历史数据做修正应先 `decompress_chunk` 再改，或设计为只追加（append-only）。
- `segmentby` 选高基数列（如 device_id）能让同类数据聚在一起，提升压缩率与按设备过滤性能；`orderby` 选 time 让时间局部性最优。

### 9.4 其他

- 活跃 chunk 的膨胀用 `VACUUM` / `pg_repack` 治理。
- 监控：关注 `hypertable_size`、压缩比、连续聚合刷新延迟、chunk 数量。
- 备份用 PG 原生 `pg_basebackup` / WAL 归档；云版用托管快照。

---

## 10. 运维实战与性能调优

### 10.1 Chunk 大小调优

chunk 是超表物理分区，大小直接决定压缩/删除粒度与规划开销。

```sql
-- 调整时间分片区间（高频写入用 1~7 天）
SELECT set_chunk_time_interval('sensor_readings', INTERVAL '1 day');

-- 查看各 chunk 大小，判断是否需要调整
SELECT chunk_name,
       pg_size_pretty(hypertable_chunk_size) AS size
FROM chunk_relation_sizes('sensor_readings')
ORDER BY hypertable_chunk_size DESC;
```

经验准则：
- 单 chunk 压缩前 25MB~数 GB、压缩后数 MB~数百 MB 为宜。
- 高频写入（秒级）→ 1~3 天；中低频（分钟级）→ 7~30 天。
- 过小 → chunk 数量爆炸，规划与元数据开销大；过大 → 删除/压缩粒度粗。

### 10.2 连续聚合刷新策略

```sql
-- 分层聚合：明细 -> 1m -> 1h -> 1d 逐级物化
SELECT add_continuous_aggregate_policy('readings_1h',
       start_offset => INTERVAL '3 days',
       end_offset   => INTERVAL '1 hour',
       schedule_interval => INTERVAL '1 hour');

-- 手动刷新指定窗口（回补/修复用）
CALL refresh_continuous_aggregate('readings_1h',
       NOW() - INTERVAL '7 days', NOW() - INTERVAL '1 hour');
```

要点：
- `end_offset` 留 1h 余量，避免最新数据未物化导致看板缺口。
- `start_offset` 不宜过大，否则每次刷新扫过旧数据浪费资源。
- 层级叠加时，上层（1h）从下层（1m）读，而非从明细读，减少重算。

### 10.3 压缩策略（按年龄）

```sql
-- 超过 7 天的 chunk 自动压缩
SELECT add_compression_policy('sensor_readings', INTERVAL '7 days');

-- 压缩策略 + 保留策略组合：先压缩再过期
SELECT add_retention_policy('sensor_readings', INTERVAL '180 days');

-- 查看压缩率
SELECT hypertable_name,
       pg_size_pretty(hypertable_size) AS total
FROM hypertables
WHERE hypertable_name = 'sensor_readings';
```

> 已压缩 chunk 视为不可变：对其 UPDATE/DELETE 会触发自动解压+重压缩，写放大明显。历史修正应先 `decompress_chunk` 再改，或设计 append-only。

### 10.4 Multinode 运维

```sql
-- 检查数据节点状态
SELECT * FROM timescaledb_information.data_nodes;

-- 查看分布式超表的分片分布
SELECT * FROM timescaledb_information.chunks
WHERE hypertable_name = 'sensor_readings';

-- 节点故障：重新加回或替换
SELECT delete_data_node('dn2');
SELECT add_data_node('dn2', host => '10.0.1.12');
```

运维要点：
- access node 是 SQL 入口与计划分发点，需重点保障可用性与备份。
- data node 故障时，依赖 replication_factor 提供副本；副本不足会丢写入。
- 较新社区版以单实例 + 压缩为主，multinode 能力以云版更完整，生产前核对版本支持。

### 10.5 与 PG 生态联动（PostgREST / FDW）

TimescaleDB 即 PostgreSQL，可直接复用整个 PG 生态：

```sql
-- 1) 用 postgres_fdw 关联外部业务库（订单库）做跨库分析
CREATE EXTENSION postgres_fdw;
CREATE SERVER orders_srv FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host '10.0.2.5', dbname 'orders');
CREATE USER MAPPING FOR CURRENT_USER SERVER orders_srv
  OPTIONS (user 'ro', password 'xxx');
IMPORT FOREIGN SCHEMA public LIMIT TO (orders)
  FROM SERVER orders_srv INTO public;

-- 时序 + 业务 JOIN
SELECT m.device_id, SUM(m.temperature), o.region
FROM sensor_readings m
JOIN orders o ON o.device_id = m.device_id
WHERE m.time >= NOW() - INTERVAL '1 day'
GROUP BY m.device_id, o.region;
```

- **PostgREST**：把超表直接暴露为 REST API，前端/BI 无需写 SQL 即可查询聚合结果（适合只读看板）。
- **FDW / dblink**：关联 MySQL/Oracle/数仓做混合分析。
- **PostGIS**：地理时序（轨迹/位置）直接用 GIS 函数处理。

### 10.6 故障排查 checklist

- [ ] 写入慢 → 检查活跃 chunk 是否膨胀（VACUUM/pg_repack）、索引是否过多。
- [ ] 压缩比低 → 查 `segmentby`/`orderby` 设置，是否高基数列未选对。
- [ ] 连续聚合缺口 → 查刷新策略 `end_offset`、刷新任务是否失败。
- [ ] 查询慢 → 是否命中聚合表，是否带时间下界。
- [ ] 磁盘涨 → 保留策略/压缩策略是否生效，旧 chunk 是否被删。

---

## Hypertable 创建与 Chunk Interval 调优方法论

```sql
-- 标准创建流程：普通表 → create_hypertable → 空间维度可选
CREATE TABLE conditions (
    time        TIMESTAMPTZ NOT NULL,
    device_id   TEXT,
    temperature DOUBLE PRECISION,
    humidity    DOUBLE PRECISION
);
SELECT create_hypertable('conditions', 'time',
       chunk_time_interval => INTERVAL '1 day',
       partitioning_column => 'device_id',
       number_partitions   => 8);

-- 运行期调整（对已有 chunk 不生效，只影响新 chunk）
SELECT set_chunk_time_interval('conditions', INTERVAL '6 hours');
```

chunk interval 推导公式：

```text
目标：单 chunk 压缩前 25MB ~ 数 GB

chunk_interval ≈ 目标chunk大小 ÷ 写入速率
示例：
  写入速率 = 10000 设备 × 1 点/10s × 200B/行 ≈ 20MB/min
  目标 2GB → 2GB ÷ 20MB/min ≈ 100min → 取 1~2 小时
低频场景（分钟级上报）：写入 0.5MB/min → 取 7 天更合理
```

| 症状 | 诊断 | 处置 |
|------|------|------|
| 查询计划列出上千 chunk | interval 过小 | 调大 + `reorder`；必要时重建表 |
| 单 chunk 压缩耗时 >10min | interval 过大 | 调小让压缩任务增量执行 |
| 写入延迟周期性抖动 | 新 chunk 创建风暴 | 预建 chunk + 错开空间分区数 |

## 连续聚合：实时 + 物化双模式

```sql
-- materialized_only=false：物化区 + 实时区自动拼接
-- （新数据未刷新时直接查明细实时计算，看板无缺口）
CREATE MATERIALIZED VIEW cond_5m
WITH (timescaledb.continuous) AS
SELECT device_id,
       time_bucket(INTERVAL '5 minutes', time) AS bucket,
       AVG(temperature) AS avg_temp, MAX(humidity) AS max_hum
FROM conditions
GROUP BY device_id, bucket
WITH NO DATA;

ALTER MATERIALIZED VIEW cond_5m SET (
    timescaledb.materialized_only = false    -- 关键开关
);

-- 刷新策略：每小时回刷最近 3h（重叠窗口容忍迟到数据）
SELECT add_continuous_aggregate_policy('cond_5m',
       start_offset => INTERVAL '3 hours',
       end_offset   => INTERVAL '0 minutes',
       schedule_interval => INTERVAL '1 hour');
```

| 模式 | 行为 | 适用 |
|------|------|------|
| materialized_only=true | 只返回已物化数据，最快但可能缺最新值 | 历史报表 |
| materialized_only=false | 物化区 + 实时明细 UNION | **监控看板默认推荐** |

分层叠加最佳实践：1m 聚合从明细刷 → 1h 从 1m 刷 → 1d 从 1h 刷；上层查询命中下层聚合，重算成本指数级下降。

## 压缩策略：segmentby / orderby 与压缩率实测

```sql
ALTER TABLE conditions SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id',  -- 高基数分组列
    timescaledb.compress_orderby = 'time DESC'     -- 组内时间排序
);
SELECT add_compression_policy('conditions', INTERVAL '7 days');
```

```text
参数选择原理：
  segmentby 决定「分组的边界」——同设备的数据连续存放，
  delta/dictionary 编码才能发挥（相似值相邻）
  orderby 决定「组内排列」——时序按时间排后 delta-of-delta 最优

实测参考（单表 5000 万行）：
  无压缩                    ：12.8 GB
  segmentby=device_id only  ：2.9 GB（4.4:1）
  + orderby=time DESC       ：1.1 GB（11.6:1）
  orderby 缺失（随机顺序）  ：4.7 GB（仅 2.7:1）

常见错误：
  把低基数列（region）做 segmentby → 组过大，编码失效
  把高基数列（device_id+time）都放 segmentby → 组碎成单行
  对压缩 chunk 频繁 UPDATE → 反复解压重压，写放大 10×+
```

验证命令：`hypertable_compression_stats('conditions')` 查看 per-chunk 压缩比；低于 5:1 时优先检查 segmentby 选择。

## TimescaleDB vs PostgreSQL 原生分区对比

| 维度 | PG 原生声明式分区 | TimescaleDB Hypertable |
|------|-------------------|------------------------|
| 分区创建 | 手工/pg_partman 定时建 | 自动按需创建 |
| 空间维度 | 仅 RANGE/LIST/HASH 单层 | 时间 × 空间多维原生支持 |
| 自动压缩 | ❌ | ✅ 列式压缩策略 |
| 保留策略 | 手工 DROP 分区/pg_partman | add_retention_policy 一行配置 |
| 连续聚合 | 手动物化视图 + 自管刷新 | 内建增量刷新 + 实时拼接 |
| 跨分区并行查询 | 优化器逐步增强 | 针对 chunk 的并行与裁剪优化 |

```text
什么时候 PG 原生分区就够：
  数据量 < 千万级、无压缩诉求、只有简单时间裁剪——
  引入扩展的运维成本不划算
什么时候必须上 TimescaleDB：
  chunk 级生命周期自动化、列压降本、连续聚合、
  以及未来可能的多节点水平扩展诉求
迁移路径：PG 表 → create_hypertable 可原地转换存量表，
         原生分区表需先合并或逐分区转换
```

## 多节点分布式 Hypertable 实践

```sql
-- 架构：Access Node(协调) + N 个 Data Node
SELECT add_data_node('dn1', host => '10.0.1.11',
       database => 'tsdb', password => '***');
SELECT add_data_node('dn2', host => '10.0.1.12');

-- 分布式超表：时间 + 空间两维路由到 data node
SELECT create_distributed_hypertable('conditions', 'time', 'device_id',
       chunk_time_interval => INTERVAL '1 day',
       replication_factor  => 2);      -- 副本容灾
```

```text
运维要点：
① AN 是唯一 SQL 入口：做好 AN 高可用（ Patroni/云托管 PG）
② replication_factor ≥2 才能扛单 DN 故障；副本不足会拒绝写入
③ 查询下推：带 device_id 过滤可只命中相关 DN，
   全表聚合则扇出到所有 DN 汇总（网络开销随节点数增长）
④ 版本注意：社区版 multinode 支持在收缩，生产分布式形态
   以 Timescale 云服务为准；自托管大规模优先考虑单机+读副本+Citus 评估
```

适用判断：单实例写入 <30 万 metrics/s 且存储 <5TB 时，multinode 复杂度通常不划算——**先榨干单机（压缩+索引调优），再谈分布**。

## PostgreSQL 生态复用优势（JOIN 业务表）

```sql
-- 场景一：时序指标 JOIN 业务维表（同库零成本）
SELECT m.time, m.device_id, m.temperature,
       d.model, d.warranty_expire      -- 来自业务关系表 devices
FROM conditions m
JOIN devices d USING (device_id)
WHERE m.time >= NOW() - INTERVAL '1 day'
  AND d.warranty_expire > CURRENT_DATE;

-- 场景二：复用 PG 扩展生态
-- PostGIS：轨迹地理围栏告警
SELECT device_id FROM gps_points
WHERE ST_DWithin(geom, ST_MakePoint(120.1, 30.2)::geography, 500)
  AND time >= NOW() - INTERVAL '10 minutes';

-- pg_cron：定时清理临时表 + 触发质量校验
SELECT cron.schedule('nightly-dq', '0 2 * * *',
       $$CALL run_dq_checks()$$);

-- pg_stat_statements + EXPLAIN：完整性能诊断链路
SELECT query, calls, mean_exec_time
FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;
```

| 能力 | 专用 TSDB 通常缺失 | TimescaleDB 免费获得 |
|------|-------------------|---------------------|
| 强外键/事务跨表 | ❌ | ✅ 档案-指标一致性约束 |
| 任意扩展 | 私有插件体系 | PostGIS/pgvector/pg_cron/pgAudit 全家桶 |
| BI 直连 | 各家驱动适配 | 标准 PG 协议全工具兼容 |
| 备份恢复 | 私有工具 | pg_basebackup/PITR/WAL 归档成熟方案 |

结论：当业务「一半是时序一半是关系」（IoT 平台、SaaS 监控、金融行情+订单），TimescaleDB 用一个数据库消灭一条同步管道，复杂度收益往往大于极限吞吐差距。

---

## 11. 第三轮深度实战（基准 / 迁移 / 告警 / 流计算 / 成本 / 排障 SOP）

### 11.1 性能基准（推导 / 公开数字）

- 写入吞吐：受 PG 行存约束，单实例常见 ~10~30 万 metrics/s（批写 + 压缩后改善）。
- 压缩比：4~10:1（列式压缩 + segmentby）。
- 查询：SQL 灵活，聚合命中连续聚合表时延迟低；跨月大范围未命中聚合则中。

推导：
```text
写入 points/s ≈ 批写大小 / 单批耗时；建议 batch 1000~5000 行/批
压缩后单 chunk 数 MB~数百 MB 为宜
```

### 11.2 迁移实战：InfluxDB → TimescaleDB 双写切换 SOP

```mermaid
flowchart LR
    A[采集端] -->|1. 双写| B[InfluxDB]
    A -->|1. 双写| C[TimescaleDB 超表]
    D[历史回放\nInfluxQL→SQL 转换] --> C
    E[校验] --> C
    F[灰度切读\nGrafana 切 PG 源] --> C
    F -->|稳定| G[InfluxDB 下线]
```

1. **建表**：把 measurement 映射为超表，tag→列/维度，field→数值列；时间列建 hypertable。
2. **双写**：Telegraf 同时写 InfluxDB 与 PG（outputs.postgresql）；或应用双写。
3. **回放**：用 `influx_inspect export` 导出 line protocol，转 SQL 批量导入。
4. **校验**：抽样比对聚合值（SUM/AVG）。
5. **切读**：Grafana 加 PostgreSQL 数据源，看板切到超表 + 连续聚合。

### 11.3 与监控 / Grafana 全链路告警规则示例

Grafana 用 PostgreSQL 数据源，对连续聚合表告警：

```sql
-- 告警查询：某设备 5 分钟平均温度 > 阈值
SELECT device_id, AVG(temperature) AS v
FROM readings_hourly
WHERE bucket >= NOW() - INTERVAL '5 minutes'
GROUP BY device_id
HAVING AVG(temperature) > 80;
```

Grafana Unified Alerting 配置（示意）：
```yaml
apiVersion: 1
groups:
  - name: tsdb_temp_alert
    rules:
      - alert: HighTemp
        sql: "SELECT device_id, AVG(temperature) v FROM readings_hourly WHERE bucket >= NOW()-'5 minutes' GROUP BY device_id HAVING AVG(temperature) > 80"
        for: 5m
        labels: { severity: critical }
```

全链路 Checklist：
- [ ] 连续聚合刷新 `end_offset` 留 1h，避免看板缺口。
- [ ] 查询命中聚合表，带时间下界。
- [ ] 监控 `hypertable_size`、压缩比、刷新延迟。

### 11.4 与 Flink / Spark 实时计算联动代码

Spark 写 TimescaleDB（JDBC batch）：
```scala
df.write
  .mode("append")
  .format("jdbc")
  .option("url", "jdbc:postgresql://tsdb:5432/metrics")
  .option("dbtable", "sensor_readings")
  .option("batchsize", "5000")
  .save()
```

Flink SQL sink：
```sql
CREATE TABLE tsdb_sink (
  time TIMESTAMP(3), device_id STRING, temperature DOUBLE
) WITH (
  'connector'='jdbc',
  'url'='jdbc:postgresql://tsdb:5432/metrics',
  'table-name'='sensor_readings'
);
INSERT INTO tsdb_sink SELECT ts, device_id, temperature FROM src;
```

联动要点：Flink 窗口聚合后写超表，避免单行高频写；历史回补先 `decompress_chunk` 再改。

### 11.5 成本优化（chunk 压缩 / 降采样 / 保留）

```sql
-- 压缩 + 保留组合：先压缩再过期
SELECT add_compression_policy('sensor_readings', INTERVAL '7 days');
SELECT add_retention_policy('sensor_readings', INTERVAL '180 days');

-- 分层聚合降本：明细→1m→1h→1d，长期只查聚合
SELECT add_continuous_aggregate_policy('readings_1h',
  start_offset=>INTERVAL '3 days', end_offset=>INTERVAL '1 hour',
  schedule_interval=>INTERVAL '1 hour');
```

降本清单：
- [ ] 压缩策略让冷 chunk 自动列压，省 4~10× 空间。
- [ ] 保留策略删超期 chunk，避免磁盘无限涨。
- [ ] 用连续聚合替代实时重算，降查询算力。
- [ ] 旧 chunk `move_chunk` 到冷表空间（如 OSS 挂载盘）。

### 11.6 生产排障 SOP

## Hypertable chunk 自动分区策略调优

```
chunk interval 调优方法：

  目标：单 chunk 压缩前 25MB ~ 数 GB
  
  推导公式：
    chunk_interval ≈ 目标chunk大小 ÷ 写入速率
    
  示例：
    写入速率 = 10000 设备 × 1 点/10s × 200B/行 ≈ 20MB/min
    目标 2GB → 2GB ÷ 20MB/min ≈ 100min → 取 1~2 小时
    低频场景（分钟级上报）：写入 0.5MB/min → 取 7 天更合理

  调整命令：
    SELECT set_chunk_time_interval('sensor_readings', INTERVAL '1 day');
    
  运行期调整只影响新 chunk，已有 chunk 不变
```

| 症状 | 诊断 | 处置 |
|------|------|------|
| 查询计划列出上千 chunk | interval 过小 | 调大 + reorder |
| 单 chunk 压缩耗时 >10min | interval 过大 | 调小增量执行 |
| 写入延迟周期性抖动 | 新 chunk 创建风暴 | 预建 chunk + 错开空间分区 |

## 连续聚合（Continuous Aggregate）刷新策略与性能

```sql
-- 分层聚合：明细 -> 1m -> 1h -> 1d 逐级物化
-- 1m 从明细刷 → 1h 从 1m 刷 → 1d 从 1h 刷
-- 上层查询命中下层聚合，重算成本指数级下降

-- materialized_only=false：物化区+实时区自动拼接
-- 新数据未刷新时直接查明细实时计算，看板无缺口
ALTER MATERIALIZED VIEW cond_5m SET (
    timescaledb.materialized_only = false
);
```

| 模式 | 行为 | 适用 |
|------|------|------|
| materialized_only=true | 只返回已物化数据 | 历史报表 |
| materialized_only=false | 物化区+实时明细 UNION | **监控看板推荐** |

## 压缩策略（segmentby/orderby）调优实例

```sql
ALTER TABLE conditions SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id',  -- 高基数分组列
    timescaledb.compress_orderby = 'time DESC'     -- 组内时间排序
);
```

```text
参数选择原理：
  segmentby 决定「分组边界」——同设备数据连续存放
  orderby 决定「组内排列」——时序按时间排 delta-of-delta 最优

实测参考（单表 5000 万行）：
  无压缩                    ：12.8 GB
  segmentby=device_id only  ：2.9 GB（4.4:1）
  + orderby=time DESC       ：1.1 GB（11.6:1）
  orderby 缺失（随机顺序）  ：4.7 GB（仅 2.7:1）
```

## 多节点分布式 hypertable 部署

```sql
-- 架构：Access Node(协调) + N 个 Data Node
SELECT add_data_node('dn1', host => '10.0.1.11');
SELECT add_data_node('dn2', host => '10.0.1.12');

-- 分布式超表：时间+空间两维路由到 data node
SELECT create_distributed_hypertable('conditions', 'time', 'device_id',
       chunk_time_interval => INTERVAL '1 day',
       replication_factor  => 2);
```

```text
运维要点：
  ① AN 是唯一 SQL 入口：做好高可用
  ② replication_factor ≥2 才能扛单 DN 故障
  ③ 带 device_id 过滤可只命中相关 DN
  ④ 社区版 multinode 支持在收缩，生产以云版为准
```

## TimescaleDB 与 Grafana 集成最佳实践

```
集成方式：
  Grafana → PostgreSQL 数据源 → TimescaleDB
  
  直连超表查询，自动命中连续聚合
  
  推荐配置：
    数据源：PostgreSQL（非 MySQL）
    连接池：PgBouncer（高并发）
    查询优化：带时间下界，命中连续聚合

  Grafana Dashboard 设计：
    实时面板：查询连续聚合表（materialized_only=false）
    历史面板：查询压缩后 chunk
    告警：对连续聚合表设阈值告警
```

## TimescaleDB 在 IoT 数据平台中的应用案例

```
IoT 场景：

  数据特征：
    千万设备 × 秒级上报
    设备元数据在关系表
    时序指标在超表

  架构：
    设备档案：PostgreSQL 关系表
    时序指标：TimescaleDB 超表
    二者直接 JOIN（同库零成本）

  优势：
    时序+关系混合查询
    设备元数据与指标关联分析
    事务保证（设备注册+指标写入原子性）
    PG 生态（PostGIS 地理时序、pgvector 向量）
    
  降本：
    连续聚合：明细→1m→1h→1d，长期只查聚合
    压缩：冷 chunk 自动列压
    保留策略：超期 chunk 自动删除
```

**Cardinality / 写入慢**
- [ ] 活跃 chunk 膨胀用 `VACUUM`/`pg_repack`；索引不宜过多。
- [ ] `segmentby`/`orderby` 设对（高基数列 segmentby，time orderby）。
- [ ] 压缩 chunk 视为不可变；UPDATE 历史触发解压重压，写放大。

**写入拒绝（锁/磁盘满）SOP**
- [ ] 查 `pg_stat_activity` 长事务、锁等待；查磁盘 `pg_tablespace`。
- [ ] 提高 `max_wal_size`、`checkpoint_timeout` 缓解写放大。

**查询超时 SOP**
- [ ] 是否命中连续聚合；是否带时间下界。
- [ ] `EXPLAIN` 看是否全 chunk 扫；缩小时间窗。

---

## 二十九、Hypertable Chunk 自动分区策略调优

### 29.1 Chunk 分区策略

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| `chunk_time_interval` | 每个 chunk 的时间跨度 | 1天（高写入）/ 1周（低写入） |
| `chunk_target_size` | 目标 chunk 大小 | 1GB |
| `chunk_sizing_func` | chunk 大小计算函数 | 默认 |

### 29.2 分区策略选择

| 数据特征 | chunk_time_interval | 理由 |
|----------|-------------------|------|
| 高写入（>1GB/天） | 1 天 | 便于压缩和清理 |
| 低写入（<100MB/天） | 1 周 | 减少 chunk 数量 |
| 时序查询为主 | 按查询模式 | 时间范围对齐 |
| 混合查询 | 1 天 | 平衡写入和查询 |

```sql
-- 设置 chunk 时间间隔
SELECT create_hypertable('sensor_data', 'time',
    chunk_time_interval => INTERVAL '1 day');

-- 查看 chunk 信息
SELECT * FROM timescaledb_information.chunks
WHERE hypertable_name = 'sensor_data';

-- 调整已存在 hypertable 的 chunk 间隔
ALTER TABLE sensor_data SET (
    timescaledb.chunk_time_interval = '7 days'
);
```

## 三十、连续聚合刷新策略与性能

### 30.1 连续聚合 vs 物化视图

| 维度 | 连续聚合 | 物化视图 |
|------|---------|---------|
| 刷新方式 | 增量自动刷新 | 全量手动刷新 |
| 性能 | 高（增量计算） | 低（全量重算） |
| 实时性 | 支持 real-time aggregation | 不支持 |
| 存储 | 增量更新 | 全量存储 |

### 30.2 刷新策略配置

```sql
-- 创建连续聚合
CREATE MATERIALIZED VIEW sensor_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    sensor_id,
    AVG(value) AS avg_value,
    MAX(value) AS max_value,
    COUNT(*) AS sample_count
FROM sensor_data
GROUP BY bucket, sensor_id;

-- 添加刷新策略
SELECT add_continuous_aggregate_policy('sensor_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');

-- real-time aggregation（实时查询未刷新数据）
ALTER MATERIALIZED VIEW sensor_hourly SET (timescaledb.materialized_only = false);
```

## 三十一、压缩策略调优（segmentby / orderby 最佳组合）

### 31.1 压缩配置参数

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| `segmentby` | 分段列（高基数） | sensor_id/device_id |
| `orderby` | 排序列（时间相关） | time DESC |
| `compress_after` | 自动压缩时间 | 7 天 |

### 31.2 压缩效果对比

| 配置 | 压缩比 | 查询性能 | 适用场景 |
|------|--------|---------|---------|
| segmentby=sensor_id, orderby=time | 10:1 | 高（按 sensor 查询） | IoT 监控 |
| segmentby=device_type, orderby=time | 8:1 | 中（按类型查询） | 设备管理 |
| segmentby=time, orderby=sensor_id | 6:1 | 低（按时间查询） | 时间序列分析 |

```sql
-- 启用压缩
ALTER TABLE sensor_data SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'sensor_id',
    timescaledb.compress_orderby = 'time DESC'
);

-- 添加自动压缩策略
SELECT add_compression_policy('sensor_data', INTERVAL '7 days');

-- 手动压缩
SELECT compress_chunk('_timescaledb_internal._compressed_hypertable_1');
```

## 三十二、多节点分布式 Hypertable 部署架构

### 32.1 分布式架构

```text
TimescaleDB 多节点架构：
  数据节点（Data Node）：
    - 存储实际数据
    - 执行本地查询
    - 支持水平扩展
  
  访问节点（Access Node）：
    - 接收客户端查询
    - 分发查询到数据节点
    - 合并结果返回

分布式 Hypertable：
  数据自动分布到多个数据节点
  基于分片键（distributed hypertable）
  支持分布式聚合和连接
```

### 32.2 分布式部署配置

```sql
-- 创建分布式 Hypertable
SELECT create_distributed_hypertable('sensor_data', 'time',
    chunk_time_interval => INTERVAL '1 day',
    partitioning_column => 'sensor_id',
    number_partitions => 4);

-- 查看数据分布
SELECT * FROM timescaledb_information.chunks
WHERE hypertable_name = 'sensor_data'
ORDER BY node_name;

-- 添加数据节点
SELECT add_data_node('data-node-1', host => '10.0.0.1');
SELECT add_data_node('data-node-2', host => '10.0.0.2');
```

## 三十三、TimescaleDB 与 Grafana 集成最佳实践

### 33.1 Grafana 配置

```yaml
# grafana/provisioning/datasources/timescaledb.yml
apiVersion: 1
datasources:
  - name: TimescaleDB
    type: postgres
    url: timescaledb:5432
    database: tsdb
    user: grafana
    secureJsonData:
      password: ${TSDB_PASSWORD}
    jsonData:
      sslmode: disable
      postgresVersion: 120000
      timescaledb: true
```

### 33.2 Grafana 查询优化

| 优化策略 | 做法 | 效果 |
|----------|------|------|
| 时间范围对齐 | 查询带时间下界 | 避免全表扫描 |
| 连续聚合 | 预计算聚合 | 查询加速 10x |
| 分区裁剪 | chunk 过滤 | 减少扫描数据 |
| 降采样 | 低精度数据 | 减少传输量 |

## 三十四、TimescaleDB 在 IoT 数据平台中的应用案例

### 34.1 IoT 数据平台架构

```mermaid
flowchart LR
    subgraph 设备层
        D1[传感器] --> D2[网关]
    end
    subgraph 采集层
        D2 --> K[Kafka]
    end
    subgraph 存储层
        K --> T[TimescaleDB]
        K --> I[Iceberg]
    end
    subgraph 计算层
        T --> F[Flink]
        I --> F
    end
    subgraph 服务层
        T --> G[Grafana]
        F --> API[API]
    end
```

### 34.2 应用场景

| 场景 | 数据特征 | TimescaleDB 优势 |
|------|---------|-----------------|
| 设备监控 | 高写入、时间序列 | 压缩+连续聚合 |
| 告警规则 | 实时查询 | 低延迟查询 |
| 历史分析 | 大数据量 | 时间旅行+压缩 |
| 预测分析 | 特征工程 | 连续聚合+窗口函数 |

## 三十五、连续聚合物化视图自动刷新深度配置

### 35.1 Refresh Policy参数详解

```sql
-- 连续聚合刷新策略配置
SELECT add_continuous_aggregate_policy('readings_hourly',
    start_offset => INTERVAL '3 days',      -- 起始偏移：刷新3天前的数据
    end_offset => INTERVAL '1 hour',        -- 结束偏移：刷新到1小时前
    schedule_interval => INTERVAL '1 hour', -- 调度间隔：每小时执行
    if_not_exists => TRUE                   -- 幂等创建
);

-- 参数说明：
-- start_offset: 刷新窗口起始点（越大会扫描更多历史数据）
-- end_offset: 刷新窗口结束点（留余量避免最新数据未物化）
-- schedule_interval: 任务调度频率
-- if_not_exists: 防止重复创建策略

-- 查看刷新策略
SELECT * FROM timescaledb_information.jobs
WHERE proc_name = 'refresh_continuous_aggregate';

-- 手动触发刷新
CALL refresh_continuous_aggregate('readings_hourly',
    NOW() - INTERVAL '7 days',
    NOW() - INTERVAL '1 hour');

-- 刷新状态监控
SELECT * FROM timescaledb_information.jobs
WHERE proc_name = 'refresh_continuous_aggregate'
ORDER BY next_start;
```

### 35.2 刷新窗口设计模式

```text
刷新窗口设计模式：

  滑动窗口模式：
    start_offset = INTERVAL '7 days'
    end_offset = INTERVAL '1 hour'
    适用：监控看板（需要最新数据）

  固定窗口模式：
    start_offset = NOW() - start_of_day
    end_offset = NOW() - start_of_day + INTERVAL '1 day'
    适用：日报表（按天聚合）

  分层刷新模式：
    Level 1: 1分钟聚合 → 每5分钟刷新
    Level 2: 1小时聚合 → 每小时从1分钟聚合刷新
    Level 3: 1天聚合 → 每天从1小时聚合刷新
    适用：多级降采样

  迟到数据处理：
    start_offset = INTERVAL '3 days'（覆盖可能的迟到数据窗口）
    end_offset = INTERVAL '1 hour'（避免最新数据未物化）
```

### 35.3 刷新性能优化

```sql
-- 优化刷新性能的配置
ALTER MATERIALIZED VIEW readings_hourly SET (
    timescaledb.materialized_only = false,  -- 实时+物化双模式
    timescaledb.refresh_lag = INTERVAL '1 hour'  -- 刷新延迟
);

-- 并发刷新控制
SELECT alter_job(
    (SELECT job_id FROM timescaledb_information.jobs
     WHERE proc_name = 'refresh_continuous_aggregate'
     AND proc_schema = '_timescaledb_internal'),
    max_runs => 1  -- 同时只运行1个刷新任务
);

-- 刷新资源限制
SET timescaledb.max_background_workers = 4;  -- 限制后台工作进程数

-- 监控刷新性能
SELECT
    job_id,
    start_time,
    finish_time,
    duration,
    rows_processed
FROM timescaledb_information.job_run_details
WHERE proc_name = 'refresh_continuous_aggregate'
ORDER BY start_time DESC;
```

## 三十六、压缩策略高级配置详解

### 36.1 segmentby与orderby深度优化

```sql
-- 高级压缩配置
ALTER TABLE sensor_readings SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id,location_id',  -- 多列分段
    timescaledb.compress_orderby = 'time DESC,device_id ASC',  -- 多列排序
    timescaledb.compress_chunk_time_interval = INTERVAL '7 days'  -- 压缩chunk时间间隔
);

-- 压缩阈值配置
SELECT add_compression_policy('sensor_readings',
    INTERVAL '7 days',  -- 压缩时间阈值
    if_not_exists => TRUE
);

-- 高级压缩参数
ALTER TABLE sensor_readings SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id',
    timescaledb.compress_orderby = 'time DESC',
    timescaledb.compress_orderby_metadata_target = 200MB,  -- 元数据目标大小
    timescaledb.compress_segmentby_region_size = 1024,     -- 分段区域大小
    timescaledb.compress_max_rows_per_compression = 1000000  -- 每次压缩最大行数
);
```

### 36.2 压缩效果监控与调优

```sql
-- 压缩效果监控
SELECT
    hypertable_name,
    pg_size_pretty(before_compression_total_bytes) AS before_size,
    pg_size_pretty(after_compression_total_bytes) AS after_size,
    compression_ratio,
    uncompressed_row_count,
    compressed_row_count
FROM timescaledb_information.compressed_hypertable_stats
WHERE hypertable_name = 'sensor_readings';

-- segmentby选择建议
-- 高基数列（device_id）：适合segmentby（分组边界）
-- 低基数列（region）：不适合segmentby（组过大）
-- 时间列：适合orderby（时序局部性）

-- orderby选择建议
-- 时间列：必须（delta-of-delta编码最优）
-- 查询模式：按查询频率排序（高频查询列优先）

-- 压缩效果验证
SELECT
    _timescaledb_internal.get_compression_stats('sensor_readings');

-- 分析压缩统计
SELECT
    chunk_name,
    pg_size_pretty(before_compression_total_bytes) AS before,
    pg_size_pretty(after_compression_total_bytes) AS after,
    compression_ratio
FROM timescaledb_information.chunk_compression_stats
WHERE hypertable_name = 'sensor_readings'
ORDER BY compression_ratio;
```

### 36.3 压缩与查询性能平衡

```text
压缩与查询性能平衡策略：

  写入密集型：
    segmentby：高基数列（device_id）
    orderby：time DESC
    压缩阈值：7天
    查询性能：按device_id查询快

  查询密集型：
    segmentby：查询过滤列
    orderby：time DESC, 查询排序列
    压缩阈值：14天
    查询性能：按查询模式优化

  混合场景：
    segmentby：device_id（平衡写入和查询）
    orderby：time DESC（时序查询）
    压缩阈值：7天
    查询性能：通用优化

  监控指标：
    压缩比：> 5:1为佳
    查询延迟：< 100ms为佳
    写入吞吐：> 10k points/s为佳
```

## 三十七、多节点TimescaleDB部署架构

### 37.1 Access Node与Data Node架构

```text
TimescaleDB 多节点架构：

  Access Node（访问节点）：
    接收客户端SQL查询
    分布式查询计划生成
    结果合并与返回
    元数据管理
    高可用：Patroni/云托管PG

  Data Node（数据节点）：
    存储实际数据chunk
    执行本地查询
    支持水平扩展
    数据复制与同步
    资源：CPU/内存/存储

  分布式Hypertable：
    数据自动分布到多个Data Node
    基于分片键路由
    支持分布式聚合和连接
    透明化查询下推
```

### 37.2 分布式部署配置

```sql
-- 添加数据节点
SELECT add_data_node('dn1', host => '10.0.1.11',
    port => 5432, database => 'tsdb',
    password => 'secure_password');
SELECT add_data_node('dn2', host => '10.0.1.12');
SELECT add_data_node('dn3', host => '10.0.1.13');

-- 创建分布式超表
SELECT create_distributed_hypertable('sensor_data', 'time',
    chunk_time_interval => INTERVAL '1 day',
    partitioning_column => 'device_id',
    number_partitions => 4,
    replication_factor => 2);  -- 副本因子

-- 查看数据分布
SELECT
    node_name,
    chunk_name,
    pg_size_pretty(chunk_size) AS size
FROM timescaledb_information.chunks
WHERE hypertable_name = 'sensor_data'
ORDER BY node_name, chunk_name;

-- 分布式连续聚合
CREATE MATERIALIZED VIEW sensor_hourly_distributed
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    device_id,
    AVG(temperature) AS avg_temp
FROM sensor_data
GROUP BY bucket, device_id;

-- 分布式压缩策略
SELECT add_compression_policy('sensor_data', INTERVAL '7 days');
```

### 37.3 多节点运维管理

```sql
-- 数据节点状态监控
SELECT * FROM timescaledb_information.data_nodes;

-- 节点健康检查
SELECT
    node_name,
    node_type,
    available,
    pg_size_pretty(used_disk_space) AS used_space,
    pg_size_pretty(total_disk_space) AS total_space
FROM timescaledb_information.data_nodes;

-- 节点故障处理
-- 1. 移除故障节点
SELECT delete_data_node('dn2');

-- 2. 添加新节点
SELECT add_data_node('dn2_new', host => '10.0.1.14');

-- 3. 数据重平衡
SELECT rebalance_chunk('sensor_data');

-- 备份策略
-- Access Node：pg_basebackup + WAL归档
-- Data Node：每个节点独立备份
-- 分布式恢复：rebalance_chunk + 数据修复

-- 性能监控
SELECT
    node_name,
    query_count,
    avg_execution_time,
    total_execution_time
FROM timescaledb_information.query_stats
WHERE hypertable_name = 'sensor_data'
ORDER BY total_execution_time DESC;
```

## 三十八、TimescaleDB与PostgreSQL生态兼容

### 38.1 JDBC/ORM连接配置

```java
// JDBC连接配置
String url = "jdbc:postgresql://timescaledb:5432/tsdb";
Properties props = new Properties();
props.setProperty("user", "app_user");
props.setProperty("password", "secure_password");
props.setProperty("ssl", "true");
props.setProperty("sslmode", "require");
props.setProperty("prepareThreshold", "5");  // 预编译阈值
props.setProperty("preparedStatementCacheQueries", "256");
props.setProperty("preparedStatementCacheSizeMiB", "5");

// HikariCP连接池配置
HikariConfig config = new HikariConfig();
config.setJdbcUrl(url);
config.setUsername("app_user");
config.setPassword("secure_password");
config.setMaximumPoolSize(20);
config.setMinimumIdle(5);
config.setConnectionTimeout(30000);
config.setIdleTimeout(600000);
config.setMaxLifetime(1800000);
config.addDataSourceProperty("cachePrepStmts", "true");
config.addDataSourceProperty("prepStmtCacheSize", "250");
config.addDataSourceProperty("prepStmtCacheSqlLimit", "2048");
```

### 38.2 ORM框架集成

```sql
-- Hibernate/JPA实体映射
@Entity
@Table(name = "sensor_readings")
public class SensorReading {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "time", nullable = false)
    private Instant time;

    @Column(name = "device_id", nullable = false)
    private String deviceId;

    @Column(name = "temperature")
    private Double temperature;

    @Column(name = "humidity")
    private Double humidity;
}

-- SQLAlchemy (Python)映射
from sqlalchemy import create_engine, Column, DateTime, String, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

Base = declarative_base()

class SensorReading(Base):
    __tablename__ = 'sensor_readings'

    id = Column(Integer, primary_key=True)
    time = Column(DateTime(timezone=True), nullable=False)
    device_id = Column(String, nullable=False)
    temperature = Column(Float)
    humidity = Column(Float)

engine = create_engine('postgresql://user:pass@timescaledb:5432/tsdb')
Session = sessionmaker(bind=engine)
```

### 38.3 连接池与性能优化

```yaml
# PgBouncer连接池配置
# pgbouncer.ini
[databases]
tsdb = host=timescaledb port=5432 dbname=tsdb

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction  # 事务级连接池
default_pool_size = 20
min_pool_size = 5
reserve_pool_size = 5
reserve_pool_timeout = 3
max_client_conn = 1000
max_db_connections = 100

# 连接池监控
SHOW POOLS;
SHOW CLIENTS;
SHOW SERVERS;
```

```text
连接池优化策略：

  事务级连接池（推荐）：
    pool_mode = transaction
    优势：连接复用率高，延迟低
    适用：OLTP应用

  会话级连接池：
    pool_mode = session
    优势：兼容性好
    适用：长事务应用

  语句级连接池：
    pool_mode = statement
    优势：最大化连接复用
    适用：无事务应用

  性能指标：
    连接等待时间：< 10ms为佳
    连接复用率：> 90%为佳
    活跃连接数：< 80%最大连接数为佳
```

## 三十九、TimescaleDB在IoT数据平台中的应用案例

### 39.1 设备数据采集架构

```mermaid
flowchart TB
    subgraph 设备层
        D1[传感器] -->|MQTT| G[网关]
        D2[PLC] -->|Modbus| G
        D3[摄像头] -->|RTSP| G
    end

    subgraph 采集层
        G -->|MQTT| K[Kafka]
        K -->|Flink| F[Flink Processing]
    end

    subgraph 存储层
        F -->|JDBC| T[TimescaleDB]
        F -->|Parquet| I[Iceberg]
        F -->|Elasticsearch| ES[日志索引]
    end

    subgraph 计算层
        T -->|连续聚合| CA[物化视图]
        T -->|流计算| SC[实时告警]
        I -->|批处理| BP[历史分析]
    end

    subgraph 服务层
        CA -->|Grafana| V[可视化]
        SC -->|Webhook| A[告警通知]
        BP -->|Trino| Q[联邦查询]
        T -->|REST API| M[设备管理]
    end
```

### 39.2 设备数据建模实例

```sql
-- 设备档案表（关系表）
CREATE TABLE devices (
    device_id TEXT PRIMARY KEY,
    device_type TEXT NOT NULL,
    manufacturer TEXT,
    model TEXT,
    install_date DATE,
    location GEOGRAPHY(POINT, 4326),  -- PostGIS地理类型
    metadata JSONB,  -- 设备元数据
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 时序数据超表
CREATE TABLE sensor_data (
    time TIMESTAMPTZ NOT NULL,
    device_id TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value DOUBLE PRECISION,
    quality_code INTEGER DEFAULT 0,
    tags JSONB
);

SELECT create_hypertable('sensor_data', 'time',
    chunk_time_interval => INTERVAL '1 day',
    partitioning_column => 'device_id',
    number_partitions => 8);

-- 创建索引
CREATE INDEX idx_sensor_device_time ON sensor_data (device_id, time DESC);
CREATE INDEX idx_sensor_metric ON sensor_data (metric_name, time DESC);

-- 连续聚合：每小时设备指标
CREATE MATERIALIZED VIEW device_hourly_stats
WITH (timescaledb.continuous) AS
SELECT
    device_id,
    metric_name,
    time_bucket('1 hour', time) AS bucket,
    AVG(metric_value) AS avg_value,
    MAX(metric_value) AS max_value,
    MIN(metric_value) AS min_value,
    COUNT(*) AS sample_count
FROM sensor_data
GROUP BY device_id, metric_name, time_bucket('1 hour', time);

-- 添加刷新策略
SELECT add_continuous_aggregate_policy('device_hourly_stats',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');

-- 压缩策略
ALTER TABLE sensor_data SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('sensor_data', INTERVAL '7 days');
```

### 39.3 IoT数据分析场景

```sql
-- 场景1：设备状态实时监控
SELECT
    d.device_id,
    d.device_type,
    d.location,
    s.avg_value as current_temperature,
    s.sample_count
FROM device_hourly_stats s
JOIN devices d ON s.device_id = d.device_id
WHERE s.bucket >= NOW() - INTERVAL '1 hour'
  AND s.metric_name = 'temperature'
  AND s.avg_value > 80;  -- 温度告警阈值

-- 场景2：设备健康度分析
WITH device_metrics AS (
    SELECT
        device_id,
        metric_name,
        AVG(metric_value) as avg_24h,
        MAX(metric_value) as max_24h,
        COUNT(*) as sample_count
    FROM sensor_data
    WHERE time >= NOW() - INTERVAL '24 hours'
    GROUP BY device_id, metric_name
)
SELECT
    d.device_id,
    d.device_type,
    d.model,
    m.metric_name,
    m.avg_24h,
    m.max_24h,
    CASE
        WHEN m.avg_24h > 90 THEN 'CRITICAL'
        WHEN m.avg_24h > 80 THEN 'WARNING'
        ELSE 'NORMAL'
    END as health_status
FROM devices d
JOIN device_metrics m ON d.device_id = m.device_id
WHERE m.metric_name IN ('temperature', 'vibration')
ORDER BY d.device_id, m.metric_name;

-- 场景3：地理围栏告警
SELECT
    d.device_id,
    d.location,
    ST_AsText(d.location) as location_text,
    s.time,
    s.metric_value
FROM sensor_data s
JOIN devices d ON s.device_id = d.device_id
WHERE s.time >= NOW() - INTERVAL '10 minutes'
  AND ST_DWithin(
      d.location,
      ST_MakePoint(120.1, 30.2)::geography,
      1000  -- 1公里范围
  )
  AND s.metric_name = 'temperature';
```

### 39.4 可视化与告警配置

```yaml
# Grafana Dashboard配置示例
apiVersion: 1
dashboards:
  - name: IoT设备监控
    panels:
      - title: 设备温度趋势
        type: time_series
        targets:
          - rawSql: |
              SELECT
                time_bucket('5 minutes', time) as time,
                device_id,
                AVG(metric_value) as value
              FROM sensor_data
              WHERE metric_name = 'temperature'
                AND time >= NOW() - INTERVAL '24 hours'
              GROUP BY time_bucket('5 minutes', time), device_id
            legendFormat: "{{device_id}}"

      - title: 设备健康状态
        type: stat
        targets:
          - rawSql: |
              SELECT
                device_id,
                CASE
                  WHEN AVG(metric_value) > 90 THEN 2
                  WHEN AVG(metric_value) > 80 THEN 1
                  ELSE 0
                END as status
              FROM sensor_data
              WHERE metric_name = 'temperature'
                AND time >= NOW() - INTERVAL '1 hour'
              GROUP BY device_id

# 告警规则配置
alerting:
  rules:
    - alert: HighTemperature
      expr: AVG(metric_value) > 80
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "设备 {{ $labels.device_id }} 温度过高"
        description: "设备 {{ $labels.device_id }} 当前温度 {{ $value }}°C"
```

---

## 十九、TimescaleDB连续聚合详解

### 19.1 连续聚合（Continuous Aggregate）

```sql
-- 创建连续聚合
CREATE MATERIALIZED VIEW device_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    device_id,
    AVG(temperature) AS avg_temp,
    MAX(temperature) AS max_temp,
    MIN(temperature) AS min_temp,
    COUNT(*) AS sample_count
FROM device_data
GROUP BY bucket, device_id;

-- 自动刷新策略
SELECT add_continuous_aggregate_policy('device_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);
```

### 19.2 连续聚合 vs 普通视图

| 特性 | 连续聚合 | 普通视图 | 手动聚合表 |
|------|----------|----------|------------|
| 数据存储 | 物化 | 不存储 | 存储 |
| 自动更新 | 支持 | 不支持 | 不支持 |
| 查询性能 | 高 | 低 | 高 |
| 存储成本 | 中 | 无 | 高 |
| 数据新鲜度 | 分钟级 | 实时 | 手动 |

---

## 二十、TimescaleDB压缩策略详解

### 20.1 压缩策略配置

```sql
-- 启用压缩
ALTER TABLE device_data SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id',
    timescaledb.compress_orderby = 'time DESC'
);

-- 设置自动压缩策略
SELECT add_compression_policy('device_data', INTERVAL '7 days');

-- 手动压缩
SELECT compress_chunk(c FROM device_data WHERE time < now() - INTERVAL '7 days');
```

### 20.2 压缩效果对比

| 数据量 | 压缩前 | 压缩后 | 压缩率 |
|--------|--------|--------|--------|
| 1亿行 | 10GB | 1GB | 90% |
| 10亿行 | 100GB | 8GB | 92% |
| 100亿行 | 1TB | 70GB | 93% |

---

## 二十一、TimescaleDB多节点部署

### 21.1 多节点架构

```text
TimescaleDB多节点架构：
  ├── 数据节点（Data Node）
  │     ├── 存储分片数据
  │     ├── 处理本地查询
  │     └── 执行分布式查询
  ├── 访问节点（Access Node）
  │     ├── 接收客户端连接
  │     ├── 路由查询到数据节点
  │     └── 聚合结果返回
  └── 分布式 hypertable
        ├── 自动分片
        ├── 透明路由
        └── 跨节点查询
```

### 21.2 多节点部署步骤

```sql
-- 1. 添加数据节点
SELECT add_data_node('data_node_1', host => '192.168.1.101');
SELECT add_data_node('data_node_2', host => '192.168.1.102');

-- 2. 创建分布式hypertable
CREATE TABLE device_data (
    time TIMESTAMPTZ NOT NULL,
    device_id INT NOT NULL,
    temperature DOUBLE PRECISION
);
SELECT create_distributed_hypertable('device_data', 'time');

-- 3. 设置复制因子
ALTER TABLE device_data SET (
    timescaledb.replication_factor = 2
);
```

---

## 二十二、TimescaleDB性能调优

### 22.1 查询优化

```sql
-- 1. 使用时间分桶聚合
SELECT time_bucket('1 hour', time) AS bucket,
       AVG(temperature) AS avg_temp
FROM device_data
WHERE time > now() - INTERVAL '24 hours'
GROUP BY bucket;

-- 2. 使用连续聚合预计算
CREATE MATERIALIZED VIEW device_hourly
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 hour', time) AS bucket,
       device_id,
       AVG(temperature) AS avg_temp
FROM device_data
GROUP BY bucket, device_id;

-- 3. 使用索引优化
CREATE INDEX idx_device_time ON device_data (device_id, time DESC);
```

### 22.2 性能指标监控

| 指标 | 说明 | 健康范围 |
|------|------|----------|
| 查询延迟 | 平均查询时间 | <100ms |
| 写入吞吐 | 每秒写入行数 | >10万 |
| 压缩率 | 压缩前后比 | >90% |
| 缓存命中率 | 缓存使用率 | >90% |

---

## 二十三、TimescaleDB vs PostgreSQL对比

| 维度 | TimescaleDB | PostgreSQL |
|------|-------------|------------|
| 数据模型 | hypertable | 表 |
| 时间分区 | 自动 | 手动 |
| 压缩 | 内置 | 需要扩展 |
| 连续聚合 | 内置 | 需要pg_cron |
| 性能 | 高 | 中 |
| 扩展性 | 高 | 中 |
| 兼容性 | 100% | 原生 |

---

## 二十四、TimescaleDB容量规划

### 24.1 容量计算

```text
存储量 = 数据点数 × 每点大小 × 保留天数
压缩后 = 存储量 × (1 - 压缩率)

示例：
  写入：10万点/秒
  每点：100字节
  保留：30天
  压缩率：90%
  
  原始存储 = 10万 × 100 × 86400 × 30 = 25.9TB
  压缩后 = 25.9TB × 0.1 = 2.59TB
```

### 24.2 硬件配置建议

| 数据量 | CPU | 内存 | 存储 |
|--------|-----|------|------|
| <1万点/秒 | 2核 | 4GB | 100GB |
| 1-10万点/秒 | 4核 | 8GB | 500GB |
| 10-100万点/秒 | 8核 | 16GB | 2TB |
| >100万点/秒 | 16+核 | 32+GB | 10+TB |

---

## TimescaleDB深度优化与高级特性

### 连续聚合详解

| 概念 | 说明 | 用途 |
|------|------|------|
| Continuous Aggregate | 连续聚合 | 物化视图自动刷新 |
| Refresh Policy | 刷新策略 | 控制刷新频率 |
| Compression Policy | 压缩策略 | 数据压缩 |
| Retention Policy | 保留策略 | 数据清理 |

### 压缩策略调优

```sql
-- 创建压缩策略
SELECT add_compression_policy('sensors', INTERVAL '7 days');

-- 压缩配置
ALTER TABLE sensors SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id',
    timescaledb.compress_orderby = 'time DESC'
);
```

| 压缩策略 | 说明 | 压缩比 |
|----------|------|--------|
| segmentby | 按字段分段 | 中 |
| orderby | 按字段排序 | 高 |
| 两者结合 | 分段+排序 | 最高 |

### 多节点部署架构

```mermaid
flowchart TB
    subgraph Access Node
        A1[access-1]
        A2[access-2]
    end
    subgraph Data Node
        B1[data-1]
        B2[data-2]
        B3[data-3]
    end
    Access Node --> Data Node
```

| 节点类型 | 说明 | 资源需求 |
|----------|------|----------|
| Access Node | 接入节点 | CPU高/内存中 |
| Data Node | 数据节点 | CPU中/内存高/磁盘高 |

### PostgreSQL生态兼容

| 特性 | 支持 | 说明 |
|------|------|------|
| SQL标准 | 完全支持 | 标准SQL |
| 扩展 | 完全支持 | pg_stat等 |
| 连接池 | 支持 | PgBouncer |
| 逻辑复制 | 支持 | PG逻辑复制 |
| 外部表 | 支持 | FDW |

### IoT数据平台应用

| 应用场景 | 说明 | 技术点 |
|----------|------|--------|
| 设备监控 | 实时设备状态 | 连续聚合 |
| 数据采集 | 时序数据写入 | 批量写入 |
| 告警规则 | 异常检测 | 压缩+查询 |
| 历史分析 | 历史数据分析 | 压缩+降采样 |

### TimescaleDB vs InfluxDB vs TDengine对比

| 维度 | TimescaleDB | InfluxDB | TDengine |
|------|-------------|----------|----------|
| 数据模型 | 关系型+时序 | 时间序列 | 超级表 |
| 查询语言 | SQL | Flux/InfluxQL | SQL |
| 生态 | PostgreSQL生态 | 独立生态 | 独立生态 |
| 扩展性 | 多节点 | 集群 | 集群 |
| 适用场景 | 复杂查询 | 通用 | IoT |

### 容量规划

| 指标 | 计算方式 | 示例 |
|------|----------|------|
| 存储需求 | 原始数据×压缩比×保留期 | 100GB×0.1×365天=3.65TB |
| 内存需求 | 热数据量×10% | 1TB×10%=100GB |
| CPU需求 | 写入QPS×0.01+查询QPS×0.1 | 10万×0.01+1万×0.1=20核 |
| 磁盘IOPS | 写入IOPS+查询IOPS | 10万+1万=11万 |

### 性能调优

| 调优项 | 说明 | 配置 |
|--------|------|------|
| chunk大小 | 合理设置chunk间隔 | 7天 |
| 并行查询 | 启用并行查询 | max_parallel_workers |
| 连接池 | 使用连接池 | PgBouncer |
| 索引优化 | 创建合适索引 | BRIN索引 |

### 监控告警配置

```yaml
# TimescaleDB监控告警
groups:
- name: timescaledb-alerts
  rules:
  - alert: TimescaleDBHighWriteLatency
    expr: timescaledb_write_latency_seconds > 0.1
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "TimescaleDB写入延迟过高"
  - alert: TimescaleDBHighCompressionRatio
    expr: timescaledb_compression_ratio > 0.9
    for: 5m
    labels:
      severity: info
    annotations:
      summary: "TimescaleDB压缩率过高"
```

### 常见问题排查

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 写入延迟 | chunk过大/索引缺失 | 调整chunk大小/创建索引 |
| 查询缓慢 | 数据量大/无压缩 | 启用压缩/降采样 |
| 压缩失败 | 内存不足 | 增加内存 |
| 复制延迟 | 网络问题 | 检查网络 |
| 磁盘空间不足 | 数据增长 | 压缩/保留策略 |

### 最佳实践清单

| 实践 | 说明 | 优先级 |
|------|------|--------|
| 数据模型 | 合理设计hypertable | 高 |
| 压缩策略 | 启用压缩 | 高 |
| 连续聚合 | 配置连续聚合 | 高 |
| 保留策略 | 设置数据保留 | 高 |
| 监控告警 | TimescaleDB监控 | 高 |
| 备份策略 | 定期备份 | 高 |

---

## 二十五、TimescaleDB 数据建模

### 25.1 Hypertable设计原则

```sql
-- 创建hypertable
CREATE TABLE sensor_data (
    time TIMESTAMPTZ NOT NULL,
    device_id INTEGER,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    battery INTEGER
);

SELECT create_hypertable('sensor_data', 'time');

-- 添加分区
SELECT add_dimension('sensor_data', 'device_id', 4);
```

### 25.2 数据模型设计

```mermaid
graph TB
    subgraph "Hypertable设计"
        A[时间列] --> B[设备ID列]
        B --> C[数据列]
        C --> D[元数据列]
    end
    
    subgraph "分区策略"
        E[时间分区] --> A
        F[设备分区] --> B
        G[空间分区] --> C
    end
```

### 25.3 建模最佳实践

| 设计原则 | 说明 | 优势 | 劣势 | 适用场景 |
|---------|------|------|------|---------|
| **时间优先** | 按时间分区 | 时间查询快 | 设备查询慢 | 时序分析 |
| **设备优先** | 按设备分区 | 设备查询快 | 时间查询慢 | 设备监控 |
| **混合分区** | 时间+设备 | 平衡 | 复杂 | 生产环境 |

---

## 二十六、TimescaleDB 查询优化

### 26.1 查询性能对比

| 查询类型 | TimescaleDB | PostgreSQL | InfluxDB | 说明 |
|---------|-------------|------------|----------|------|
| **单点查询** | 0.1ms | 0.5ms | 0.5ms | 按时间点查询 |
| **范围查询** | 1ms | 5ms | 5ms | 按时间范围查询 |
| **聚合查询** | 2ms | 10ms | 10ms | 聚合统计 |
| **降采样查询** | 1ms | 20ms | 3ms | 数据降采样 |
| **设备查询** | 5ms | 10ms | 5ms | 按设备查询 |

### 26.2 查询优化技巧

```sql
-- 1. 使用时间过滤
SELECT * FROM sensor_data 
WHERE time > NOW() - INTERVAL '1 day';

-- 2. 使用设备过滤
SELECT * FROM sensor_data 
WHERE device_id = 1 AND time > NOW() - INTERVAL '1 day';

-- 3. 使用聚合函数
SELECT device_id, AVG(temperature), MAX(temperature), MIN(temperature)
FROM sensor_data
WHERE time > NOW() - INTERVAL '1 day'
GROUP BY device_id;

-- 4. 使用降采样
SELECT time_bucket('1 hour', time) AS bucket,
       device_id,
       AVG(temperature) AS avg_temp
FROM sensor_data
WHERE time > NOW() - INTERVAL '1 day'
GROUP BY bucket, device_id
ORDER BY bucket;
```

### 26.3 索引策略

```sql
-- 创建索引
CREATE INDEX idx_device_id ON sensor_data (device_id);
CREATE INDEX idx_time ON sensor_data (time);

-- 创建复合索引
CREATE INDEX idx_device_time ON sensor_data (device_id, time);

-- 创建覆盖索引
CREATE INDEX idx_covering ON sensor_data (device_id, time) 
INCLUDE (temperature, humidity);
```

---

## 二十七、TimescaleDB 数据导入

### 27.1 数据导入方式

| 方式 | 速度 | 灵活性 | 适用场景 |
|------|------|--------|---------|
| **SQL INSERT** | 慢 | 高 | 少量数据 |
| **批量导入** | 中 | 中 | 中等数据量 |
| **COPY命令** | 快 | 低 | 大量数据 |
| **流式导入** | 快 | 高 | 实时数据 |

### 27.2 批量导入示例

```sql
-- 批量插入数据
INSERT INTO sensor_data VALUES 
    (NOW(), 1, 25.5, 60, 85),
    (NOW() + INTERVAL '1 second', 1, 25.6, 61, 84),
    (NOW() + INTERVAL '2 seconds', 1, 25.7, 62, 83);

-- 使用COPY命令导入
COPY sensor_data FROM '/data/sensors.csv' WITH CSV HEADER;
```

### 27.3 流式数据导入

```sql
-- 创建流式计算
CREATE VIEW sensor_avg_view AS
SELECT time_bucket('1 hour', time) AS bucket,
       device_id,
       AVG(temperature) AS avg_temp
FROM sensor_data
GROUP BY bucket, device_id;

-- 写入流式数据
INSERT INTO sensor_data (time, device_id, temperature, humidity, battery)
VALUES (NOW(), 1, 25.5, 60, 85);
```

---

## 二十八、TimescaleDB 数据导出

### 28.1 导出方式

```sql
-- 导出为CSV文件
COPY sensor_data TO '/data/sensors.csv' WITH CSV HEADER;

-- 导出为JSON格式
SELECT row_to_json(sensor_data) 
FROM sensor_data 
WHERE time > NOW() - INTERVAL '1 day' 
INTO OUTFILE '/data/sensors.json';

-- 导出为Parquet格式
-- 使用pg_parquet扩展
COPY sensor_data TO '/data/sensors.parquet' WITH PARQUET;
```

### 28.2 导出策略

| 策略 | 说明 | 优势 | 劣势 | 适用场景 |
|------|------|------|------|---------|
| **全量导出** | 导出所有数据 | 简单 | 数据量大 | 备份 |
| **增量导出** | 只导出新增数据 | 高效 | 复杂 | 同步 |
| **定时导出** | 定时自动导出 | 自动化 | 资源消耗 | 定期备份 |

---

## 二十九、TimescaleDB 高可用

### 29.1 集群架构

```mermaid
graph TB
    subgraph "TimescaleDB集群"
        A[主节点] --> B[从节点1]
        A --> C[从节点2]
        B --> C
    end
    
    subgraph "数据分布"
        D[分片1] --> A
        E[分片2] --> B
        F[分片3] --> C
    end
    
    subgraph "客户端"
        G[应用1] --> A
        H[应用2] --> B
        I[应用3] --> C
    end
```

### 29.2 数据副本

```sql
-- 创建带副本的表
CREATE TABLE sensor_data (
    time TIMESTAMPTZ NOT NULL,
    device_id INTEGER,
    temperature DOUBLE PRECISION,
    PRIMARY KEY (time, device_id)
) WITH (
    REPLICATION = 3,
    TIMESCALEDB_REPLICATION_FACTOR = 3
);
```

### 29.3 故障转移

```text
故障检测：
  - 心跳检测
  - 超时检测
  - 异常检测

故障转移：
  - 自动故障转移
  - 手动故障转移
  - 数据恢复

故障恢复：
  - 节点恢复
  - 数据同步
  - 集群均衡
```

---

## 三十、TimescaleDB 安全管理

### 30.1 用户权限管理

```sql
-- 创建用户
CREATE USER reader WITH PASSWORD 'password123';

-- 授权
GRANT SELECT ON ALL TABLES IN SCHEMA public TO reader;
GRANT INSERT ON sensor_data TO writer;

-- 撤销权限
REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM reader;

-- 查看权限
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name = 'sensor_data';
```

### 30.2 数据加密

```sql
-- 创建加密表
CREATE TABLE sensor_data (
    time TIMESTAMPTZ NOT NULL,
    device_id INTEGER,
    temperature DOUBLE PRECISION,
    PRIMARY KEY (time, device_id)
) WITH (
    ENCRYPTION = 'AES256',
    ENCRYPTION_KEY = 'my_secret_key'
);

-- 数据传输加密
-- 使用SSL/TLS连接
psql -h server -p 5432 -U user -d db --sslmode=require
```

---

## 三十一、TimescaleDB 监控运维

### 31.1 监控指标

| 指标类别 | 指标名称 | 说明 | 告警阈值 |
|---------|----------|------|---------|
| **连接数** | client_connections | 客户端连接数 | >1000 |
| **查询数** | query_count | 查询数量 | >10000 |
| **写入数** | insert_count | 写入数量 | >100000 |
| **存储** | data_nodes | 数据节点数 | <3 |
| **内存** | memory_usage | 内存使用率 | >80% |

### 31.2 性能监控

```sql
-- 查看hypertable信息
SELECT * FROM timescaledb_information.hypertables;

-- 查看chunk信息
SELECT * FROM timescaledb_information.chunks;

-- 查看压缩状态
SELECT * FROM timescaledb_information.compression_stats;

-- 查看连续聚合
SELECT * FROM timescaledb_information.continuous_aggregates;
```

### 31.3 日常运维

```bash
# 启动TimescaleDB
systemctl start timescaledb

# 停止TimescaleDB
systemctl stop timescaledb

# 查看日志
tail -f /var/log/postgresql/timescaledb.log

# 备份数据库
pg_dump -h server -U user -d db > backup.sql

# 恢复数据库
psql -h server -U user -d db < backup.sql
```

---

## 三十二、TimescaleDB 与 IoT 平台

### 32.1 IoT数据架构

```mermaid
graph LR
    A[设备] --> B[网关]
    B --> C[MQTT Broker]
    C --> D[数据处理]
    D --> E[TimescaleDB]
    E --> F[监控平台]
    E --> G[分析平台]
```

### 32.2 实时数据处理

```sql
-- 创建实时计算视图
CREATE VIEW real_time_view AS
SELECT time_bucket('1 minute', time) AS bucket,
       device_id,
       AVG(temperature) AS avg_temp,
       MAX(temperature) AS max_temp,
       MIN(temperature) AS min_temp
FROM sensor_data
WHERE time > NOW() - INTERVAL '1 hour'
GROUP BY bucket, device_id;

-- 创建告警视图
CREATE VIEW alert_view AS
SELECT *
FROM sensor_data
WHERE temperature > 50 AND time > NOW() - INTERVAL '1 hour';
```

---

## 三十三、TimescaleDB 最佳实践

### 33.1 生产环境配置清单

```text
□ 硬件配置
  □ CPU：8核以上
  □ 内存：32GB以上
  □ 磁盘：SSD 1TB以上
  □ 网络：千兆网卡

□ 软件配置
  □ 操作系统：CentOS 7+ / Ubuntu 18+
  □ PostgreSQL版本：12+
  □ TimescaleDB版本：2.0+
  □ 文件系统：ext4/xfs

□ TimescaleDB配置
  □ Hypertable配置
  □ 分区配置
  □ 压缩配置
  □ 连续聚合配置

□ 监控配置
  □ 系统监控
  □ 应用监控
  □ 告警配置
  □ 日志配置
```

### 33.2 性能优化建议

```text
数据模型优化：
  - 合理设计hypertable
  - 选择合适的时间粒度
  - 创建合适的索引

查询优化：
  - 使用时间过滤
  - 避免全表扫描
  - 使用连续聚合

写入优化：
  - 批量写入
  - 合理设置缓冲
  - 避免频繁写入

存储优化：
  - 启用压缩
  - 设置保留策略
  - 定期清理数据
```

---

## 三十四、TimescaleDB 监控与告警

### 25.1 监控指标

| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| timescaledb_num_chunks | 分片数量 | >1000 |
| timescaledb_compression_ratio | 压缩率 | <0.5 |
| timescaledb_cache_hit_rate | 缓存命中率 | <0.9 |
| pg_stat_user_tables_n_tup_ins | 写入行数 | 下降50% |

### 25.2 告警配置

```yaml
# Prometheus监控TimescaleDB
scrape_configs:
  - job_name: 'timescaledb'
    static_configs:
      - targets: ['timescaledb:5432']
    metrics_path: /metrics

# 告警规则
groups:
  - name: timescaledb_alerts
    rules:
      - alert: TimescaleDBWriteDown
        expr: rate(pg_stat_user_tables_n_tup_ins[5m]) < 1000
        for: 5m
        labels:
          severity: warning
```
