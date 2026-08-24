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

## 十二、Loki 架构深入（Ingester/Distributor/Querier）

### 12.1 核心组件职责

```mermaid
flowchart TD
    A[Promtail<br/>采集器] -->|push| B[Distributor<br/>入口/校验/路由]
    B -->|哈希路由| C[Ingester<br/>内存Chunk写入]
    B -->|哈希路由| D[Ingester<br/>副本写入]
    C -->|flush| E[对象存储<br/>S3/MinIO]
    D -->|flush| E
    F[Querier<br/>查询引擎] -->|读取| E
    G[Compactor<br/>合并/清理] -->|优化| E
    H[Ruler<br/>告警规则] -->|LogQL| F
```

### 12.2 Distributor 详解

```
Distributor 职责：
  1. 接收 Promtail/Fluent Bit 推送的日志
  2. 校验日志格式（标签合法/时间戳合理）
  3. 按标签哈希路由到指定 Ingester
  4. 去重（相同 Stream 的重复日志）
  5. 限流（per_stream_rate_limit）

路由策略：
  标签哈希 → 确保相同 Stream 到同一 Ingester
  → 保证 Chunk 的完整性

副本写入：
  3 副本写入不同 Ingester
  → 防止单节点故障丢数据
```

### 12.3 Ingester 详解

```
Ingester 职责：
  1. 日志追加到内存 Chunk（按 Stream 组织）
  2. Chunk 达到阈值 → 压缩 → flush 到对象存储
  3. 维护索引（标签 → Chunk 映射）
  4. 处理查询（返回内存中未 flush 的数据）

Chunk 生命周期：
  新建 → 追加日志 → 达到阈值 → 压缩 → flush 到存储
  阈值：chunk_target_size(1.5MB) / max_chunk_age(2h) / chunk_idle_period(30m)

内存管理：
  chunks_in_memory 监控
  OOM 风险：高并发写入 + 大 Chunk → 内存打满
  对策：限制并发流数量 / 调小 Chunk / 扩容
```

### 12.4 Querier 详解

```
Querier 职责：
  1. 解析 LogQL 查询语句
  2. 按标签选择器查索引 → 定位 Chunk
  3. 从对象存储拉取 Chunk
  4. 解压 + 内容过滤（正则/子串）
  5. 返回结果

查询优化：
  标签定位（快）→ Chunk 缓存（中等）→ 内容过滤（慢）
  
  缓存策略：
    chunk 缓存（已解压的 Chunk 缓存到内存）
    索引缓存（标签 → Chunk 映射缓存）
    查询结果缓存（相同查询复用）
```

---

## 十三、Loki 无索引设计（Index-Free）

### 13.1 设计原理

```
传统日志系统（ELK）：
  全文索引（倒排索引）
  每个字段都建索引
  索引体积 ≈ 数据体积的 10~30%
  → 索引占用大量 CPU/内存/磁盘

Loki 设计：
  只索引 标签（labels）→ Stream 的映射
  不索引日志内容
  索引体积 ≈ 数据体积的 1~5%
  → 索引极小，存储成本极低

查询方式：
  标签定位（秒级，查索引）
  → 找到 Stream 对应的 Chunk
  → 读取 Chunk（对象存储）
  → 内容过滤（正则/子串，逐行扫描）
```

### 13.2 优劣对比

| 维度 | Loki（无索引） | ELK（全文索引） |
|------|---------------|----------------|
| 存储成本 | 低（对象存储） | 高（索引+副本） |
| 索引大小 | 极小（标签映射） | 大（全文倒排） |
| 查询灵活性 | 标签+内容过滤 | 全文检索（最强） |
| 查询延迟 | 标签查询快，内容过滤慢 | 全文检索快 |
| 写入性能 | 高（无索引开销） | 中（需建索引） |
| 运维复杂度 | 低 | 高（ES 集群） |

### 13.3 最佳实践

```
标签设计（低成本关键）：
  好的标签（低基数）：
    namespace / pod / container / service / level / env
    → 每个标签值组合形成一个 Stream
    → 数千~数万个 Stream

  坏的标签（高基数）：
    request_id / user_id / ip / 随机值
    → 每个值一个 Stream → 数百万 Stream → 索引爆炸！

查询优化：
  尽量用标签缩小范围（先标签后过滤）
  避免无标签的全文搜索（全量扫描）
  合理设置查询时间范围（避免大范围扫描）
```

---

## 十四、LogQL 深入

### 14.1 高级查询语法

```promql
# 日志流选择器
{app="order", env="prod"}              # 精确匹配
{app=~"order|user"}                    # 正则匹配
{app="order"} !~ "heartbeat"           # 正则排除

# 管道操作（按顺序执行）
{app="order"}
  |= "ERROR"                           # 包含子串
  | json                                # 解析 JSON
  | level="error"                       # 字段过滤
  | line_format "{{.timestamp}} {{.msg}}"  # 格式化输出
  | label_format status="{{.code}}"     # 标签重命名

# 解析器
| logfmt                               # logfmt 格式
| json                                 # JSON 格式
| regexp "(?P<ip>\\d+\\.\\d+\\.\\d+\\.\\d+)"  # 正则提取
| pattern "<ip> - - [<ts>] "<method> <path> <status> <size>""  # 模式解析
```

### 14.2 聚合操作

```promql
# 错误率（每秒错误数）
sum(rate({app="order"} |= "ERROR" [5m]))

# 按服务统计错误数
sum by (app) (count_over_time({app=~".*"} |= "ERROR" [5m]))

# Top 5 错误日志最多的 Pod
topk(5, sum by (pod) (count_over_time({app="order"} |= "ERROR" [5m])))

# 日志量趋势（每分钟）
sum(rate({app="order"} [1m])) * 60

# 延迟分位数（从日志中提取数值）
quantile_over_time(0.99,
  {app="order"} | json | unwrap duration_ms [5m]
) > 1000

# 错误日志占比
sum(rate({app="order"} |= "ERROR" [5m]))
/
sum(rate({app="order"} [5m]))
```

### 14.3 LogQL 常用函数

| 函数 | 用途 | 示例 |
|------|------|------|
| rate | 每秒速率 | rate({app="order"} [5m]) |
| count_over_time | 时间窗口计数 | count_over_time({app="order"} [5m]) |
| sum by | 按标签聚合求和 | sum by (app) (rate(...)) |
| topk | Top N | topk(5, sum by (app) (...)) |
| unwrap | 提取数值做指标 | unwrap duration_ms |
| quantile_over_time | 分位数 | quantile_over_time(0.99, ...) |
| line_format | 格式化输出 | line_format "{{.msg}}" |
| label_format | 标签名重命名 | label_format app="{{.service}}" |

---

## 十五、Loki in Kubernetes

### 15.1 部署架构

```
K8s 集群：
  DaemonSet: Promtail/Fluent Bit（每节点一个采集器）
  Deployment: Loki Distributor（入口）
  StatefulSet: Loki Ingester（写入，3 副本）
  Deployment: Loki Querier（查询）
  Deployment: Loki Compactor（合并清理）
  ConfigMap: Loki 配置
  PVC: 对象存储（S3/MinIO）

  Grafana: 查询界面
```

### 15.2 Promtail DaemonSet 配置

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: promtail
spec:
  template:
    spec:
      serviceAccountName: promtail
      containers:
      - name: promtail
        image: grafana/promtail:2.9.0
        args:
        - -config.file=/etc/promtail/promtail.yaml
        volumeMounts:
        - name: config
          mountPath: /etc/promtail
        - name: varlog
          mountPath: /var/log
          readOnly: true
        - name: containers
          mountPath: /var/lib/docker/containers
          readOnly: true
      volumes:
      - name: config
        configMap:
          name: promtail-config
      - name: varlog
        hostPath:
          path: /var/log
      - name: containers
        hostPath:
          path: /var/lib/docker/containers
```

### 15.3 K8s 日志标签自动发现

```yaml
# promtail-config.yaml
scrape_configs:
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
  - source_labels: [__meta_kubernetes_pod_label_app]
    target_label: app
  - action: replace
    source_labels: [__meta_kubernetes_pod_label_env]
    target_label: env
    replacement: production
```

---

## 十六、Loki vs ELK 全面对比

| 维度 | Loki | ELK |
|------|------|-----|
| 索引策略 | 只索引标签（1~5%） | 全文索引（10~30%） |
| 存储成本 | 低（对象存储） | 高（ES 集群+副本） |
| 查询能力 | 标签+内容过滤 | 全文检索+聚合 |
| 写入性能 | 高（无索引开销） | 中（建索引） |
| 运维复杂度 | 低（Grafana 一套） | 高（ES 集群运维） |
| 生态集成 | Prometheus/Grafana 一体 | Kibana 强大 |
| 多租户 | 原生支持 | 需额外配置 |
| 实时性 | 秒级 | 秒级 |
| 扩展性 | 水平扩展（对象存储） | 水平扩展（ES 集群） |
| 学习曲线 | 低 | 中高 |

**选型决策**：

| 场景 | 首选 | 理由 |
|------|------|------|
| 成本敏感 + Grafana 生态 | Loki | 存储成本低，与 Prometheus 一体 |
| 复杂全文检索（安全/审计） | ELK | 全文索引能力强 |
| 云原生 K8s 日志 | Loki | 轻量，K8s 集成好 |
| 日志做分析报表 | ClickHouse | 分析型查询强 |
| 无运维能力 | 云日志服务 | 托管免运维 |

---

## 十七、Loki 存储后端

### 17.1 存储选项

| 存储后端 | 说明 | 适用 |
|---------|------|------|
| BoltDB-shipper | 本地 BoltDB + 对象存储 | 中小规模 |
| AWS S3 | Amazon S3 | 大规模/云上 |
| GCS | Google Cloud Storage | GCP 环境 |
| Azure Blob | Azure Blob Storage | Azure 环境 |
| MinIO | S3 兼容对象存储 | 自建/测试 |
|/filesystem | 本地文件系统 | 单机/开发 |

### 17.2 BoltDB-shipper 架构

```
BoltDB-shipper 架构：
  Ingester → BoltDB（本地索引）
    → 定期上传到对象存储
  Querier → 从对象存储下载 BoltDB 快照
    → 合并查询

优势：
  索引在本地（查询快）
  对象存储存原始数据（成本低）
  无需独立索引服务

劣势：
  查询需下载索引（冷启动慢）
  多节点索引一致性（最终一致）
```

### 17.3 存储配置示例

```yaml
# loki.yaml
storage_config:
  boltdb_shipper:
    active_index_directory: /loki/index
    cache_location: /loki/cache
    shared_store: s3

  aws:
    s3: s3://access_key:secret_key@endpoint/bucket-name
    s3forcepathstyle: true

  filesystem:
    directory: /loki/chunks

chunk_store_config:
  chunk_cache_config:
    embedded_cache:
      enabled: true
      max_size_mb: 100

schema_config:
  configs:
  - from: "2024-01-01"
    store: boltdb-shipper
    object_store: s3
    schema: v11
    index:
      prefix: index_
      period: 24h
```

---

## 十八、Loki Ruler 告警

### 18.1 告警规则配置

```yaml
# ruler.yaml
groups:
- name: error-alerts
  rules:
  - alert: HighErrorRate
    expr: sum(rate({app="order"} |= "ERROR" [5m])) > 10
    for: 5m
    labels:
      severity: critical
      team: backend
    annotations:
      summary: "订单服务错误率过高"
      description: "过去 5 分钟错误率 {{ $value }}/s"

  - alert: LogVolumeSpike
    expr: sum(rate({app="order"} [5m])) > 1000
    for: 3m
    labels:
      severity: warning
    annotations:
      summary: "日志量突增"
      description: "日志量 {{ $value }}/s，可能是异常"
```

### 18.2 告警通知路由

```
Loki Ruler → Alertmanager → 通知渠道
  ├── Slack（即时通知）
  ├── 钉钉（国内常用）
  ├── 邮件（正式记录）
  ├── PagerDuty（on-call）
  └── Webhook（自定义）

Alertmanager 路由：
  severity: critical → 即时通知（Slack/电话）
  severity: warning → 延迟通知（邮件）
  severity: info → 仅记录
```

---

## 十九、Loki 性能调优

### 19.1 写入优化

| 方向 | 优化 |
|------|------|
| 分布式部署 | Distributor/Ingester 水平扩容 |
| 压缩 | 启用 snappy 压缩 |
| 批量推送 | Promtail batch_size 调大 |
| 限流 | per_stream_rate_limit 限制高基数流 |
| 标签规范 | 避免高基数标签 |

### 19.2 查询优化

| 方向 | 优化 |
|------|------|
| 缓存 | 启用 chunk 缓存 + 索引缓存 |
| Querier 扩容 | 水平扩展 Querier |
| 查询范围 | 限制最大查询时间范围 |
| 标签基数 | 降低标签基数 |
| 并行查询 | 开启并行查询（querier.parallelise_shardable_queries） |

### 19.3 容量规划

```
存储估算：
  日增量 × 压缩比 ≈ 实际存储
  示例：100GB/天 × 0.25 = 25GB/天
  30 天 = 750GB

内存估算：
  Ingester：并发流数 × chunk 大小
  Querier：查询并发数 × 结果集大小
  Distributor：相对轻量

CPU 估算：
  写入：主要在 Ingester（压缩）
  查询：主要在 Querier（过滤/聚合）
```

### 19.4 常见性能问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 写入延迟高 | Ingester 瓶颈 | 扩容 Ingester / 降低写入速率 |
| 查询超时 | 大范围查询 | 缩小时间范围 / 增加标签过滤 |
| 内存 OOM | 高基数标签 / 大查询 | 限制标签基数 / 查询超时设置 |
| Chunk 碎片 | 小 Stream 多 | 合并小 Chunk / 调整 chunk 参数 |
| 对象存储延迟 | 网络/存储性能 | 使用 SSD / 就近部署 |

---

## 十一、与其他板块的关系

- 日志体系整体见「[ELK 日志体系](./ELK日志体系.md)」；
- 采集传输见「[日志采集与传输](./日志采集与传输.md)」；
- 监控指标见「[Prometheus 与 Grafana 监控](./Prometheus与Grafana监控.md)」；
- 统一可观测性见「[OpenTelemetry](./OpenTelemetry.md)」与「[SRE与稳定性工程/02-可观测性与稳定性看护](../../SRE与稳定性工程/02-可观测性与稳定性看护.md)」。

> 一句话：**Loki = 只索引标签（省成本）+ 对象存储冷热分层 + LogQL（标签选择器 → 内容过滤 → 聚合指标）+ Promtail 采集 + Ruler 告警——生产三守则：标签低基数、chunk 合理大小、查询范围可控**。