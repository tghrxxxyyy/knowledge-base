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
