# Loki（轻量日志聚合 / 云原生日志存储）

> Loki 是 **Grafana Labs 推出的云原生日志聚合系统**，核心设计是「**只索引标签，不索引内容**」（像 Prometheus 一样用标签定位日志），因此**存储成本比 ELK 低一个量级**。相比 Elasticsearch（全文索引贵）、Splunk（商业）、Zabbix（无日志），Loki 以「**成本低 + 与 Grafana/Prometheus 无缝集成 + K8s 原生（Promtail 采集）**」成为云原生日志栈首选。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 日志存储太贵 | ELK 全文索引每 GB 存储/CPU 成本高 |
| 检索方式错位 | 大多数排查只需要「按服务/标签 + 关键字过滤」，不需要全文检索 |
| 与指标割裂 | 监控（Prometheus）和日志（ELK）两套体系，无法联动 |
| K8s 日志采集 | Pod 动态销毁，日志采集/聚合困难 |
| 告警联动 | 日志异常需要直接触发 Prometheus 风格告警 |

> 核心认知：**Loki = 「用 Prometheus 的思想做日志」**——只索引标签（label），日志内容用日志流（Log Stream）存储，查询时再过滤内容，成本骤降。

---

## 二、核心原理

### 2.1 架构

```
Pod/主机 → Promtail（采集 Agent）
  ├── 读取日志文件 → 打标签（namespace/pod/container/instance）
  └── 推送到 Loki（Push API）

Loki（核心）
  ├── Distributor（分发/校验/批处理）
  ├── Ingester（内存写入 + 预聚合，生成 Log Stream）
  ├── Querier（查询：标签索引 + 内容过滤）
  ├── Index（标签索引存储：TSDB/单store）
  └── Object Store（日志块存储：S3/GCS/MinIO/文件系统）

Grafana（查询/大盘/告警）
  ├── LogQL（类 PromQL 日志查询语言）
  └── 与指标面板联动（一键跳转日志）
```

### 2.2 核心设计：索引标签而非内容

```
ELK：索引每个 token（倒排索引）→ 任何词都能搜 → 存储膨胀 2~5 倍
Loki：只索引 label（app/namespace）→ 内容按压缩块存对象存储
     → 查询 = 先按标签定位日志流 → 再顺序过滤内容
```

**选型关注点**：这个设计是 Loki 成本优势的根源——代价是「内容关键字搜索」比 ES 慢（无倒排索引），适合「标签定位 + 关键字过滤」的排障场景。

### 2.3 日志流（Log Stream）

- **Log Stream = 同一组标签的日志序列**（如 `{app="order", namespace="prod"}`）；
- 写入时按流聚合成块（Chunk），压缩（gzip/snappy）后存对象存储；
- 查询时**按流顺序扫描**，配合时间范围过滤。

### 2.4 LogQL（查询语言）

```logql
# 按标签定位 + 关键字过滤
{app="order-service", namespace="prod"} |= "ERROR"
{app="payment"} |~ "timeout|exception" | json | line_format "{{.msg}}"

# 日志 → 指标（告警用）
sum by (app) (rate({namespace="prod"} |= "ERROR" [5m]))
```

**选型关注点**：LogQL 能把「日志变指标」——日志异常直接进 Prometheus 风格告警，这是 ELK 没有的原生能力。

### 2.5 高可用与多租户

- **单二进制**：Loki 可单进程运行（单store），也可微服务/读写分离部署；
- **租户隔离**：多团队按 tenant 隔离（索引/数据天然分区）；
- **数据留存**：按租户/流配置保留期（retention），块自动清理。

---

## 三、核心特性

| 特性 | 说明 |
|------|------|
| 成本低 | 只索引标签，存储开销为 ES 的 1/3~1/5 |
| 云原生 | Promtail DaemonSet 采集、K8s 标签自动关联 |
| LogQL | 类 PromQL 语法，日志即指标（告警） |
| Grafana 集成 | 原生面板/大盘/告警联动 |
| 多后端 | 对象存储（S3/MinIO/GCS）+ 文件系统 |
| 多租户 | 原生租户隔离（适合多团队） |
| 高可用 | 读写分离、索引/数据分离、故障恢复 |
| 分布式 | 3.0+ 原生 TSDB 索引 + 查询并行 |

---

## 四、Loki vs ELK vs 商业日志（Splunk）

| 维度 | Loki | ELK | Splunk |
|------|------|-----|--------|
| 索引策略 | 只索引标签 | 全文倒排索引 | 全文索引 |
| 存储成本 | 低 | 高（2~5 倍膨胀） | 最高 |
| 检索能力 | 标签+过滤（中等） | 全文检索（强） | 强 |
| 查询语言 | LogQL | Lucene/KQL | SPL |
| 告警 | 原生（日志→指标） | ElastAlert/自建 | 强 |
| 与监控联动 | 无缝（Grafana） | 一般 | 一般 |
| 部署 | 单二进制/K8s | 重（ES 集群） | 商业 |
| 适用 | 云原生排障 | 全文检索/合规审计 | 企业合规 |

**选型关注点**：
- 云原生/K8s/成本敏感 → **Loki**（标签排障足够）；
- 需要全文检索/复杂聚合/审计合规 → **ELK**；
- 大企业合规/预算充足 → **Splunk**；
- 常见组合：**Prometheus（指标）+ Loki（日志）+ Tempo/Jaeger（链路）** = 轻量可观测三件套。

---

## 五、生产实践

### 5.1 关键配置

| 配置 | 建议 |
|------|------|
| 标签设计 | 只加高基数外维度（namespace/app/pod）——高基数标签是杀手 |
| 采集 | Promtail DaemonSet + `pipeline_stages`（解析/脱敏） |
| 存储 | 生产用对象存储（MinIO/S3）+ 索引 TSDB |
| 保留期 | 按租户配 retention（如 7 天热 + 30 天冷） |
| 查询 | 大查询加 `limit`/时间范围（防扫全量） |
| 告警 | LogQL → Alertmanager（Ruler 组件） |

### 5.2 常见坑

- **高基数标签爆炸**：把 request_id 当标签 → 索引膨胀（高基数值只放日志内容里）；
- **无全文搜索**：需要「随便搜个词」的审计场景别用 Loki；
- **Ingester 内存**：写入量大时 Ingester 是瓶颈 → 扩容/分片；
- **保留期不生效**：多租户场景 retention 按租户配置，别只配全局。

---

## 六、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| K8s 日志排障 | Loki + Promtail | ELK |
| 成本敏感 | Loki | 云日志服务 |
| 全文检索/审计 | ELK | Loki（弱） |
| 日志→告警 | Loki LogQL | ElastAlert |
| 与监控联动 | Grafana（Loki+Prom） | — |
| 合规留存 | ELK/Splunk | 云日志归档 |

---

## 七、与其他板块的关系

- ELK 对比见「[ELK 日志体系](./ELK日志体系.md)」；
- 监控指标见「[Prometheus 与 Grafana 监控](./Prometheus与Grafana监控.md)」；
- 可观测性标准见「[OpenTelemetry](./OpenTelemetry.md)」；
- 云上可观测性见「[云上可观测性体系](./云上可观测性体系.md)」；
- 对象存储（日志落盘）见「[对象存储 MinIO/OSS](./对象存储MinIO-OSS.md)」。

> 一句话：**Loki = 「只索引标签不索引内容」+ LogStream 块存储 + LogQL（日志即指标）+ Grafana 原生联动——用 1/3 成本覆盖 90% 排障场景；选型先看「场景（云原生排障→Loki，全文审计→ELK）」，再控「标签基数（禁止高基数标签）」，最后配「对象存储 + 保留期 + 日志告警」**。
