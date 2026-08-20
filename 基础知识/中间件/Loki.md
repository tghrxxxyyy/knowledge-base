# Loki 深入（架构原理 / LogQL 查询 / Promtail 配置 / 分块存储 / 多租户 / 运维调优）

> Loki 是 Grafana 出品的**日志聚合系统**，核心理念「只索引标签，不索引日志内容」——比 ELK 便宜一个数量级，与 Prometheus/Grafana 无缝集成。本篇深入拆解：Loki 架构与存储、LogQL 查询语法、Promtail 采集配置、多租户、运维调优。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| ELK 成本高 | Elasticsearch 全量索引日志，资源消耗大、费用高 |
| 与监控割裂 | 日志系统和指标系统（Prometheus）两套，无法联动 |
| 多集群日志 | K8s 多集群/多环境日志统一管理 |
| 留存成本 | 日志量大，长期留存太贵 |
| 查询慢 | 海量日志全文搜索响应慢 |

> 核心认知：**Loki = 「只索引标签（如 Pod/服务名），日志内容当字符串存」**——查询先按标签定位日志流（就像按文件名定位日志文件），再做内容过滤；省掉全文索引 = 省掉大量 CPU/内存/磁盘。

---

## 二、架构

```
日志源（K8s 容器 / 主机 / 应用）
  └── Promtail（采集器：跟随日志文件，加标签，推送 Loki）
        │  （或其他客户端：Fluent Bit / Docker Driver / SDK）
        ▼
Loki（聚合查询）
  ├── Distributor（入口：校验/压测/去重 → 哈希路由）
  ├── Ingester（写入：内存 chunk → 定时刷盘对象存储）
  ├── Querier（查询：解析 LogQL → 按标签定位 → 读 chunk）
  ├── Compactor（合并/清理/索引管理）
  └── Ruler（告警规则：LogQL 条件告警）
        │
        ▼
存储：对象存储（S3/MinIO/OSS）+ 本地缓存（可选）

查询界面：Grafana Explore
```

---

## 三、存储模型（深入）

### 3.1 核心概念

```
Stream（日志流）：
  具有相同标签集合的日志集合（如 {app="order", pod="a-1"}）
  = Loki 的最小组织单位

Chunk（分块）：
  一个 Stream 的日志按时间切块存储
  默认压缩（snappy/gzip）→ 体积小

Index（索引）：
  只索引 标签 → Stream 的映射（不索引内容！）
  → 查询 = 按标签找 Stream → 读 chunk → 内容过滤
```

### 3.2 写入流程

```
1. Promtail 推送日志（带标签：namespace/pod/container）
2. Distributor：校验格式 → 按标签哈希路由到 Ingester
3. Ingester：日志追加到对应 Stream 的内存 chunk
4. Chunk 达到阈值（默认 1.5MB 或 15 分钟）→ 压缩 → 刷盘对象存储
5. 索引（标签 → chunk）更新

Flush 参数：
  chunk_idle_period（默认 30m，无新日志也刷）
  chunk_target_size（默认 1.5MB）
  max_chunk_age（默认 2h）
```

### 3.3 读取流程

```
1. 用户执行 LogQL 查询
2. Querier 解析标签选择器 → 查索引 → 定位 chunk
3. 拉取 chunk（对象存储）→ 解压 → 过滤内容（正则/子串）
4. 返回结果（Grafana 展示）

查询性能：
  标签定位（快）→ chunk 读取（中等）→ 内容过滤（慢，但省资源）
```

### 3.4 单机模式 vs 分布式模式

| 模式 | 部署 | 适用 |
|------|------|------|
| Single Binary | 单进程全组件 | 小规模/开发 |
| 简单可扩展（SSD） | 读写分离 | 中规模 |
| 分布式模式（微服务） | 各组件独立扩缩 | 大规模生产 |

---

## 四、LogQL 查询语法（深入）

### 4.1 基本语法

```
标签选择器（必须）：
  {app="order"}                          # 单标签
  {app="order", env="prod"}              # 多标签（AND）
  {app=~"order|user"}                    # 正则
  {namespace="default"} != {container="sidecar"}   # 排除

行过滤器（内容过滤）：
  |="keyword"         # 包含子串
  !="keyword"         # 不包含
  |~"regex"           # 正则匹配
  !~"regex"           # 正则不匹配
```

### 4.2 示例

```promql
# 查订单服务 5 分钟内的 ERROR 日志
{app="order"} |= "ERROR" |= "order_id=10086"

# 排除心跳日志
{app="order"} !~ "heartbeat|healthz"

# 解析日志内容为字段（logfmt/json）
{app="order"} |= "ERROR" | logfmt | level="error"

{app="order"} | json | status_code=500

# 正则提取
{app="order"} |~ "(?P<ip>\\d+\\.\\d+\\.\\d+\\.\\d+)" | ip="10.0.0.1"
```

### 4.3 聚合与指标查询

```
# 错误数（5 分钟窗口）
sum(rate({app="order"} |= "ERROR" [5m]))

# 按状态码统计
sum by (status_code) (count_over_time({app="order"} | json [5m]))

# 日志量趋势
sum(rate({app="order"} [5m]))

# 分位数（延迟日志）
quantile_over_time(0.99, {app="order"} | json | __error__="" | unwrap duration_ms [5m]) > 500
```

### 4.4 常用函数

| 函数 | 用途 |
|------|------|
| rate/count_over_time | 频率/计数 |
| sum by / avg by | 按标签聚合 |
| unwrap | 提取数值做指标 |
| quantile_over_time | 分位数 |
| topk | Top N |

---

## 五、Promtail 配置（采集器）

### 5.1 基本配置

```yaml
# promtail-config.yaml
clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  # K8s 自动发现（Pod 日志）
  - job_name: kubernetes-pods
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: pod
      - source_labels: [__meta_kubernetes_pod_container_name]
        target_label: container
      - action: replace
        replacement: $1
        separator: /
        source_labels: [namespace, pod]
        target_label: instance

  # 主机日志文件
  - job_name: system
    static_configs:
      - targets: [localhost]
        labels:
          job: system
          __path__: /var/log/*.log
```

### 5.2 核心配置项

| 配置 | 说明 |
|------|------|
| clients.url | Loki 推送地址 |
| relabel_configs | 标签重写（加环境/团队） |
| pipeline_stages | 内容解析（提取字段做标签） |
| positions | 断点续传（文件位置记录） |
| backoff_config | 重试退避 |

### 5.3 Pipeline 解析阶段

```yaml
pipeline_stages:
  - regex:
      expression: "^(?P<level>\\w+) (?P<ts>\\d+) (?P<msg>.*)"
  - labels:
      level:       # 提取 level 做标签
  - timestamp:
      source: ts
      format: RFC3339
  - output:
      source: msg
```

**标签设计规范**（低成本关键）：

```
好的标签（低基数）：
  namespace / pod / container / service / level / env / 业务维度

坏的标签（高基数）：
  request_id / user_id / ip / 随机值 → 每个值一个 Stream → 爆炸！
```

---

## 六、多租户

```
多租户模式：
  每个租户隔离（写入/查询）
  X-Scope-OrgID Header 标识租户
  存储隔离（对象存储分前缀）

配置：
  auth_enabled: true  # 开启多租户
  写入/查询带租户 ID（Promtail/Grafana 配置）

用途：
  多部门/多项目日志隔离
  资源配额（per 租户）
  权限控制（按租户）
```

---

## 七、告警（Ruler）

```
Loki 自身支持告警：
  LogQL 条件 → 触发告警（如 5 分钟内错误日志 > N）

示例：
  groups:
  - name: error-alerts
    rules:
    - alert: HighErrorRate
      expr: sum(rate({app="order"} |= "ERROR" [5m])) > 10
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "订单服务错误日志过多"

通知渠道：Grafana Alerting（Slack/钉钉/邮件）
```

---

## 八、Loki vs ELK vs 云日志服务

| 维度 | Loki | ELK（ES） | 云日志服务 |
|------|------|-----------|------------|
| 索引策略 | 只索引标签 | 全量全文索引 | 全量索引（云端优化） |
| 存储成本 | 低（对象存储） | 高（副本+索引） | 中 |
| 查询能力 | 标签+内容过滤 | 全文/复杂聚合 | 全文+结构化 |
| 实时性 | 秒级 | 秒级 | 秒级 |
| 运维复杂度 | 低 | 高 | 无（托管） |
| 生态 | Grafana 一体 | Kibana 强大 | 云生态 |
| 适用 | 日志量大/成本敏感/监控联动 | 复杂全文检索/安全分析 | 省事/合规要求 |

**选型关注点**：
- 成本敏感 + Grafana 生态 → **Loki**；
- 复杂全文检索（安全分析/审计）→ **ELK**；
- 无运维能力/合规要求 → **云日志服务**。

---

## 九、运维与调优

### 9.1 容量规划

```
存储估算：
  原始日志 1GB/天 × 压缩比 ~4:1 → 约 250MB/天（对象存储）
  留存 30 天 → ~7.5GB/月

内存估算（Ingester）：
  chunk 内存 = 并发流 × chunk 大小
  监控指标：chunks_in_memory

查询性能：
  标签基数越低查询越快
  大范围查询（1 周）注意超时
```

### 9.2 性能调优

| 方向 | 优化 |
|------|------|
| 写入 | Distributor/Ingester 水平扩容；压缩（snappy） |
| 查询 | 缓存（chunk/索引缓存）；Querier 扩容 |
| 存储 | 对象存储 + 生命周期（热→冷→删） |
| 采集 | Promtail 多副本（DaemonSet）；标签规范化 |
| 高基数 | 限制标签基数（per_stream_rate_limit） |

### 9.3 常见坑

| 坑 | 说明 | 对策 |
|----|------|------|
| 高基数标签 | 每个 user_id 一个 Stream → 索引爆炸 | 标签规范审查 |
| Promtail 丢日志 | 退避过长/资源不足 | 调整 backoff/内存 |
| Ingester OOM | chunk 内存高 | 调 chunk 大小/扩容 |
| 查询超时 | 大范围查询 | 缩小范围/缓存 |
| 日志乱序 | 容器重启时间戳 | 调整容忍度配置 |
| 多租户误配 | 无租户 ID 被拒 | 统一配置 |

### 9.4 监控 Loki 自身

```
核心指标（Prometheus）：
  loki_request_duration_seconds
  chunks_in_memory（内存 chunk 数）
  rate（写入速率）
  查询延迟 P99
  对象存储错误率
```

---

## 十、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 成本敏感日志聚合 | Loki | 云日志服务 |
| Grafana 监控联动 | Loki | — |
| 复杂全文检索 | ELK | 云日志服务 |
| 合规审计 | ELK | 云日志服务 |
| K8s 多集群日志 | Loki + Promtail | 云日志 Agent |
| 无运维团队 | 云日志服务 | Loki 托管版 |

---

## 十一、与其他板块的关系

- 日志体系整体见「[ELK 日志体系](./ELK日志体系.md)」；
- 采集传输见「[日志采集与传输](./日志采集与传输.md)」；
- 监控指标见「[Prometheus 与 Grafana 监控](./Prometheus与Grafana监控.md)」；
- 统一可观测性见「[OpenTelemetry](./OpenTelemetry.md)」与「[SRE与稳定性工程/02-可观测性与稳定性看护](../../SRE与稳定性工程/02-可观测性与稳定性看护.md)」。

> 一句话：**Loki = 只索引标签（省成本）+ 对象存储冷热分层 + LogQL（标签选择器 → 内容过滤 → 聚合指标）+ Promtail 采集 + Ruler 告警——生产三守则：标签低基数、chunk 合理大小、查询范围可控**。