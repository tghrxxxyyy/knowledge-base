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

### 2.3 主题（Subject）设计深入

```
主题层级：用 "." 分隔（域名.服务.事件）
  示例：orders.eu.paid / iot.device.123.temp / system.metrics.cpu

通配符：
  *：匹配一层（orders.*.paid）
  >：匹配剩余所有层（orders.> 匹配 orders. 下所有）

队列组（Queue Group）：
  多个订阅者同主题同队列名 → 消息分摊（round-robin）
  → 横向扩展（消费者组）

请求应答（Request-Reply）：
  请求发到 "orders.get" + _INBOX.{reqID} 响应主题
  服务端监听请求主题 → 响应发回 _INBOX
  客户端自动匹配响应（timeout 处理）
  → 天然的 RPC 消息实现（带超时/并发）

Subject 设计规范：
  <域>.<服务>.<动作/事件>（如 app.orders.created）
  避免混乱命名（可维护性 + 权限粒度）
```

### 2.4 性能为什么这么快

```
NATS 性能设计：
  纯内存路由（无磁盘 IO，核心 NATS）
  零拷贝优化（Go 高效网络栈）
  无锁/轻锁（原子操作 + 环形缓冲）
  单跳路由（主题匹配 → 直接投递）
  → 微秒级延迟（单机百万 msg/s 级别）

代价：
  默认不持久化（在线才收，重启丢）
  无复杂路由（无交换机/绑定）
  → 简单性换性能，JetStream 补持久化
```

### 2.5 JetStream 持久化（核心）

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

### 2.6 JetStream 深入（流与消费模型）

```
Stream（流）= 持久化消息日志：
  Retention：
    Limits：按 MaxAge/MaxBytes 保留（通用日志）
    Interest：所有订阅者消费完才删除（队列语义）
    WorkQueue：单消费者消费后删除（任务队列）
  Storage：
    File：落盘（生产必选）
    Memory：内存（超高速，重启丢）

Consumer（消费者）：
  Push 模式：服务端推送（长连接，低延迟）
  Pull 模式：客户端拉取（批量处理，可控性高）
  AckPolicy：
    Explicit（每条确认）→ 精确控制，Exactly-once 基础
    All（一批确认）
    None（不确认）
  MaxDeliver（最大投递次数）→ 超过进 DLQ

顺序与幂等：
  Stream 内按序（消息序列号）
  消费重放（从某个 seq 开始）→ 支持 Exactly-once 语义
  → 配合下游幂等（幂等键）
```

### 2.7 集群与容错

```
NATS Cluster（同一集群内自动互联 + 主题路由）
  ├── Raft 选主（JetStream 流复制）
  ├── Leaf Nodes（叶子节点：边缘/跨机房连接，不参与投票）
  └── 网关（Gateway）：跨集群主题互通（多数据中心）

集群拓扑：
  全连接集群（Cluster）：节点互相连接（主题全局路由）
  叶节点（Leaf）：单向连接上层（边缘/隔离区）
     → 设备数据 → 边缘 NATS → 中心集群（离线缓存）
  网关（Gateway）：跨集群连接（多数据中心/故障域隔离）

JetStream 复制：
  每个 Stream 有 N 个副本（Raft 组）
  写：Leader 确认（多数派）→ 强一致
  故障：Leader 切换 → 自动恢复
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

### 3.1 多租户（Accounts）深入

```
Accounts = 租户隔离机制：
  Global Account（默认）+ 自定义 Accounts（业务线）
  每个 Account 有独立命名空间（Subject 隔离）
  跨 Account 通信 → 需要显式导出/导入（权限控制）

用户认证：
  JWT 认证（用户凭据 = JWT 签名）
  NKEY（NATS 密钥，Ed25519）

典型配置：
  每个业务线一个 Account（隔离）
  Account 间桥接（Export/Import + 过滤）
  → 多租户安全隔离 + 权限最小化

```
```yaml
# NATS 配置示例（账号隔离 + JetStream）
server {
  jetstream { store_dir: "/data/jetstream" }
  authorization {
    admin: { users: [{ user: admin, password: "pw" }] }
    app1: {
      users: [{ user: app1user, password: "pw" }]
      permissions: {
        publish:   ["orders.>", "app1.>"]
        subscribe: ["app1.>", "orders.*.events"]
      }
    }
  }
  accounts: { admin: {...}, app1: {...} }
}
```

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

### 4.1 与 Kafka 的本质差异

```
NATS vs Kafka（同为"流"思想但路线不同）：
  Kafka：分区模型（Topic 分 Partition，顺序保证在分区内）
    → 全局有序需单分区（吞吐受限）
    → 高吞吐靠多分区（顺序丢失）
  NATS JetStream：Stream 内有序（单流有序）
    → 消费吞吐靠多 Consumer/队列组
    → 顺序保证更直观

Kafka 优势：生态最成熟（流处理/连接器/监控）
NATS 优势：轻（20MB vs 数 GB）、快（微秒 vs 毫秒）、简单

选择：
  大数据管道/流处理生态 → Kafka
  微服务通信/边缘/轻量场景 → NATS
  两者可共存（NATS 做服务通信，Kafka 做数据管道）
```

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

### 5.2 部署拓扑

```
单机：开发/小规模（无持久化风险？→ 开 JetStream）
集群：生产（3 节点 + JetStream File + Raft）
边缘：Leaf Node（设备区 → 中心集群）
多数据中心：Gateway（跨区容灾 + 故障域隔离）
K8s：NATS Operator（自动集群编排）
```

### 5.3 常见坑

- **核心 NATS 不持久化**：默认订阅者离线丢消息——需要持久化必须上 JetStream；
- **顺序保证有限**：多订阅者/多流并发下无全局顺序（接受「流内有序」）；
- **消费积压**：Pull Consumer 要设置 MaxWaiting/Ack 超时，防止积压无感知；
- **Subject 设计**：用 `域.服务.事件` 层级 + 通配符规划，别拍脑袋命名；
- **Stream 无限增长**：Retention/MaxAge 未配置 → 磁盘爆（必须设保留策略）；
- **Ack 语义误用**：Explicit 不确认 → 消息重复投递（下游需幂等）。

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
| 任务队列 | NATS JetStream（WorkQueue） | RabbitMQ |

### 6.1 决策树

```
延迟敏感/轻量/边缘 → NATS
需要持久化/流处理 → NATS + JetStream（轻量）或 Kafka（生态）
业务事务消息 → RabbitMQ/RocketMQ
云原生多租户大平台 → Pulsar
服务间调用 → NATS Request-Reply / gRPC
```

---

## 七、与其他板块的关系

- Kafka 对比见「[Kafka](./Kafka.md)」；
- Pulsar 对比见「[Apache Pulsar](./ApachePulsar.md)」；
- RabbitMQ 对比见「[RabbitMQ](./RabbitMQ.md)」；
- MQTT（IoT 协议）见「[MQTT 与消息 Broker](./MQTT与消息broker.md)」；
- 云上消息（SNS/SQS）见「[云上消息与集成生态](./云上消息与集成生态.md)」。

> 一句话：**NATS = 主题 Pub/Sub + Request-Reply + JetStream 持久化 + 原生多租户——「最简单」就是它的竞争力；选型先看「延迟与重量（微服务/边缘→NATS，管道→Kafka）」，再定「持久化（需要→JetStream：File + Raft + Explicit Ack）」，最后配「Accounts 认证 + 集群 3 节点 + Stream 保留策略 + 监控」**。