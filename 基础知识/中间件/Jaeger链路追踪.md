# Jaeger（分布式链路追踪 / 云原生追踪）

> Jaeger 是 CNCF 毕业的**分布式链路追踪系统**，源自 Uber 开源，以「分布式上下文传播 + 采样 + 存储 + 可视化」成为云原生追踪事实标准（OpenTelemetry 后端）。相比 Zipkin（轻量但功能少）、SkyWalking（APM 全栈但重），Jaeger 以**专注追踪 + OpenTelemetry 原生支持**独树一帜。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 调用链看不清 | 请求经过 10 个服务，哪个慢？哪个错？ |
| 上下文传播 | 跨进程/跨线程/跨 MQ 如何串联？ |
| 采样难题 | 全量追踪存储成本高，不采样找不到问题 |
| 与 OpenTelemetry 集成 | OTel 已成为事实标准，追踪后端需原生支持 |
| 性能归因 | 延迟高，哪个环节是瓶颈？ |
| 错误定位 | 报错信息分散在多个服务，如何串联？ |
| 依赖分析 | 服务间调用关系复杂，如何可视化？ |

> 核心认知：**Jaeger = OpenTelemetry 原生后端**——OTel 采集的 trace 直接写 Jaeger，无需额外转换。

---

## 二、Jaeger 核心原理

### 2.1 架构

```
应用（OpenTelemetry SDK 埋点）
  ├── OTLP（OpenTelemetry Protocol）
  ├── Jaeger Thrift（兼容旧版）
  └── Zipkin Thrift（兼容 Zipkin）

Jaeger Agent（可选，边车/SDK 内嵌）
  ├── 接收 trace
  ├── 批量转发到 Collector
  └── 采样策略下发

Jaeger Collector（收集器）
  ├── 接收 trace（gRPC/HTTP）
  ├── 预处理（校验/丰富/采样）
  └── 写入存储

Jaeger Query（查询服务）
  ├── 查询 trace（按 traceID/服务/操作/标签）
  └── UI（依赖图/时间线/对比）

存储后端
  ├── Cassandra（大规模）
  ├── Elasticsearch（推荐，与日志联动）
  ├── Kafka（缓冲，异步写入存储）
  ├── ClickHouse（高性能分析）
  └── 内存（开发测试）
```

### 2.2 核心概念

| 概念 | 说明 |
|------|------|
| Trace | 一次完整请求的调用链（由 Span 组成） |
| Span | 调用链中的一个工作单元（一次 RPC/一次 DB 查询） |
| Span Context | 上下文（traceID/spanID/父 spanID/采样标志） |
| Tag | Span 的标签（KV 对，用于查询） |
| Log | Span 的时间线日志（事件+时间戳） |
| Baggage | 跨 Span 的 KV 上下文（类似 HTTP Header 传播） |
| Reference | Span 间关系（ChildOf / FollowsFrom） |

### 2.3 上下文传播（W3C Trace Context）

```
请求方 → traceparent: 00-{traceID}-{spanID}-01
       → tracestate: 自定义状态

接收方 → 解析 traceparent → 提取 traceID
       → 创建新 span，parentSpanID = 上游 spanID
       → 生成新的 traceparent 传给下游
```

**选型关注点**：W3C Trace Context 是事实标准，保证跨语言/跨系统的上下文传播兼容。

### 2.4 采样策略

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| Head-based（头部采样） | 在入口决定采样，整条链一致 | 高吞吐（默认） |
| Tail-based（尾部采样） | 在尾部决定采样（先收再筛选） | 找慢请求/错误请求 |
| 概率采样 | 按比例（如 1%）随机采样 | 通用 |
| 限速采样 | 每秒最多 N 个 trace | 限流保护 |
| 属性采样 | 按属性（如错误=全部采样） | 错误优先 |
| 远程采样 | 从 Jaeger Agent 动态获取采样策略 | 灵活调整 |

**选型关注点**：高吞吐场景 → Head-based 概率采样；想找慢请求/错误 → Tail-based（Jaeger 支持）。

### 2.5 存储选型

| 存储 | 优势 | 劣势 | 适用场景 |
|------|------|------|----------|
| Cassandra | 高写入吞吐、线性扩展 | 运维复杂 | 大规模生产 |
| Elasticsearch | 丰富查询、与日志联动 | 资源消耗大 | 中大规模、日志联动 |
| ClickHouse | 高压缩、高查询性能 | 生态较新 | 高性能分析 |
| Kafka | 异步缓冲、削峰 | 需二次消费 | 高吞吐写入 |
| Memory | 最快 | 重启丢失 | 开发测试 |

---

## 三、Jaeger vs Zipkin vs SkyWalking

| 维度 | Jaeger | Zipkin | SkyWalking |
|------|--------|--------|------------|
| CNCF 状态 | 毕业项目 | 孵化中 | Apache 顶级 |
| 定位 | 专注追踪 | 轻量追踪 | APM 全栈（指标+日志+追踪） |
| 采集协议 | OTLP 原生 | Zipkin Thrift | 自有探针（字节码增强） |
| 语言支持 | 多语言（OTel SDK） | 多语言 | Java/.NET/Node/Go/PHP 等 |
| 存储 | ES/Cassandra/Kafka/ClickHouse | ES/Cassandra/内存 | ES/H2/MySQL/TiDB |
| 性能损耗 | 低（OTel SDK） | 低 | 中（字节码增强） |
| 无侵入 | 需 SDK 埋点 | 需 SDK 埋点 | Java 字节码增强（无侵入） |
| 指标 | 无（需配 Prometheus） | 无 | 有（内置） |
| 日志 | 无（配 ELK/Loki） | 无 | 有 |
| 拓扑图 | 有 | 有 | 有 |
| 告警 | 无（需配 Alertmanager） | 无 | 有 |
| 采样 | Head/Tail-based | Head-based | 固定比例 |

**选型关注点**：
- 云原生 + OpenTelemetry → **Jaeger**（OTel 原生后端）
- 轻量 + 快速上手 → **Zipkin**
- Java 生态 + 无侵入 + 全栈 APM → **SkyWalking**
- 混合语言栈 → **Jaeger**（OTel 多语言 SDK 最全）

---

## 四、OpenTelemetry + Jaeger（事实标准组合）

```
应用代码（Java/Go/Python/Node...）
  ├── OpenTelemetry SDK（自动埋点：HTTP/gRPC/DB/MQ）
  ├── OTel Collector（接收/处理/导出）
  │   ├── 接收：OTLP/Jaeger/Zipkin/Prometheus
  │   ├── 处理：采样/过滤/丰富/批量
  │   └── 导出：Jaeger/Prometheus/云厂商
  └── Jaeger（存储/查询/可视化）
```

**选型关注点**：OpenTelemetry 是可观测性的事实标准（采集层），Jaeger 是追踪后端之一。OTel Collector + Jaeger 是云原生追踪推荐组合。

---

## 五、Jaeger 生产部署

### 5.1 部署模式

| 模式 | 说明 |
|------|------|
| All-in-One | 二进制包含全部（开发测试） |
| 生产部署 | Collector + Query + ES/Cassandra |
| Kubernetes | Jaeger Operator（CRD 管理） |
| 托管服务 | AWS X-Ray / GCP Cloud Trace（非 Jaeger 但同功能） |

### 5.2 关键配置

| 配置 | 说明 |
|------|------|
| 采样率 | 生产通常 1%~10% |
| 存储 | ES 推荐（与日志联动查询） |
| 索引 | 按天滚动索引（便于清理） |
| 缓存 | Query 层缓存热点 trace |
| 安全 | TLS + 认证（生产必备） |

---

## 六、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 云原生追踪 | Jaeger + OTel | Zipkin |
| Java 无侵入 APM | SkyWalking | — |
| 轻量追踪 | Zipkin | Jaeger |
| 多云统一追踪 | Jaeger + OTel | Datadog APM |
| 与日志联动 | Jaeger + ELK/Loki | SkyWalking |
| 找慢请求 | Jaeger（Tail-based） | — |
| 错误追踪 | Jaeger + Alertmanager | — |

---

## Jaeger Agent/Collector/Query Architecture

### Agent 架构

```
Jaeger Agent = 边车/SDK 内嵌组件

部署模式：
  1. Sidecar 模式（K8s 每 Pod 一个 Agent）
  2. DaemonSet 模式（每节点一个 Agent）
  3. SDK 内嵌（应用内嵌 Agent）

功能：
  接收 SDK 发送的 Span（UDP/HTTP）
  本地批量聚合（减少网络开销）
  异步转发到 Collector
  采样策略下发（Remote Sampling）

配置：
  agent:
    collector:
      host: jaeger-collector
      port: 14267  # HTTP
      port_grpc: 14250  # gRPC
    sampling:
      server_url: http://jaeger-collector:5778
```

### Collector 架构

```
Jaeger Collector = 收集器（接收/处理/存储）

组件：
  ├── Receiver（接收 Span）
  │   ├── Jaeger Thrift Receiver
  │   ├── Zipkin Thrift Receiver
  │   └── OTLP Receiver（推荐）
  │
  ├── Processor（处理）
  │   ├── 采样判断（按策略决定是否存储）
  │   ├── Span 验证（校验 traceID/spanID）
  │   └── 丰富（添加 Pod/Node 信息）
  │
  └── Writer（写入存储）
      ├── Cassandra Writer
      ├── Elasticsearch Writer
      └── Kafka Writer（异步缓冲）

水平扩展：
  Collector 无状态 → 多实例水平扩展
  每个实例独立处理 → 无协调开销

配置：
  collector:
    num_workers: 50  # 处理线程数
    otel:
      exporter:
        endpoint: jaeger-collector:4317  # OTLP gRPC
```

### Query 架构

```
Jaeger Query = 查询服务

组件：
  ├── API Server（REST API）
  │   GET /api/traces/{traceID}
  │   GET /api/traces?service=xxx&operation=xxx
  │
  ├── 依赖图（Service Dependency Graph）
  │   基于 Span 统计 → 生成服务间调用关系图
  │
  └── UI（React 前端）
      Trace Timeline（时间线视图）
      Trace Comparison（对比视图）
      Service Dependency（依赖图）

性能优化：
  Query 缓存（热点 Trace）
  读写分离（Query 只读副本）
  索引优化（按时间/服务/操作建索引）
```

## Jaeger Sampling Strategies Deep

### 概率采样

```json
{
  "service_1": {
    "default_strategy": {
      "type": "probabilistic",
      "param": 0.01  // 1% 采样率
    },
    "operation_1": {
      "type": "probabilistic",
      "param": 1.0   // 100% 采样（关键接口）
    }
  }
}
```

### 限速采样

```json
{
  "service_1": {
    "default_strategy": {
      "type": "rateLimiting",
      "param": 100  // 每秒最多 100 个 trace
    }
  }
}
```

### 远程采样

```
远程采样 = Agent 从 Collector 动态获取采样策略

流程：
  1. Collector 暴露 /sampling API
  2. Agent 定时拉取采样策略
  3. Agent 应用策略到本地

优势：
  动态调整采样率（无需重启）
  按服务/操作配置不同采样率
  
配置：
  agent:
    sampling:
      server_url: http://jaeger-collector:5778
      refresh_interval: 60s
```

## Jaeger OpenTelemetry Integration

```
OpenTelemetry + Jaeger = 云原生追踪标准

架构：
  App → OTel SDK → OTLP → OTel Collector → Jaeger

OTel Collector 配置：
  receivers:
    otlp:
      protocols:
        grpc:
          endpoint: 0.0.0.0:4317
        http:
          endpoint: 0.0.0.0:4318
  
  processors:
    batch:
      timeout: 5s
      send_batch_size: 1000
    memory_limiter:
      limit_mib: 512
      spike_limit_mib: 128
  
  exporters:
    jaeger:
      endpoint: jaeger-collector:14250
      tls:
        insecure: true

部署（K8s）：
  OTel Collector DaemonSet → 接收所有 Pod 的 OTLP
  → 处理（采样/批量）→ 导出到 Jaeger
```

## Jaeger in Kubernetes

```yaml
# Jaeger Operator 部署
apiVersion: jaegertracing.io/v1
kind: Jaeger
metadata:
  name: production
spec:
  strategy: production
  collector:
    replicas: 3
    resources:
      limits:
        memory: 2Gi
        cpu: "1"
  storage:
    type: elasticsearch
    options:
      es:
        server-urls: http://elasticsearch:9200
        index-prefix: jaeger
  query:
    replicas: 2
    options:
      query:
        base-path: /jaeger
  agent:
    strategy: DaemonSet  # 每节点一个 Agent
```

## Jaeger vs Zipkin vs Tempo

| 维度 | Jaeger | Zipkin | Tempo |
|------|--------|--------|-------|
| CNCF 状态 | 毕业 | 无 | 孵化 |
| 定位 | 追踪后端 | 追踪后端 | 追踪后端 |
| 采集协议 | OTLP/Zipkin | Zipkin | OTLP |
| 存储 | ES/Cassandra/Kafka | ES/Cassandra/内存 | 对象存储（S3） |
| 成本 | 中 | 低 | 最低（对象存储） |
| 查询 | 强（依赖图） | 中 | 中（TraceQL） |
| 日志关联 | 需配置 | 需配置 | 原生（Loki） |
| 适用 | 云原生追踪 | 轻量追踪 | Grafana 生态 |

## Jaeger Storage Backends Deep

### Cassandra 存储

```
Cassandra 存储配置：
  SPAN_STORAGE_TYPE=cassandra
  CASSANDRA_SERVERS=cassandra:9042
  CASSANDRA_KEYSPACE=jaeger
  CASSANDRA一致性=LOCAL_QUORUM
  
  表结构：
    traces (trace_id, span)
    service_name_index (service_name, trace_id, span_id)
    operation_name_index (operation_name, trace_id)
    
优势：
  写入吞吐高
  线性扩展
  适合大规模生产
```

### Elasticsearch 存储

```
ES 存储配置：
  SPAN_STORAGE_TYPE=elasticsearch
  ES_SERVER_URLS=http://elasticsearch:9200
  ES_INDEX_PREFIX=jaeger
  ES_INDEX_SHARDS=5
  ES_INDEX_REPLICAS=1
  
索引策略：
  按天滚动索引：jaeger-span-2024-01-01
  ILM 策略：热→温→冷→删除
  
查询优化：
  按服务+操作建索引
  按时间范围查询（跳过无关索引）
```

## Jaeger Data Model

```
Jaeger 数据模型：

Trace:
  traceId: 128-bit 唯一标识
  spans: [Span 列表]
  processes: [Process 信息]

Span:
  spanId: 64-bit 唯一标识
  parentSpanId: 父 Span（可选）
  operationName: 操作名
  startTime: 开始时间（微秒）
  duration: 持续时间（微秒）
  tags: {key: value} 标签
  logs: [{timestamp, fields}] 时间线日志
  references: [Span 引用关系]

Process:
  serviceName: 服务名
  tags: {host, ip, version...}

存储格式：
  JSON（ES）/ 二进制（Cassandra）
```

## Jaeger Dependency Graph

```
依赖图生成：

数据源：Span 的 parentSpanID → 调用关系
  Service A (Client) → Service B (Server)
  → 统计调用次数、延迟、错误率

生成流程：
  1. Collector 收集所有 Span
  2. 按 service + operation 聚合
  3. 构建有向图（A → B 权重=调用次数）
  4. Query API 暴露给 UI

查询：
  GET /api/dependencies?startTs=xxx&endTs=xxx
  
UI 展示：
  节点 = 服务
  边 = 调用关系（粗细=调用次数）
  颜色 = 错误率
```

## Jaeger Rollup Metrics

```
Jaeger 指标（Prometheus）：

Collector 指标：
  jaeger_collector_spans_received_total      # 收到的 Span 数
  jaeger_collector_spans_dropped_total       # 丢弃的 Span 数
  jaeger_collector_spans_saved_by_service    # 按服务统计
  jaeger_collector_batch_size                # 批量大小
  jaeger_collector_queue_size                # 队列大小

Query 指标：
  jaeger_query_latency_seconds              # 查询延迟
  jaeger_query_requests_total               # 查询请求数
  jaeger_query_traces_total                 # 查询的 Trace 数

存储指标：
  jaeger_storage_operations_total           # 存储操作数
  jaeger_storage_errors_total               # 存储错误数

告警规则：
  - jaeger_collector_spans_dropped_total > 0  → 存储过载
  - jaeger_query_latency_seconds > 5          → 查询慢
  - jaeger_collector_queue_size > 10000       → 队列积压
```

## 六-2、Jaeger Remote Sampling 配置实例

```json
{
  "service_1": {
    "default_strategy": {
      "type": "probabilistic",
      "param": 0.01
    },
    "operation_get": {
      "type": "probabilistic",
      "param": 1.0
    }
  },
  "service_2": {
    "default_strategy": {
      "type": "rateLimiting",
      "param": 50
    }
  }
}
```

```
远程采样流程：
  1. Collector 暴露 /sampling 端点
  2. Agent 定时拉取采样策略（refresh_interval=60s）
  3. Agent 应用策略到本地 SDK
  4. SDK 按策略决定是否采样

优势：
  动态调整采样率（无需重启应用）
  按服务/操作配置不同采样率
  集中管理采样策略
```

## 六-3、Span 树可视化分析方法

```
Span 树分析方法：

1. 时间线视图（Timeline）
   - 纵轴：服务/操作
   - 横轴：时间
   - 每个 Span 是一个条形
   - 宽度 = 持续时间
   - 关键：找最宽的 Span（瓶颈）

2. 依赖图（Dependency Graph）
   - 节点 = 服务
   - 边 = 调用关系
   - 颜色 = 错误率
   - 粗细 = 调用量
   - 关键：找红色/粗边（高错误/高流量）

3. 对比视图（Comparison）
   - 两个 Trace 并排对比
   - 找差异点（哪个 Span 慢/错）
   - 关键：排查回归问题

4. 瀑布图（Waterfall）
   - 展示父子 Span 关系
   - 嵌套深度 = 调用链深度
   - 关键：找深层嵌套（不合理调用）
```

## 六-4、Jaeger Query API 查询参数详解

```
GET /api/traces/{traceID}          # 按 traceID 查询
GET /api/traces?service=xxx        # 按服务查询
GET /api/traces?operation=xxx      # 按操作查询
GET /api/traces?tags=xxx           # 按标签过滤
GET /api/traces?start=xxx&end=xxx  # 按时间范围查询
GET /api/traces?limit=100          # 限制返回数

查询示例：
  # 查找 service=user-service 的慢请求（>1s）
  GET /api/traces?service=user-service&minDuration=1000000&limit=50

  # 查找包含错误的 Trace
  GET /api/traces?service=user-service&tags={"error":"true"}

  # 查找特定时间范围
  GET /api/traces?service=user-service&start=1700000000000000&end=1700001000000000

性能优化：
  索引：按服务+操作+时间建索引
  限制：默认 limit=20，避免大查询
  缓存：热点 Trace 缓存到 Query 层
```

## 六-5、Jaeger 与 Prometheus 指标关联（Span Metrics）

```
Span Metrics = 从 Trace 数据提取指标

指标类型：
  request_count：请求总数（按服务/操作）
  error_count：错误数
  latency_p50/p90/p99：延迟分位数

关联方式：
  1. Collector 提取 Span 指标 → 写入 Prometheus
  2. Grafana 可视化（Trace 与 Metric 联动）
  3. 告警规则：基于 Span 指标触发

Prometheus 配置：
  scrape_configs:
    - job_name: 'jaeger-collector'
      static_configs:
        - targets: ['jaeger-collector:14269']

告警规则示例：
  - alert: HighErrorRate
    expr: rate(jaeger_collector_spans_error_total[5m]) > 0.05
    for: 5m
    annotations:
      summary: "High error rate in {{ $labels.service }}"
```

## 六-6、大 trace 采样策略（尾采样）

```
Tail-based Sampling（尾部采样）：

原理：
  先全量采集所有 Span
  Trace 完成后分析（是否有错误/慢请求）
  满足条件才保留 Trace

条件：
  1. 任何 Span 有错误 → 保留
  2. 总延迟 > 阈值（如 1s）→ 保留
  3. 特定服务/操作 → 保留

优势：
  能捕获慢请求和错误请求
  Head-based 采样可能漏掉

劣势：
  需要全量采集（存储成本高）
  实现复杂（需要 Collector 协调）

Jaeger 实现：
  1. SDK 全量发送到 Collector
  2. Collector 缓存 Trace 所有 Span
  3. Trace 完成后判断是否保留
  4. 不保留则丢弃
```

## 六-7、Jaeger 横向扩展架构（Kafka 缓冲层）

```
Jaeger 横向扩展架构：

架构：
  App → OTel SDK → Collector → Kafka（缓冲）→ Consumer → Storage

为什么用 Kafka 缓冲：
  1. 削峰：高吞吐写入时 Collector 不过载
  2. 解耦：Collector 和 Storage 独立扩缩
  3. 可靠性：Kafka 持久化防丢
  4. 异步：写入不阻塞 Collector

配置：
  Collector:
    kafka.producer.brokers: kafka1:9092,kafka2:9092
    kafka.producer.topic: jaeger-spans
  
  Consumer:
    kafka.consumer.brokers: kafka1:9092,kafka2:9092
    kafka.consumer.topic: jaeger-spans

扩展：
  Collector：水平扩展（无状态）
  Kafka：增加 Partition 提升吞吐
  Consumer：按 Partition 消费，水平扩展
  Storage：ES/Cassandra 水平扩展
```

## 七、与其他板块的关系

- 链路追踪原理（SkyWalking）见「[链路追踪 SkyWalking](./链路追踪SkyWalking.md)」；
- 可观测性三支柱见「[云上可观测性体系](./云上可观测性体系.md)」；
- 云原生可观测性见「[云原生/可观测性](../../云原生/可观测性.md)」；
- 监控告警见「[Prometheus + Grafana](./Prometheus与Grafana监控.md)」。

---

## 六、Jaeger 生产配置清单

### 6.1 采样策略配置

```yaml
# 采样策略（可远程动态调整）
{
  "service_1": {
    "default_strategy": {
      "type": "probabilistic",
      "param": 0.01
    },
    "operation_1": {
      "type": "probabilistic",
      "param": 1.0
    }
  }
}
```

### 6.2 存储配置

```yaml
# ES 存储配置
SPAN_STORAGE_TYPE=elasticsearch
ES_SERVER_URLS=http://elasticsearch:9200
ES_INDEX_SHARDS=5
ES_INDEX_REPLICAS=1
ES_NUM_SHARDS=5

# 采样配置
SAMPLING_STRATEGIES_FILE=/etc/jaeger/sampling.json
```

### 6.3 监控指标

```
Jaeger 指标（Prometheus）：
  jaeger_collector_spans_received_total
  jaeger_collector_spans_dropped_total
  jaeger_collector_spans_saved_by_service_total
  jaeger_query_latency_seconds
  jaeger_query_requests_total
```

### 6.4 常见问题排查

| 问题 | 原因 | 解决 |
|------|------|------|
| Trace 不完整 | 采样率太低 | 提高采样率 |
| Trace 丢失 | Collector 过载 | 扩容 Collector |
| 查询慢 | ES 索引不合理 | 优化索引/分片 |
| 延迟高 | SDK 性能问题 | 检查 SDK 配置 |

---

## 七、Jaeger SDK 埋点示例

### 7.1 Python 埋点

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.jaeger.thrift import JaegerExporter

# 配置
provider = TracerProvider()
jaeger_exporter = JaegerExporter(
    agent_host_name="localhost",
    agent_port=6831,
)
provider.add_span_processor(BatchSpanProcessor(jaeger_exporter))
trace.set_tracer_provider(provider)

# 埋点
tracer = trace.get_tracer(__name__)
with tracer.start_as_current_span("my_operation") as span:
    span.set_attribute("key", "value")
    # 业务逻辑
```

### 7.2 Java 埋点

```java
import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;

Tracer tracer = GlobalOpenTelemetry.getTracer("my-service");
Span span = tracer.spanBuilder("my-operation").startSpan();
try {
    span.setAttribute("key", "value");
    // 业务逻辑
} finally {
    span.end();
}
```

### 7.3 Go 埋点

```go
import "go.opentelemetry.io/otel"

tracer := otel.Tracer("my-service")
ctx, span := tracer.Start(ctx, "my-operation")
defer span.End()

span.SetAttributes(attribute.String("key", "value"))
```

---

## 八、Jaeger 常见问题排查清单

| 检查项 | 命令/方法 |
|--------|-----------|
| Collector 是否正常 | `curl http://jaeger-collector:14269/` |
| Query 是否正常 | `curl http://jaeger-query:16687/` |
| ES 连接是否正常 | `curl http://elasticsearch:9200/_cluster/health` |
| 采样策略是否生效 | 检查 `/sampling` 端点 |
| Agent 是否收到 trace | 查看 Agent 日志 |

---

> 一句话：**Jaeger = OpenTelemetry 原生后端 + W3C Trace Context 传播 + 灵活采样（Head/Tail-based）+ ES/Cassandra/ClickHouse 存储；选型先看「生态（云原生→Jaeger，Java→SkyWalking）」，再定「采样策略（高吞吐→概率采样，找问题→Tail-based）」**。
