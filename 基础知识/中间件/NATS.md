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

## NATS Core Pub/Sub

### 核心发布订阅

```
NATS 核心 Pub/Sub = 纯内存路由，微秒级延迟

发布：
  nc.publish("orders.paid", []byte(`{"order_id": 123}`))

订阅：
  nc.Subscribe("orders.paid", func(msg *nats.Msg) {
      fmt.Printf("Received: %s\n", string(msg.Data))
  })

通配符：
  *：匹配一层
    orders.*.paid → orders.us.paid, orders.eu.paid
  >：匹配剩余所有层
    orders.> → orders.us.paid, orders.eu.received

队列组（Queue Group）：
  nc.QueueSubscribe("orders.paid", "workers", handler)
  多个订阅者同 queue name → 消息分摊（负载均衡）

特点：
  纯内存路由（无持久化）
  在线才收到（离线丢）
  微秒级延迟（百万 msg/s）
```

## NATS JetStream Persistence Deep

### Stream 深入

```
Stream = 持久化消息日志

创建 Stream：
  js.AddStream(&nats.StreamConfig{
      Name:     "ORDERS",
      Subjects: []string{"orders.>"},
      Storage:  nats.FileStorage,    // File 或 Memory
      Replicas: 3,                   // Raft 副本数
      Retention: nats.LimitsPolicy,  // 保留策略
      MaxAge:   24 * time.Hour,      // 最大保留时间
      MaxBytes: 1 << 30,            // 最大保留大小
      Discard:  nats.DiscardOld,    // 超限策略
  })

保留策略：
  LimitsPolicy：按 MaxAge/MaxBytes 保留（超限丢弃）
  InterestPolicy：所有消费者消费完才删除（队列语义）
  WorkQueue：单消费者消费后删除（任务队列）
```

### Consumer 深入

```
Consumer = 消费游标

Push Consumer（推送）：
  sub, _ := js.Subscribe("orders.>", func(msg *nats.Msg) {
      process(msg)
      msg.Ack()
  }, nats.Durable("worker1"))

Pull Consumer（拉取）：
  sub, _ := js.PullSubscribe("orders.>", "worker1")
  msgs, _ := sub.Fetch(10, nats.MaxWait(5*time.Second))
  for _, msg := range msgs {
      process(msg)
      msg.Ack()
  }

AckPolicy：
  Explicit：每条确认（精确控制）
  All：一批确认（高效）
  None：不确认（消息不重发）

MaxDeliver：最大投递次数
  超过 → 进入 Dead Letter Queue（DLQ）
```

## NATS Consumer Groups

### Pull Consumer Groups

```
Pull Consumer Groups = 消费者组（类似 Kafka Consumer Group）

创建：
  sub, _ := js.PullSubscribe("orders.>", "order-group")
  
每个消费者组内：
  多个 Consumer 实例分摊消息
  每条消息只被一个实例消费

与 Kafka Consumer Group 对比：
  NATS：Pull Consumer 自动负载均衡
  Kafka：Partition 级别负载均衡

优势：
  消费者组内自动负载均衡
  支持动态扩缩容（增加 Consumer 实例）
  消费进度持久化（Stream offset）
```

### Push Consumer Groups

```
Push Consumer = 服务端推送到长连接

sub, _ := js.QueueSubscribe("orders.>", "workers", handler)

Queue Group：
  多个订阅者同 queue name
  消息 round-robin 分发
  
与 Pull 对比：
  Push：低延迟（服务端推送）
  Pull：可控性高（客户端拉取）

适用：
  Push：实时性要求高（事件处理）
  Pull：批量处理（可控吞吐）
```

## NATS Request-Reply Pattern

```
Request-Reply = NATS 原生 RPC 模式

请求方：
  msg, err := nc.Request("orders.get", []byte(`{"id":123}`), time.Second)
  if err != nil { ... }
  fmt.Println(string(msg.Data))

服务方：
  nc.Subscribe("orders.get", func(msg *nats.Msg) {
      // 处理请求
      result := process(msg.Data)
      msg.Respond(result)
  })

实现原理：
  请求方创建临时 Inbox（_INBOX.{reqID}）
  请求发到 orders.get + 响应主题
  服务方响应发回 Inbox
  客户端自动匹配（超时处理）

适用：
  微服务调用（替代 RPC）
  健康检查
  配置查询

对比 gRPC：
  NATS：消息模式，解耦更彻底
  gRPC：RPC 模式，接口契约更明确
```

## NATS Leaf Nodes

```
Leaf Nodes = 边缘节点（弱网/离线连接）

场景：
  IoT 网关 → 边缘 NATS（Leaf Node）
  → 中心集群（Hub）

架构：
  Hub Cluster（3节点）
    └── Leaf Node（边缘）
        ├── 本地 Pub/Sub（离线可用）
        └── 断线重连（缓存消息）

配置：
  leafnodes {
    remotes [
      { urls: ["nats://hub1:4222", "nats://hub2:4222"] }
    ]
  }

优势：
  边缘设备离线可用
  断线消息缓存（重新连接后补发）
  带宽优化（只同步必要消息）
```

## NATS Account Isolation

### Account 隔离

```
Accounts = 多租户隔离

配置：
  accounts {
    global { }
    
    app1 {
      users: [{user: app1, password: "pw"}]
      exports: [{subjects: ["app1.>"], type: stream}]
    }
    
    app2 {
      users: [{user: app2, password: "pw"}]
      imports: [{subject: "app1.>", account: app1}]
    }
  }

隔离规则：
  默认：Account 间完全隔离
  显式导出/导入：跨 Account 通信

安全：
  每个 Account 独立命名空间
  权限最小化（publish/subscribe 白名单）
  JWT 认证（用户凭据 = JWT 签名）
```

### JWT 认证

```yaml
# JWT 配置示例
authorization {
  account: app1
  users: [{
    user: app1user
    password: ""
    permissions: {
      publish: ["app1.>", "orders.*.events"]
      subscribe: ["app1.>", "orders.*.events"]
    }
  }]
}

# JWT Token 生成
nk -gen user -account app1 -name app1user > app1user.creds
```

## NATS vs Kafka vs RabbitMQ

| 维度 | NATS | Kafka | RabbitMQ |
|------|------|-------|----------|
| 定位 | 轻量消息/服务通信 | 高吞吐流平台 | 业务消息 |
| 延迟 | 微秒 | 毫秒 | 毫秒 |
| 吞吐 | 高 | 最高 | 中 |
| 持久化 | JetStream（可选） | 强（磁盘日志） | 强 |
| 顺序保证 | 流内有序 | 分区内有序 | 队列有序 |
| 运维成本 | 最低 | 高（ZK/KRaft） | 中 |
| 多租户 | 原生（Accounts） | 弱 | 弱 |
| 适用 | 边缘/微服务/实时 | 日志/管道/流处理 | 业务解耦 |

## NATS in Edge Computing

```
NATS 边缘计算场景：

架构：
  Edge Device → Edge NATS（Leaf Node）
    → 本地处理（Pub/Sub）
    → 断线缓存
    → 重连后同步到 Cloud

优势：
  极轻量（单二进制 ~20MB）
  内存占用小（适合边缘设备）
  离线可用（Leaf Node 本地路由）
  低延迟（微秒级）

场景：
  IoT 网关数据采集
  工业控制系统
  车联网 V2X
  边缘 AI 推理结果分发
```

## NATS Clustering Internals

```
NATS 集群内部机制：

Raft 选主：
  JetStream 流使用 Raft 共识
  Leader 处理写入 → 同步到 Follower
  多数派确认 → 写入成功

Gossip 协议：
  节点间状态同步（元数据/负载）
  心跳检测（防假死）
  新节点自动发现

主题路由：
  集群内主题全局路由
  订阅者在任意节点 → 消息路由到该节点

配置：
  cluster {
    name: my-cluster
    listen: 0.0.0.0:6222
    routes: [
      nats-route://node1:6222
      nats-route://node2:6222
      nats-route://node3:6222
    ]
  }
```

## NATS Security

```
NATS 安全机制：

1. TLS 加密
   tls {
     cert_file: "/path/to/server.crt"
     key_file: "/path/to/server.key"
     ca_file: "/path/to/ca.crt"
   }

2. 认证
   password: "secret"
   token: "my-secret-token"
   jwt: "/path/to/creds"  # JWT 认证

3. 授权
   authorization {
     user: admin
     password: "secret"
     permissions {
       publish: "orders.>"
       subscribe: "orders.>"
     }
   }

4. 账户隔离
   每个业务线一个 Account（隔离）
   跨 Account 通信需显式导出/导入
```

## 六-2、JetStream Stream 配置（retention/purge/max-bytes）

```
Stream 配置详解：

retention（保留策略）：
  Limits：按 MaxAge/MaxBytes 保留（超限丢弃）
  Interest：所有消费者消费完才删除（队列语义）
  WorkQueue：单消费者消费后删除（任务队列）

max_age：消息最大保留时间
  如 max_age: 24h → 超过 24h 的消息自动删除

max_bytes：消息最大保留大小
  如 max_bytes: 1GB → 超过 1GB 的消息自动删除

max_msgs：消息最大保留数量
  如 max_msgs: 1000000 → 超过 100 万条自动删除

purge（清理策略）：
  purge 时删除所有消息（不可恢复）
  可按 subject 清理：js.Stream.Purge("ORDERS", nats.PurgeSubject("orders.eu"))

配置示例：
  js.AddStream(&nats.StreamConfig{
      Name:     "ORDERS",
      Subjects: []string{"orders.>"},
      Retention: nats.LimitsPolicy,
      MaxAge:   24 * time.Hour,
      MaxBytes: 1 << 30,  // 1GB
      MaxMsgs:  1000000,
      Storage:  nats.FileStorage,
      Replicas: 3,
  })
```

## 六-3、消费者 AckPolicy（explicit/all/none）选择

| AckPolicy | 语义 | 适用场景 |
|-----------|------|----------|
| Explicit | 每条消息单独确认 | 精确控制（Exactly-once 基础） |
| All | 一批消息批量确认 | 高吞吐批量消费 |
| None | 不确认（消息不重发） | 幂等日志采集 |

```
Explicit Ack 流程：
  1. 消费者接收消息
  2. 处理消息
  3. 调用 msg.Ack() 确认
  4. Stream 删除已确认消息

All Ack 流程：
  1. 消费者批量拉取消息
  2. 处理所有消息
  3. 调用 sub.AckAll() 批量确认
  4. Stream 删除已确认消息

选择建议：
  关键业务 → Explicit（精确控制，防重复）
  批量处理 → All（高吞吐）
  日志采集 → None（允许丢失）
```

## 六-4、Request-Reply 超时与重试模式

```
Request-Reply 超时模式：

请求方：
  msg, err := nc.Request("orders.get", payload, 5*time.Second)
  if err != nil {
      // 超时处理
      if err == nats.ErrTimeout {
          // 重试或降级
      }
  }

重试模式：
  方式 1：指数退避重试
    for attempt := 0; attempt < 3; attempt++ {
        msg, err := nc.Request(subject, payload, timeout)
        if err == nil { break }
        time.Sleep(time.Duration(1<<attempt) * 100 * time.Millisecond)
    }

  方式 2：备用 Subject
    msg, err := nc.Request("orders.get", payload, timeout)
    if err != nil {
        msg, err = nc.Request("orders.get.backup", payload, timeout)
    }

超时设置：
  connect_timeout: 连接超时
  request_timeout: 请求超时
  ping_interval: 心跳间隔
```

## 六-5、Leaf Node 网络拓扑图

```
Leaf Node 网络拓扑：

中心集群（Hub Cluster）
  ├── Node1 ──── Node2
  │     │           │
  │     └─── Node3 ─┘
  │
  ├── Leaf Node A（边缘区域1）
  │   ├── 本地 Pub/Sub（离线可用）
  │   └── 断线重连（缓存消息）
  │
  └── Leaf Node B（边缘区域2）
      ├── 本地 Pub/Sub（离线可用）
      └── 断线重连（缓存消息）

连接方式：
  Hub Cluster：全连接（节点互相连接，主题全局路由）
  Leaf Node：单向连接 Hub（不参与投票）
  Gateway：跨集群连接（多数据中心）

数据流向：
  边缘设备 → Leaf Node → Hub Cluster
  Hub Cluster → Leaf Node → 边缘设备
```

## 六-6、NATS 在 K8s 上部署（nats-operator）

```yaml
# NATS Operator 部署
apiVersion: nats.io/v1alpha2
kind: NatsCluster
metadata:
  name: nats-cluster
spec:
  size: 3  # 集群节点数
  version: "2.10"
  pod:
    resources:
      requests:
        memory: "128Mi"
        cpu: "100m"
    nats:
      jetstream:
        enabled: true
        storage: 1Gi
  auth:
    clients:
      credentials:
        - name: app1
          password: "secret"
          account: app1
```

```
NATS Operator 功能：
  1. 自动创建 NATS 集群
  2. 自动扩缩容
  3. 滚动升级
  4. 健康检查
  5. JetStream 存储管理

部署步骤：
  1. 安装 Operator
     kubectl apply -f https://github.com/nats-io/nats-operator/releases/latest/download.yml

  2. 创建集群
     kubectl apply -f nats-cluster.yaml

  3. 验证
     kubectl get pods -l app=nats
     kubectl port-forward nats-cluster-0 4222:4222
```

## 六-7、NATS 账号隔离实战配置

```yaml
# NATS 账号隔离配置
authorization {
  accounts {
    # 全局账户
    global {}
    
    # 应用1账户
    app1 {
      users: [{user: app1user, password: "pw1"}]
      permissions: {
        publish: ["app1.>", "orders.*.events"]
        subscribe: ["app1.>", "orders.*.events"]
      }
    }
    
    # 应用2账户
    app2 {
      users: [{user: app2user, password: "pw2"}]
      permissions: {
        publish: ["app2.>"]
        subscribe: ["app2.>", "orders.*.events"]
      }
    }
  }
  
  # 跨账户通信
  import: {
    app1: [{subject: "app1.>"}]  # app2 可以订阅 app1 的消息
  }
}
```

```
隔离规则：
  1. 默认：Account 间完全隔离
  2. 显式导出/导入：跨 Account 通信
  3. 权限最小化：publish/subscribe 白名单

实战场景：
  团队隔离：每个业务线一个 Account
  环境隔离：dev/staging/prod 各一个 Account
  安全控制：敏感 Topic 只允许特定 Account 访问
```

## JetStream stream 配置

### retention/purge/max-bytes

```bash
# 创建 Stream
nats stream add EVENTS \
  --subjects="events.>" \
  --storage=file \
  --retention=limits \
  --max-msgs=1000000 \
  --max-bytes=10GB \
  --max-age=72h \
  --max-msg-size=1MB \
  --discard=old \
  --replicas=3

# 查看 Stream 信息
nats stream info EVENTS

# 手动清除过期消息
nats stream purge EVENTS --subject events.old
```

```text
Retention 策略：
  Limits：保留所有消息直到达到限制
  Interest：保留直到所有消费者确认
  WorkQueue：消息被消费后立即删除

Purge 模式：
  Age：按时间清除
  Size：按大小清除
  Count：按数量清除
  Subject：按主题清除
```

## 消费者 AckPolicy 选择与使用场景

| AckPolicy | 说明 | 适用场景 | 消息重复风险 |
|-----------|------|----------|--------------|
| Explicit | 显式确认 | 精确一次处理 | 低（需手动确认） |
| All | 启动时自动确认所有 | 批量消费 | 高（重启丢失） |
| None | 不确认 | 日志收集 | 无（投递即删除） |

```bash
# 创建消费者（Explicit）
nats consumer add EVENTS order-processor \
  --subject="events.order.>" \
  --ack-explicit \
  --max-deliver=5 \
  --ack-wait=30s \
  --backoff=1s,5s,30s

# 创建消费者（All）
nats consumer add EVENTS log-processor \
  --subject="events.>" \
  --ack-all

# 创建消费者（None）
nats consumer add EVENTS metrics-processor \
  --subject="events.>" \
  --ack-none
```

## request-reply 超时与重试模式配置

```bash
# 发送请求（带超时）
nats request "orders.get" '{"order_id":"123"}' --timeout=5s

# 发布+订阅模式（reply）
nats reply "orders.get" --command="echo '{\"status\":\"ok\"}'"

# 重试配置
nats request "orders.get" '{"order_id":"123"}' \
  --timeout=5s \
  --count=3 \
  --delay=1s
```

```java
// Java request-reply 实现
Message reply = nc.request("orders.get",
    "{\"order_id\":\"123\"}".getBytes(),
    Duration.ofSeconds(5));

// 重试逻辑
for (int i = 0; i < 3; i++) {
    try {
        Message reply = nc.request("orders.get", data, Duration.ofSeconds(5));
        return parseResponse(reply);
    } catch (TimeoutException e) {
        Thread.sleep(1000 * (i + 1));
    }
}
throw new RuntimeException("Request failed after 3 retries");
```

## leaf node 网络拓扑设计

### hub-spoke / mesh 模式

```text
Hub-Spoke 模式（星型）：
  Hub 节点（中心）：
    - 接收所有消息
    - 路由到 Spoke 节点
  
  Spoke 节点（边缘）：
    - 连接到 Hub
    - 本地发布/订阅
  
  优点：简单、易于管理
  缺点：Hub 单点故障

Mesh 模式（网状）：
  所有节点相互连接：
    - 每个节点都与所有其他节点连接
    - 消息自动路由
  
  优点：无单点故障、高可用
  缺点：连接数多、配置复杂
```

```bash
# 配置 Leaf Node
nats-server -c leaf-node.conf

# leaf-node.conf 示例
listen: 0.0.0.0:4222
leafnodes {
  remotes [
    { url: "nats://hub1:7422" }
    { url: "nats://hub2:7422" }
  ]
}
accounts: {
  A: { users: [{user: leaf1, password: pass}] }
}
```

## NATS 在 K8s 上部署

### nats-operator Helm chart

```bash
# 添加 Helm 仓库
helm repo add nats https://nats-io.github.io/k8s/helm/charts
helm repo update

# 安装 NATS Operator
helm install nats nats/nats \
  --namespace nats-system \
  --create-namespace \
  --set cluster.enabled=true \
  --set cluster.replicas=3 \
  --set nats.streaming.enabled=true

# 部署 NATS Cluster
kubectl apply -f - <<EOF
apiVersion: nats.io/v1beta2
kind: NatsCluster
metadata:
  name: nats-cluster
  namespace: nats-system
spec:
  size: 3
  version: "2.10.0"
  serverConfig:
    websocket:
      noTLS: true
  pod:
    resources:
      requests:
        cpu: 100m
        memory: 256Mi
      limits:
        cpu: 500m
        memory: 1Gi
EOF

# 验证部署
kubectl get pods -n nats-system
kubectl logs nats-cluster-0 -n nats-system
```

## NATS 账号隔离实战配置

### account/user/permission

```bash
# 创建配置文件 nats-auth.conf
accounts: {
  # Account A（订单服务）
  orders: {
    users: [
      {user: order-writer, password: pass1, permissions: {
        publish: {allow: ["orders.>"]},
        subscribe: {deny: ["orders.internal.>"]}
      }},
      {user: order-reader, password: pass2, permissions: {
        publish: {deny: ["orders.>"]},
        subscribe: {allow: ["orders.>"]}
      }}
    ]
  }

  # Account B（库存服务）
  inventory: {
    users: [
      {user: inv-writer, password: pass3, permissions: {
        publish: {allow: ["inventory.>"]},
        subscribe: {deny: ["inventory.internal.>"]}
      }}
    ]
  }

  # 跨 Account 通信
  system: {
    users: [{user: sys-admin, password: pass4}]
    imports: [
      {stream: {account: orders, subject: "orders.public.>"}},
      {stream: {account: inventory, subject: "inventory.public.>"}}
    ]
  }
}
```

```text
隔离规则：
  1. 默认：Account 间完全隔离
  2. 显式导出/导入：跨 Account 通信
  3. 权限最小化：publish/subscribe 白名单

实战场景：
  团队隔离：每个业务线一个 Account
  环境隔离：dev/staging/prod 各一个 Account
  安全控制：敏感 Topic 只允许特定 Account 访问
```

## NATS JetStream Stream 配置详解

### AckPolicy / Retention / MaxAge

```
Stream 配置示例：
  nats stream add orders \
    --subjects="orders.*" \
    --storage=file \
    --replicas=3 \
    --retention=limits \
    --max-msgs=1000000 \
    --max-bytes=10GB \
    --max-age=72h \
    --discard=old \
    --acks=all

AckPolicy 选项：
  none：不需 ACK（广播场景）
  all：所有副本 ACK（强一致）
  quorum：多数副本 ACK（折中）

Retention 选项：
  limits：保留到 limits 配额
  interest：消费者确认后删除
  workqueue：消费后删除（队列模式）

MaxAge 配置：
  --max-age=72h → 超过 72 小时自动删除
  --max-age=168h → 7 天保留（审计场景）
```

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| replicas | 副本数 | 3（生产） |
| retention | 保留策略 | limits（通用）/ interest（队列） |
| max-msgs | 最大消息数 | 按业务量 |
| max-age | 最大保留时间 | 72h（日志）/ 168h（审计） |
| discard | 超限策略 | old（覆盖）/ new（拒绝） |
| acks | ACK 策略 | all（强一致）/ quorum（折中） |

## NATS Request-Reply 模式

### 服务发现 + 超时 + 重试

```
Request-Reply 模式：
  客户端发送请求到主题
  服务端监听主题并回复
  NATS 自动路由到可用服务

特点：
  1. 服务端可水平扩展（NATS 自动负载均衡）
  2. 支持超时（inbox 超时自动取消）
  3. 支持多服务端（队列组自动选一个回复）

适用场景：
  同步查询（用户信息/订单状态）
  RPC 调用（替代 HTTP/gRPC）
  分布式任务分发
```

```go
// Go Request-Reply 示例
// 客户端
nc, _ := nats.Connect("nats://localhost:4222")
defer nc.Close()

// 发送请求（5秒超时）
resp, err := nc.Request("orders.query", []byte(`{"id":"123"}`), 5*time.Second)
if err != nil {
    log.Fatal(err)
}
fmt.Printf("Response: %s\n", resp.Data)

// 服务端
nc.Subscribe("orders.query", func(msg *nats.Msg) {
    // 处理请求
    result := processQuery(msg.Data)
    msg.Respond(result)
})
```

## NATS Leaf Node 部署

### 边缘集群 / 混合云

```
Leaf Node 架构：
  Hub Cluster（中心集群）：
    3+ 节点
    生产环境核心服务

  Leaf Node（边缘节点）：
    1-3 节点
    边缘设备/分支机构
    通过 Leafnode 协议连接 Hub

混合云场景：
  本地数据中心：Leaf Node
  公云：Hub Cluster
  通过 TLS 加密连接

优势：
  1. 边缘自治（断网时本地服务可用）
  2. 统一消息（边缘数据汇总到中心）
  3. 安全隔离（Leaf Node 只暴露必要主题）
```

```bash
# Leaf Node 配置
listen: 0.0.0.0:4223
leafnodes {
  remotes [
    {
      urls: ["nats://hub-server1:4222", "nats://hub-server2:4222"]
      tls {
        cert_file: "/etc/nats/leaf-cert.pem"
        key_file: "/etc/nats/leaf-key.pem"
      }
    }
  ]
}
```

## NATS K8s 部署

### Helm / Operator

```yaml
# NATS Helm Chart
helm repo add nats https://nats-io.github.io/k8s/helm/charts/
helm install my-nats nats/nats \
  --set cluster.enabled=true \
  --set cluster.replicas=3 \
  --set jetstream.enabled=true \
  --set jetstream.fileStorage.size=10Gi

# NATS Operator（生产推荐）
apiVersion: nats.io/v1alpha2
kind: NatsCluster
metadata:
  name: my-nats
spec:
  size: 3
  version: "2.10"
  jetstream:
    enabled: true
    fileStorage:
      size: 10Gi
      storageClassName: fast-ssd
  pod:
    resources:
      limits:
        cpu: "1"
        memory: 1Gi
```

## NATS Account 隔离

### 多租户 / 权限控制

```
Account 隔离：
  每个 Account 独立的主题空间
  Account 间默认完全隔离
  通过 export/import 实现跨 Account 通信

配置示例：
  accounts: {
    orders: {
      users: [{user: order-svc, password: pass1}]
      exports: [
        {stream: "orders.public.>"}
      ]
    }
    inventory: {
      users: [{user: inv-svc, password: pass2}]
      exports: [
        {stream: "inventory.public.>"}
      ]
      imports: [
        {stream: {account: orders, subject: "orders.public.>"}}
      ]
    }
  }

权限控制：
  publish：允许发布的主题
  subscribe：允许订阅的主题
  deny：禁止的主题（白名单模式）
```

| 特性 | 说明 | 适用 |
|------|------|------|
| Account 隔离 | 独立主题空间 | 多租户 |
| 权限控制 | publish/subscribe 白名单 | 安全 |
| export/import | 跨 Account 通信 | 系统集成 |
| JWT 认证 | 去中心化身份 | 大规模部署 |

## 与其他板块的关系

- Kafka 对比见「[Kafka](./Kafka.md)」；
- Pulsar 对比见「[Apache Pulsar](./ApachePulsar.md)」；
- RabbitMQ 对比见「[RabbitMQ](./RabbitMQ.md)」；
- MQTT（IoT 协议）见「[MQTT 与消息 Broker](./MQTT与消息broker.md)」；
- 云上消息（SNS/SQS）见「[云上消息与集成生态](./云上消息与集成生态.md)」。

> 一句话：**NATS = 主题 Pub/Sub + Request-Reply + JetStream 持久化 + 原生多租户——「最简单」就是它的竞争力；选型先看「延迟与重量（微服务/边缘→NATS，管道→Kafka）」，再定「持久化（需要→JetStream：File + Raft + Explicit Ack）」，最后配「Accounts 认证 + 集群 3 节点 + Stream 保留策略 + 监控」**。