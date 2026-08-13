# NATS（云原生轻量消息系统 / JetStream 持久化）

> NATS 是 **CNCF 毕业的云原生消息系统**，以「**极轻量 + 极致简单 + 超低延迟（微秒级）**」著称。核心是**主题发布订阅 + 请求应答（微服务通信）**，JetStream 在其上补充持久化/流式能力。相比 Kafka（重、毫秒级、分区模型）、RabbitMQ（AMQP 重协议）、Pulsar（多租户重系统），NATS 以「**轻到嵌入边缘、快到微秒、简单到十分钟上手**」独树一帜。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 消息系统太重 | Kafka 部署运维成本高，小场景大材小用 |
| 延迟敏感 | 微服务间高频小消息需要微秒级延迟 |
| 边缘/受限环境 | IoT 网关/边缘设备内存小，跑不动 JVM 消息系统 |
| 请求应答 | 服务调用除了 RPC 还想用消息做 Request-Reply |
| 集群高可用 | 轻量系统也要多节点容错、跨集群路由 |

> 核心认知：**NATS = 「最简单可靠的消息系统」**——核心只有 Pub/Sub + Request/Reply，性能与简单性是第一设计原则；需要持久化时再加 JetStream。

---

## 二、核心原理

### 2.1 架构

```
Publisher → NATS Server（核心路由）
  ├── 主题（Subject）通配符：orders.*  / orders.eu.>
  ├── 订阅者（NATS 默认瞬时订阅，在线才收到）
  └── 请求应答（Request-Reply：响应队列自动配对）

JetStream（流引擎，附加持久化）
  ├── Stream（持久化日志，类似 Kafka topic）
  ├── Consumer（消费游标，推/拉两种模式）
  └── 与核心 NATS 同集群，动态添加（nats-streaming 已并入）
```

### 2.2 三种通信模式

| 模式 | 说明 | 场景 |
|------|------|------|
| Pub/Sub | 主题发布订阅（无持久化，在线即收） | 事件广播/指标推送 |
| Request-Reply | 请求响应自动关联（`_INBOX.xxx` 临时主题） | 微服务调用/健康检查 |
| Queue Group | 队列组：同主题订阅者分摊消息（负载均衡） | 任务分发/横向扩展 |

**选型关注点**：NATS 原生把「服务发现 + 调用 + 广播」统一在消息模型里——边缘/云原生服务通信首选。

### 2.3 JetStream 持久化（核心）

```
Stream 配置：
  ├── Retention：Limit（按量）/ Interest（按订阅者）/ WorkQueue（工作队列）
  ├── Replicas：1/3/5（Raft 复制）
  ├── Storage：File（磁盘）/ Memory
  └── MaxAge/MaxBytes：消息保留策略

Consumer：
  ├── Push（推送）/ Pull（拉取，适合批量消费）
  ├── AckPolicy：Explicit/None/All（Exactly-once 语义基础）
  └── MaxDeliver + 死信（DLQ）
```

**选型关注点**：JetStream 解决了「核心 NATS 不持久化」的短板——消息中间「新」的一极：轻量但有流式能力。

### 2.4 集群与容错

```
NATS Cluster（同一集群内自动互联 + 主题路由）
  ├── Raft 选主（JetStream 流复制）
  ├── Leaf Nodes（叶子节点：边缘/跨机房连接，不参与投票）
  └── 网关（Gateway）：跨集群主题互通（多数据中心）
```

---

## 三、核心特性

| 特性 | 说明 |
|------|------|
| 极致性能 | 微秒级延迟，百万级消息/秒 |
| 极简 | 单二进制 ~20MB，无外部依赖，几分钟部署 |
| 多语言 | Go/Java/Node/Python/C#/Rust 等 30+ 客户端 |
| 请求应答 | 原生 Request-Reply（服务调用） |
| JetStream | 持久化/流式/工作队列/Exactly-once 语义 |
| 多租户/权限 | Accounts + Users + JWT 认证（原生多租户） |
| 边缘友好 | Leaf Node 模式，弱网/离线重连 |
| 可观测 | 内置监控端点 + Prometheus 指标 |
| 部署形态 | 单机/集群/K8s（NATS Operator）/边缘 |

---

## 四、NATS vs Kafka vs RabbitMQ vs Pulsar

| 维度 | NATS | Kafka | RabbitMQ | Pulsar |
|------|------|-------|----------|--------|
| 定位 | 轻量消息/服务通信 | 高吞吐流平台 | 业务消息 | 云原生流+队列 |
| 延迟 | 微秒 | 毫秒 | 毫秒 | 毫秒 |
| 吞吐 | 高 | 最高 | 中 | 最高 |
| 持久化 | JetStream（可选） | 强（磁盘日志） | 强 | 强（分层存储） |
| 消费模型 | Push/Pull | 分区游标 | 队列/交换机 | 订阅/游标 |
| 顺序保证 | 流内有序 | 分区内有序 | 队列有序 | 分区内有序 |
| 运维成本 | 最低 | 高（ZK/KRaft） | 中 | 高 |
| 多租户 | 原生（Accounts） | 弱 | 弱 | 原生（强） |
| 适用 | 边缘/微服务/实时 | 日志/管道/流处理 | 业务解耦 | 云原生多租户 |

**选型关注点**：
- 微服务通信/边缘/IoT/超低延迟 → **NATS**；
- 日志管道/大数据流 → **Kafka**；
- 业务可靠消息 → **RabbitMQ/RocketMQ**；
- 云原生多租户大平台 → **Pulsar**。

---

## 五、生产实践

### 5.1 关键配置

| 配置 | 建议 |
|------|------|
| Accounts | 生产必开（隔离 + JWT 认证） |
| JetStream 存储 | File（生产）、Replicas≥3（重要流） |
| Ack 策略 | 关键业务 Explicit Ack + DLQ |
| 连接 | 客户端必须配重连/退避（Leaf Node 弱网） |
| 监控 | 内置 `nats top` + Prometheus exporter |
| 集群 | 奇数节点（3/5），Raft 选举 |

### 5.2 常见坑

- **核心 NATS 不持久化**：默认订阅者离线丢消息——需要持久化必须上 JetStream；
- **顺序保证有限**：多订阅者/多流并发下无全局顺序（接受「流内有序」）；
- **消费积压**：Pull Consumer 要设置 MaxWaiting/Ack 超时，防止积压无感知；
- **Subject 设计**：用 `域.服务.事件` 层级 + 通配符规划，别拍脑袋命名。

---

## 六、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 微服务通信（RPC 式） | NATS | gRPC |
| 边缘/IoT 轻量消息 | NATS | MQTT/EMQX |
| 日志管道/大数据 | Kafka | Pulsar |
| 业务可靠消息 | RabbitMQ/RocketMQ | NATS JetStream |
| 云原生多租户 | Pulsar | NATS |
| 请求应答 | NATS Request-Reply | gRPC |

---

## 七、与其他板块的关系

- Kafka 对比见「[Kafka](./Kafka.md)」；
- Pulsar 对比见「[Apache Pulsar](./ApachePulsar.md)」；
- RabbitMQ 对比见「[RabbitMQ](./RabbitMQ.md)」；
- MQTT（IoT 协议）见「[MQTT 与消息 Broker](./MQTT与消息broker.md)」；
- 云上消息（SNS/SQS）见「[云上消息与集成生态](./云上消息与集成生态.md)」。

> 一句话：**NATS = 主题 Pub/Sub + Request-Reply + JetStream 持久化 + 原生多租户——「最简单」就是它的竞争力；选型先看「延迟与重量（微服务/边缘→NATS，管道→Kafka）」，再定「持久化（需要→JetStream）」，最后配「Accounts 认证 + 集群 3 节点 + 监控」**。
