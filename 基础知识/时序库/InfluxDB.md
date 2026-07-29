# InfluxDB 详解

> 时序库板块子文档。概述见 [README](./README.md)。

InfluxDB 是目前最流行的开源时序数据库之一，由 InfluxData 用 Go 语言开发，专为**高吞吐指标写入 + 时间区间聚合查询**设计。本文覆盖 v1.x 与 v2.x/IOx 的关键差异、数据模型、读写、存储引擎与实战。

---

## 1. 定位与适用场景

### 1.1 定位

- 面向 **metrics（监控指标）** 与 **IoT 设备数据** 的专用 TSDB。
- 强调：高写入吞吐、按时间的高效聚合、类 SQL 查询、自带保留策略与连续查询（降采样）。
- 生态完善：Telegraf（采集）、Chronograf（早期可视）、Kapacitor（告警）、Grafana 集成度高。

### 1.2 适用场景

| 场景 | 说明 |
|------|------|
| 服务器 / 容器监控 | CPU、内存、网络指标采集与可视化 |
| 应用指标（APM） | QPS、延迟、错误率 |
| IoT 传感器 | 温度、湿度、压力等高频上报 |
| 实时仪表盘 | 配合 Grafana 做近实时监控大屏 |
| 短期分析与告警 | 基于 CQ/Task 做阈值告警与降采样 |

### 1.3 不适用

- 需要强事务、跨表 JOIN 的复杂业务 → 用关系型。
- 需要全文检索、文档型灵活结构 → Elasticsearch / MongoDB。
- 超长周期（年）需要极低成本的极冷归档 → 可降采样后落对象存储或列式数仓。

---

## 2. 数据模型

### 2.1 v1.x 模型

层级关系（自顶向下）：

```text
database
 └── retention policy (RP)        # 数据保留策略
      └── measurement             # 指标（类似表）
           ├── tag set            # 维度键值对（索引）
           ├── field set          # 数值（不索引）
           └── timestamp          # 时间戳
```

- **database**：逻辑库。
- **retention policy**：数据保留规则，可为一个库配置多个 RP。
- **measurement**：指标集合名。
- **tag**：字符串维度，**可索引**、可过滤/分组；取值应有限。
- **field**：数值，支持 float/int/string/bool，**不索引**。
- **timestamp**：默认纳秒精度，可选 RFC3339 / epoch。

### 2.2 v2.x / IOx 模型

v2.x 引入「桶（bucket）」概念，合并了 database + RP 的语义；v3（IOx 引擎）底层改为 **Parquet + Catalog（基于 Apache Arrow DataFusion）**，用对象存储做持久化，更利于云原生与 SQL 分析。

```text
organization
 └── bucket          # 相当于 database + 默认 RP 的合体
      └── measurement
           ├── tag set
           ├── field set
           └── timestamp
```

| 维度 | v1.x (TSM) | v2.x / IOx (v3) |
|------|------------|-----------------|
| 顶层对象 | database | bucket |
| 存储格式 | TSM 自研文件 | Parquet + Catalog |
| 查询语言 | InfluxQL + Flux | Flux + SQL（IOx 支持 SQL） |
| 引擎目标 | 单机高性能 | 分布式、对象存储、分析友好 |

### 2.3 tag vs field 关键区别（必读）

| 比较项 | tag | field |
|--------|-----|-------|
| 类型 | 字符串 | float/int/string/bool |
| 是否索引 | **是**（进 TSI 倒排索引） | **否** |
| 能否 WHERE 过滤 | 能，且高效 | 能，但需扫数据 |
| 能否 GROUP BY | 能 | 不能 |
| 能否聚合 | 不能（维度） | 能（sum/mean/max…） |
| 基数要求 | **必须低基数** | 可高基数 |
| 典型例子 | host、region、app | cpu_usage、mem_used |

> 记忆口诀：**「要过滤分组用 tag，要算数用 field；tag 是维度，field 是数值。」**

---

## 3. 写入

### 3.1 Line Protocol（行协议）

InfluxDB 的写入文本格式：

```text
<measurement>[,<tag_key>=<tag_value>[,...]] <field_key>=<field_value>[,...] [<timestamp>]
```

规则：

- measurement 与 tag set 之间用逗号，tag set 与 field set 之间用空格。
- 多个 field 用逗号分隔。
- tag value、field string 值需避免空格与逗号（必要时用双引号）。
- field value：数值默认 float；int 加 `i`（如 `42i`）；bool 用 `true/false`；string 用双引号。
- timestamp 为纳秒 epoch（可选，缺省用服务器时间）。

示例：

```text
cpu,host=web-01,region=cn-hz usage=83.5,load=1.2 1670000000000000000
mem,host=web-01 used=1024i,total=4096i
weather,city=hangzhou temp=21.3,desc="sunny"
```

### 3.2 写入方式一：CLI（v1）

```bash
# 写入单点
influx -database metrics -execute 'INSERT cpu,host=web-01,region=cn-hz usage=83.5'

# 从文件批量写
influx -database metrics -import -path /tmp/data.lineproto -precision s
```

### 3.3 写入方式二：HTTP API（v1）

```bash
# 写数据库 metrics，精确到秒
curl -i -XPOST 'http://localhost:8086/write?db=metrics&precision=s' \
  --data-binary 'cpu,host=web-01,region=cn-hz usage=83.5 1670000000'

# 批量（多行）
curl -i -XPOST 'http://localhost:8086/write?db=metrics' \
  --data-binary 'cpu,host=web-01 usage=83.5
cpu,host=web-02 usage=55.0
mem,host=web-01 used=1024i'
```

### 3.4 写入方式三：Telegraf（采集代理）

`telegraf.conf` 片段：

```toml
[[inputs.cpu]]
  percpu = false
  totalcpu = true
  collect_interval = "10s"

[[outputs.influxdb]]
  urls = ["http://localhost:8086"]
  database = "metrics"
  # v2 用如下配置
  # bucket = "metrics"
  # org = "my-org"
  # token = "$INFLUX_TOKEN"
```

### 3.5 写入方式四：v2 HTTP（bucket + token）

```bash
curl -i -XPOST 'http://localhost:8086/api/v2/write?org=my-org&bucket=metrics&precision=s' \
  -H "Authorization: Token <YOUR_TOKEN>" \
  --data-binary 'cpu,host=web-01 usage=83.5 1670000000'
```

> 实战建议：写入尽量**批量 + 并发 + 固定 schema**；避免每条一个 HTTP 请求。使用 gzip 压缩 body 可显著降低网络开销。

---

## 4. 查询

### 4.1 InfluxQL（类 SQL，v1 主力）

基础结构：

```sql
SELECT <field 或 聚合> FROM <measurement>
WHERE <tag 过滤> AND time >= <...>
GROUP BY time(<窗口>), <tag>
FILL(<填充策略>)
ORDER BY time DESC
LIMIT <n>
```

示例 1：查询某主机最近 1 小时 CPU，按 5 分钟聚合均值：

```sql
SELECT mean("usage") AS "avg_usage"
FROM "cpu"
WHERE "host" = 'web-01' AND time >= now() - 1h
GROUP BY time(5m), "region"
FILL(null)
```

示例 2：多 tag 过滤 + 时间区间：

```sql
SELECT max("usage")
FROM "cpu"
WHERE "region" = 'cn-hz' AND "host" =~ /web-.*/ AND time >= '2026-07-28T00:00:00Z' AND time <= '2026-07-28T23:59:59Z'
GROUP BY time(1h)
```

示例 3：`fill()` 处理空窗口（null / 0 / previous / linear）：

```sql
SELECT mean("usage") FROM "cpu"
WHERE time >= now() - 6h
GROUP BY time(10m) FILL(previous)
```

常用聚合：`mean`、`sum`、`count`、`min`、`max`、`median`、`percentile`、`stddev`、`first`、`last`、`difference`、`derivative`（求速率）。

### 4.2 Flux（v2 函数式管道）

Flux 是 InfluxData 自研的数据脚本语言，基于管道（`|>`）操作，能力比 InfluxQL 强（可跨 bucket、做变换、调用外部数据源）。

```js
from(bucket: "metrics")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "cpu" and r.host == "web-01")
  |> filter(fn: (r) => r._field == "usage")
  |> aggregateWindow(every: 5m, fn: mean, createEmpty: true)
  |> yield(name: "avg_usage")
```

关键算子：

- `from(bucket:)`：指定数据源。
- `range(start:, stop:)`：时间窗口。
- `filter(fn:)`：行级过滤（替代 WHERE）。
- `aggregateWindow(every:, fn:)`：按时间窗口聚合（替代 `GROUP BY time()`）。
- `group(columns:)` / `pivot()` / `join()`：分组与关联。
- `map()` / `fill()` / `window()`：变换。

### 4.3 InfluxQL vs Flux 差异

| 维度 | InfluxQL | Flux |
|------|----------|------|
| 风格 | 声明式类 SQL | 函数式管道 |
| 跨 bucket/源 | 弱 | 强（可 join 多源） |
| 复杂变换 | 有限 | 丰富（map/filter/reduce） |
| 学习成本 | 低（会 SQL 即可） | 中高 |
| 性能 | 成熟稳定 | 早期偏慢，IOx 下改善 |
| 生态 | v1 主流 | v2/v3 推荐，IOx 还支持 SQL |

---

## 5. 存储引擎 TSM Tree

InfluxDB v1/v2（非 IOx）使用自研的 **TSM（Time-Structured Merge Tree）** 引擎。

### 5.1 核心组件

| 组件 | 作用 |
|------|------|
| **WAL（Write-Ahead Log）** | 写入先追加到 WAL，崩溃可恢复，保证持久性 |
| **Cache（内存缓存）** | 内存中按 series 排序的待落盘点，查询会合并 WAL+Cache+磁盘 |
| **TSI（Time Series Index）** | 磁盘化倒排索引，支撑 tag 高效检索与高基数 |
| **tsm file** | 不可变的有序数据文件（列式压缩存储 field） |
| **Compaction** | 后台合并 tsm 文件、压缩、去重、生成下采样 |

### 5.2 写入与 Compaction 流程

```mermaid
flowchart TD
    W[写入请求 Line Protocol] --> WAL[追加 WAL 落盘]
    WAL --> CACHE[内存 Cache 按 series 排序]
    CACHE -->|达到阈值/定时| FLUSH[刷盘生成 tsm 文件 level-1]
    WAL -->|Cache 已 flush| WALDEL[删除对应 WAL 段]
    FLUSH --> L1[(tsm level-1)]
    L1 -->|compaction 合并同 shard| L2[(tsm level-2/3 更高压缩)]
    L2 -->|compaction 去重压缩| L3[(tsm 最终层)]
    TSIUPD[TSI 倒排索引更新] -->|写入时| INDEX[(tag -> series 映射)]
    CACHE -->|查询| Q[查询合并 WAL+Cache+tsm]
    L1 & L2 & L3 --> Q
    INDEX --> Q
```

要点：

- 写入路径是**顺序追加**，因此吞吐极高。
- Cache 满或 WAL 过大触发 flush，生成不可变 tsm 文件。
- Compaction 后台进行：合并小文件、按 series 排序、应用 Delta/XOR 压缩、删除过期/重复点。
- TSI 让 tag 过滤无需扫描全部 series，是支撑高基数查询的关键。

---

## 6. 保留策略 RP、连续查询 CQ、Shard Group

### 6.1 保留策略（Retention Policy）

定义数据保存时长与 shard 时长：

```sql
-- 创建 RP：保留 30 天，shard group 1 天，设为默认
CREATE RETENTION POLICY "rp_30d" ON "metrics"
DURATION 30d REPLICATION 1 SHARD DURATION 1d DEFAULT;

-- 修改保留时长
ALTER RETENTION POLICY "rp_30d" ON "metrics" DURATION 90d;
```

### 6.2 Shard Group Duration

shard group 是数据按时间分片的单位，决定单个 shard 覆盖的时间跨度（如 1d / 7d）。设得太小会产生过多 shard；太大则过期粒度粗。经验：

| 保留时长 | 建议 shard duration |
|----------|---------------------|
| < 2 天 | 1h / 1d |
| 2 天 ~ 6 月 | 1d |
| > 6 月 | 7d |

### 6.3 连续查询 CQ（降采样）

CQ 在后台定时把原始高精度数据聚合成粗粒度并写入目标 RP，实现降采样与空间节省。

```sql
-- 每 30 天把 1 分钟数据聚合为 1 小时均值，写入 rp_1y
CREATE CONTINUOUS QUERY "cq_cpu_1h" ON "metrics"
BEGIN
  SELECT mean("usage") AS "usage_avg"
  INTO "metrics"."rp_1y"."cpu_1h"
  FROM "metrics"."rp_30d"."cpu"
  GROUP BY time(1h), *
END;
```

查询长期趋势时改读 `cpu_1h` 即可，既快又省。

> v2 中 CQ 被 **Tasks（Flux 任务）+ 通知/检查** 取代，但思想一致：定时聚合 → 落新 bucket。

---

## 7. 集群与高可用

| 版本 | 集群能力 | 说明 |
|------|----------|------|
| **v1 OSS** | 单机 | 开源版无原生集群，靠副本/备份 |
| **v1 Enterprise** | 原生集群（meta + data 节点） | 商业版，支持分片与副本 |
| **v2 单机** | 单机 | 开源 OSS 仍是单机为主 |
| **v3 IOx** | 云原生分布式 | 基于对象存储 + Catalog，列式 Parquet，支持水平扩展与 SQL |

IOx 架构核心变化：

```mermaid
flowchart LR
    subgraph 写入
        IN[写入请求] --> RO[Router/Ingester]
    end
    RO --> OS[(对象存储 Parquet)]
    RO --> CAT[(Catalog 元数据)]
    subgraph 查询
        Q[查询] --> CAT
        Q --> OS
        Q --> QENG[DataFusion 查询引擎]
    end
```

特点：计算与存储分离，持久层用廉价的对象存储（S3/OSS），元数据用 Catalog，天然适合云上弹性伸缩。

---

## 8. 与 Prometheus 对接

InfluxDB 可作为 Prometheus 的 **远程存储（remote write/read）** 后端，解决 Prometheus 本地 TSDB 长期存储成本高的问题。

`prometheus.yml` 配置：

```yaml
remote_write:
  - url: "http://localhost:8086/api/v1/prom/write?db=metrics&rp=rp_30d"
    # v2: url: http://localhost:8086/api/v2/write?org=my-org&bucket=metrics
    queue_config:
      max_samples_per_send: 1000
      batch_send_deadline: 5s

remote_read:
  - url: "http://localhost:8086/api/v1/prom/read?db=metrics"
```

- Prometheus 采集的指标（label 模型）写入 InfluxDB 后，measurement 即指标名，label 即 tag。
- 也可反向：用 InfluxDB 收集，Grafana 同时连 Prometheus 与 InfluxDB 做统一看板。
- 大流量场景更推荐 **VictoriaMetrics** 作为 Prom 长期存储（压缩率更高、资源更省）。

---

## 9. 部署与实战建议、常见踩坑

### 9.1 部署建议

`influxdb.conf` 关键项（v1 示例）：

```toml
[data]
  dir = "/var/lib/influxdb/data"
  wal-dir = "/var/lib/influxdb/wal"
  # 索引类型：tsi1 支持更高基数
  index-version = "tsi1"
  # 缓存阈值，达到则 flush
  cache-max-memory-size = "1g"
  max-series-per-database = 0   # 0 表示不限，但需自行控制基数

[retention]
  enabled = true
```

Docker 快速启动：

```bash
docker run -d --name influxdb \
  -p 8086:8086 \
  -v $PWD/influxdb:/var/lib/influxdb \
  influxdb:1.8
```

### 9.2 实战建议清单

1. **固定 schema，批量写入**，每批数百~数千点，并发控制合理。
2. **tag 基数前置评估**：序列数 = measurement × tag 取值笛卡尔积，上线前估算。
3. **分层 RP + CQ 降采样**：原始短保留、聚合长保留。
4. **监控 InfluxDB 自身**：series cardinality、shard 数、compaction 耗时、WAL 大小。
5. **查询加时间下界**：务必 `WHERE time >= ...`，否则全量扫。

### 9.3 三大经典踩坑

| 坑 | 现象 | 根因 | 解决 |
|----|------|------|------|
| **tag cardinality 爆炸** | 内存暴涨、写入变慢、OOM | 把 request_id/user_id 等高基数字符串设为 tag | 改为 field；或用哈希分桶降基数 |
| **字段当 tag 用** | 无法聚合、存储膨胀 | 把本应聚合的数值设成 tag | 数值一律放 field |
| **RP 误设** | 数据莫名其妙消失 / 磁盘爆满 | RP 过短导致误删，或过长无降采样 | 按冷热分层配置多 RP + CQ |

> 反例：`weather,city=hangzhou,user_id=12345 temp=21.3` —— `user_id` 是超高基数，绝不可作 tag。应写成 `weather,city=hangzhou temp=21.3,user_id="12345"`（`user_id` 作 field，若确实需要）。

---

## 10. 与其他 TSDB 简短对比

| 对比项 | InfluxDB | Prometheus | TimescaleDB | TDengine | VictoriaMetrics |
|--------|----------|------------|-------------|----------|-----------------|
| 查询语言 | InfluxQL/Flux/SQL(IOx) | PromQL | SQL | SQL | PromQL/MetricSQL |
| 集群 | OSS 单机，IOx 云原生 | 联邦/远程写 | PG 复制 | 原生分布式 | 集群版 |
| 压缩 | 强 | 中 | 中 | 极强 | 极强 |
| 生态 | Telegraf 成熟 | 云原生标配 | PG 生态 | 国产 IoT | Prom 兼容 |
| 优势 | 易用、监控/IoT 友好 | K8s 监控事实标准 | 关系+时序一体 | 海量设备 | 省资源、大流量 |
| 劣势 | OSS 无原生集群 | 长保留贵 | 时序能力弱于专用 | 生态偏国内 | PromQL 学习曲线 |

**选型一句话**：

> 要开箱即用做监控/IoT → InfluxDB；已在 K8s 用 Prom → 配 VictoriaMetrics 做长期存储；偏 SQL 且要 JOIN → TimescaleDB；设备海量+国产化 → TDengine。

---

## 参考

- 官方文档：<https://docs.influxdata.com/>
- FB Gorilla 论文（XOR 压缩）：*Gorilla: A Fast, Scalable, In-Memory Time Series Database*
- 板块概述：[时序库 README](./README.md)

---

## 11. 运维实战与性能调优

### 11.1 集群运维（IOx 云原生）

IOx 引擎下 InfluxDB 走向「计算存储分离」：Router/Ingester 接收写入并写对象存储（S3/OSS），Catalog 记录元数据，Querier 基于 DataFusion 查询 Parquet。

```bash
# docker 启动 IOx（单机伪集群，便于验证）
docker run -d --name influxdb-iox \
  -p 8086:8086 -p 8082:8082 \
  -e INFLUXDB_IOX_OBJECT_STORE=file \
  -e INFLUXDB_IOX_DB_DIR=/var/lib/influxdb-iox \
  influxdb:3.0-iox
```

运维要点：
- **对象存储是持久层**，其可用性与延迟直接决定写入吞吐，建议用高可靠 OSS/S3 并监控 4xx/5xx。
- **Catalog 后端**（Postgres/SQLite）是关键元数据，需备份与高可用。
- 水平扩展 = 加 Ingester/Querier 实例 + 共享同一对象存储与 Catalog。

### 11.2 Shard 规划

shard group duration 决定单个 shard 的时间跨度，影响过期粒度与文件数：

```sql
-- 写入密集场景：保留 90 天，shard 7 天，减少 shard 数量
CREATE RETENTION POLICY "rp_90d" ON "metrics"
DURATION 90d REPLICATION 1 SHARD DURATION 7d DEFAULT;
```

| 保留时长 | shard duration | 说明 |
|----------|----------------|------|
| < 2d | 1h/1d | 避免 shard 过多 |
| 2d~6M | 1d | 默认均衡 |
| > 6M | 7d | 降低文件与 compaction 压力 |

> 反例：保留 1 年却用 1h shard → 产生 8760 个 shard，元数据与查询规划开销剧增。

### 11.3 Cardinality 治理

```bash
# 查看各 measurement 的 series 数（诊断基数）
influx -database metrics -execute 'SHOW SERIES CARDINALITY'
influx -database metrics -execute 'SHOW MEASUREMENT CARDINALITY'

# 查看具体高基数 tag 组合
influx -database metrics -execute 'SHOW TAG VALUES CARDINALITY FROM "cpu" WITH KEY = "host"'
```

治理手段：
- 把 `request_id`、`user_id` 等高基数列从 tag 移到 field。
- 用连续查询/Task 做降采样，聚合后只保留低频维度。
- 设置 `max-series-per-database` 上限做硬性熔断（需评估业务）。
- 定期 `DROP SERIES WHERE ...` 清理已退场设备序列，回收索引。

### 11.4 备份与恢复

```bash
# 离线备份整个 InfluxDB 数据目录（停机或低峰）
influxd backup /tmp/influxdb-backup

# 备份指定数据库
influxd backup -database metrics /tmp/metrics-backup

# 恢复
influxd restore -database metrics -metadir /var/lib/influxdb/meta \
  -datadir /var/lib/influxdb/data /tmp/metrics-backup
```

> 生产建议：结合对象存储做定期 `influxd backup` + 二进制目录快照；IOx 下直接备份对象存储 bucket 与 Catalog 库即可。

### 11.5 与 Grafana / Telegraf 全链路

```toml
# telegraf.conf：采集并写 InfluxDB + 同时暴露 Prometheus 端点
[[outputs.influxdb]]
  urls = ["http://influxdb:8086"]
  database = "metrics"

[[outputs.prometheus_client]]
  listen = ":9273"
```

```json
// Grafana 数据源配置（influxdb 数据源）
{
  "name": "InfluxDB",
  "type": "influxdb",
  "url": "http://influxdb:8086",
  "database": "metrics",
  "access": "proxy"
}
```

全链路健康 checklist：
- [ ] Telegraf `flush` 间隔与 batch 大小匹配写入峰值。
- [ ] Grafana 查询带时间下界，避免全量扫。
- [ ] 监控 Telegraf `write.errors`、InfluxDB `writeReq` 延迟。

### 11.6 常见故障排查

| 症状 | 可能根因 | 排查/处置 |
|------|----------|-----------|
| 写入延迟飙升 | cardinality 爆炸 / WAL 堆积 | `SHOW SERIES CARDINALITY`；扩容或降基数 |
| 内存 OOM | 高基数 tag / cache 过大 | 降基数；调小 `cache-max-memory-size` |
| 查询超时 | 全量扫 / shard 过多 | 加 `time >=` 下界；调整 shard duration |
| 数据消失 | RP 误设过短 | 检查 RP；重配多 RP + CQ |
| compaction 卡住 | 磁盘 IO 瓶颈 | 监控 `compactions.active`；换 SSD |

### 11.7 迁移与升级

- **v1 → v2**：用 `influx_inspect export` 导出 line protocol，再 v2 CLI 导入；注意 database→bucket 映射。
- **v1 → IOx(v3)**：通过远程读/双写过渡；IOx 支持 SQL，旧 Flux 脚本需评估迁移成本。
- 大版本升级前必须备份 meta + data 目录，并在隔离环境验证查询兼容性。

---

## 12. 第三轮深度实战（基准 / 迁移 / 告警 / 流计算 / 成本 / 排障 SOP）

### 12.1 性能基准（TSBS 实测数字 / 推导）

TSBS `cpu-only` 场景（每主机 100 指标，单机 NVMe）公开结论区间：

| 指标 | InfluxDB TSM 2.x | 说明 |
|------|------------------|------|
| 写入吞吐 | ~20~50 万 metrics/s | 批量+并发，纳秒精度下略降 |
| 单点查询 P99 | < 10 ms | 带时间下界、命中 TSI |
| 大范围聚合 | 中 | shard 多则慢，需降采样 |
| 压缩比 | 4~10:1 | Delta/XOR + Snappy |

推导公式（用于自测预估）：

```text
目标吞吐(点/s) = 主机数 × 100(指标) / scrape_interval(s)
例：1000 主机、10s 抓 → 1000×100/10 = 1,000,000 点/s
→ 需分布式 IOx 或双写分流，单机 TSM 易到天花板
```

建议：上线前用 TSBS 在自身机型跑 `cpu-only`+`devops`，记录 `inserts/s`、磁盘、查询 P99，作为容量基线。

### 12.2 迁移实战：InfluxDB → VictoriaMetrics 双写切换 SOP

适用：用 InfluxDB 做 Prom 远程存储，想换 VM 省成本。

```mermaid
flowchart LR
    A[Prometheus] -->|1. 双写| B[InfluxDB]
    A -->|1. 双写| C[VictoriaMetrics]
    D[历史回放\ninfluxd backup→VM import] --> C
    E[校验\nsample diff] --> C
    F[灰度切读\nGrafana 数据源切 VM] --> C
    F -->|稳定| G[InfluxDB 只读下线]
```

SOP 步骤：
1. **双写**：Prometheus `remote_write` 同时指向 InfluxDB 与 VM；VM 开启 `-dedup.minScrapeInterval` 防重复。
2. **回放**：用 `influxd backup` 导出历史，经 line protocol 写入 VM（VM 兼容 Influx 行协议 `/write`）。
3. **校验**：用脚本抽样比对两库同一 `(metric, labels, ts)` 的值，允许浮点误差 < 1e-6。
4. **切读**：Grafana 数据源先 5% 看板切 VM，观察 48h 无缺数/抖动。
5. **下线**：InfluxDB 置只读，观察 7 天，确认后停写释放资源。

```yaml
# prometheus.yml 双写片段
remote_write:
  - url: http://influxdb:8086/api/v1/prom/write?db=metrics
  - url: http://vminsert:8480/insert/0/prometheus/api/v1/write
    queue_config: { max_samples_per_send: 10000, capacity: 100000 }
```

### 12.3 与监控 / Grafana 全链路告警规则示例

Grafana 统一告警（InfluxDB 数据源 + Flux 阈值检查）：

```yaml
# grafana 告警规则（unified alerting，HTTP 配置示意）
apiVersion: 1
groups:
  - name: influxdb_cpu_alert
    rules:
      - alert: HighCPU
        expr: |
          from(bucket:"metrics") |> range(start:-5m)
          |> filter(fn:(r)=> r._measurement=="cpu" and r._field=="usage")
          |> mean() |> filter(fn:(r)=> r._value > 85)
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "主机 {{ $labels.host }} CPU 持续 >85%"
```

Kapacitor 阈值（TICK 脚本片段）：

```js
stream
  |from().measurement('cpu').where(lambda: "host" == 'web-01')
  |alert()
    .warn(lambda: "usage" > 80)
    .crit(lambda: "usage" > 90)
    .slack()
```

全链路健康 Checklist：
- [ ] Telegraf `flush` 间隔匹配峰值；`write.errors` = 0。
- [ ] InfluxDB `writeReq` 延迟 P99 < 1s；WAL 不持续增长。
- [ ] Grafana 查询均带 `time >=` 下界，避免全量扫。

### 12.4 与 Flink / Spark 实时计算联动代码

Spark 读 InfluxDB 2.x（Scala，使用 influxdb-spark 或 JDBC）：

```scala
// 通过 DataFrame 读取 InfluxDB（2.x Flux 结果）
val df = spark.read
  .format("influxdb")
  .option("url", "http://influxdb:8086")
  .option("token", sys.env("INFLUX_TOKEN"))
  .option("org", "my-org")
  .option("query", """from(bucket:"metrics")|>range(start:-1h)|>filter(r=>r._measurement=="cpu")""")
  .load()
df.groupBy("host").avg("_value").show()
```

Flink SQL 将聚合结果写回 InfluxDB（行协议 sink）：

```sql
CREATE TABLE influx_sink (
  host STRING,
  avg_cpu DOUBLE,
  window_end TIMESTAMP(3)
) WITH (
  'connector' = 'influxdb',
  'url' = 'http://influxdb:8086',
  'database' = 'metrics',
  'measurement' = 'cpu_agg'
);
INSERT INTO influx_sink
SELECT host, AVG(usage), TUMBLE_END(ts, INTERVAL '1' MINUTE)
FROM cpu_stream GROUP BY host, TUMBLE(ts, INTERVAL '1' MINUTE);
```

联动要点：Flink 侧做窗口聚合/富化后再落 InfluxDB，减少查询期 JOIN；明细与聚合分 measurement 存储。

### 12.5 成本优化（冷热分层 / 降采样 / 保留策略）

```sql
-- 多档 RP：原始 30d 热，1m 聚合 90d，1h 聚合 1y
CREATE RETENTION POLICY "rp_hot"  ON metrics DURATION 30d  REPLICATION 1 SHARD DURATION 1d DEFAULT;
CREATE RETENTION POLICY "rp_90d"  ON metrics DURATION 90d  REPLICATION 1 SHARD DURATION 7d;
CREATE RETENTION POLICY "rp_1y"   ON metrics DURATION 365d REPLICATION 1 SHARD DURATION 7d;

CREATE CONTINUOUS QUERY "cq_1m" ON metrics
BEGIN
  SELECT mean("usage") INTO "metrics"."rp_90d"."cpu_1m"
  FROM "metrics"."rp_hot"."cpu" GROUP BY time(1m), *
END;

CREATE CONTINUOUS QUERY "cq_1h" ON metrics
BEGIN
  SELECT mean("usage") INTO "metrics"."rp_1y"."cpu_1h"
  FROM "metrics"."rp_90d"."cpu_1m" GROUP BY time(1h), *
END;
```

IOx 下直接把 Parquet 落对象存储（S3/OSS），热数据用 SSD、冷数据用对象存储，成本降至块存储 1/10 量级。

### 12.6 生产排障 SOP

**Cardinality 治理 SOP**
- [ ] `SHOW SERIES CARDINALITY` 定位高基数 measurement。
- [ ] 把 `request_id`/`user_id` 等从 tag 移至 field；如必须保留，用 `hash(user_id)%100` 分桶。
- [ ] 设 `max-series-per-database` 硬上限做熔断；`DROP SERIES` 清理退场设备。

**写入拒绝（write rejected / 429）SOP**
- [ ] 查 `SHOW STATS` 的 `writeErrors`、WAL 大小、磁盘剩余。
- [ ] 升 `cache-max-memory-size` 或加节点；临时降抓取频率缓解。
- [ ] IOx 查对象存储 4xx/5xx，必要时提 IO/限流。

**查询超时 SOP**
- [ ] 确认查询带 `time >=` 下界；缩小时间窗与 tag 过滤。
- [ ] 调整 shard duration（避免 1 年数据用 1h shard）。
- [ ] 大查询走聚合 RP，避免对 `rp_hot` 做跨月明细扫。
