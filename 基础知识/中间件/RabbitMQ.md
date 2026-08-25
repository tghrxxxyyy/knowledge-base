# RabbitMQ（通用消息代理 / 消息队列）

> 基于 AMQP 的**通用消息中间件**，以「灵活路由 + 高可靠投递 + 易管理」著称。
> 适合：企业业务解耦、异步任务、订单后通知、延时/重试、死信处理。
> 不适合：超高频日志流（吞吐逊于 Kafka）、海量分区场景。

---

## 〇、本体介绍（它是什么 / 适用场景 / 核心概念）

**它是什么**：RabbitMQ 是基于 **AMQP 0-9-1 协议**的开源消息代理（Message Broker），用 Erlang 编写，以「灵活路由 + 高可靠 + 易运维」著称，是通用消息队列的代表。

**解决什么痛点**：分布式系统需要异步解耦、削峰填谷、可靠投递、延迟队列。RabbitMQ 通过 Exchange→Queue→Binding 的路由模型支持丰富投递语义，并提供 Confirm、持久化、手动 ACK、死信队列等可靠性机制。

**核心概念**：Producer/Consumer、Queue（FIFO）、Exchange（Direct/Fanout/Topic/Headers 四种类型）、Binding（路由规则）、Routing Key、Vhost（逻辑隔离）、Channel（轻量连接）、Publisher Confirm、死信队列（DLX）、镜像队列、惰性队列、QoS prefetch。

**适用场景**：业务解耦、异步任务、延迟队列、复杂路由、企业级可靠消息。
**不适用**：超高通量日志流（应选 Kafka/Pulsar）。

> 仓库 `github.com/rabbitmq/rabbitmq-server`：Erlang 实现（CLI 用 Elixir），多协议（AMQP 0-9-1 / 1.0、MQTT、STOMP、Stream），**MPL 2.0 + Apache 2.0 双许可**，6.2 万+ commits，企业最流行通用 broker 之一。

---

## 一、它解决什么问题

微服务/单体里，模块间直接调用会导致**强耦合、同步阻塞、故障扩散**。RabbitMQ 引入「Broker 中转」：
- 生产者发消息到 Broker，**不等消费者**，立即返回（异步解耦）。
- Broker 负责**可靠存储、路由、投递、重试、死信**。
- 消费者按自己节奏处理，故障时不丢消息。

---

## 二、核心模型：Exchange → Queue → Binding

RabbitMQ 的灵魂是「**生产者不直接发队列，而是发 Exchange，由 Exchange 按规则路由到 Queue**」。

```mermaid
graph LR
  P[Producer] -->|publish| EX[Exchange]
  EX -->|binding rule| Q1[Queue A]
  EX -->|binding rule| Q2[Queue B]
  Q1 --> C1[Consumer1]
  Q2 --> C2[Consumer2]
```

| 概念 | 说明 |
|------|------|
| **Exchange（交换机）** | 接收消息并按类型路由，本身不存消息 |
| **Queue（队列）** | 真正存消息的地方，消费者从队列取 |
| **Binding（绑定）** | Exchange 到 Queue 的路由规则（可带 routing key） |
| **routing key** | 消息携带的路由键，Exchange 据此匹配 Binding |

---

## 三、四种 Exchange 类型（路由核心）

| 类型 | 路由逻辑 | 典型场景 |
|------|----------|----------|
| **direct** | routing key **精确匹配** | 点对点、按业务类型分发 |
| **topic** | routing key 按 `.` 分隔，**通配**（`*` 单段、`#` 多段） | 按层级分类（如 `order.created`、`user.*`） |
| **fanout** | **广播**到所有绑定队列，忽略 key | 通知、事件广播 |
| **headers** | 按消息头（非 key）匹配，少用 | 复杂头属性路由 |

---

## 四、可靠性机制（面试高频）

1. **消息确认（Ack）**：消费者处理完发 `ack`，Broker 才删消息；没 ack 且断开 → 重新投递（防丢）。
2. **持久化**：Exchange/Queue 声明 `durable=true` + 消息 `deliveryMode=2`，Broker 落盘，重启不丢。
3. **生产者确认（Publisher Confirm）**：Broker 收到后回 ack，生产者可知是否送达。
4. **死信队列（DLX）**：消息被拒绝/过期/队列满 → 转入死信 Exchange，便于补偿/告警。
5. **延迟消息**：社区插件（`rabbitmq_delayed_message_exchange`）或「死信 + TTL」实现定时/重试。仲裁队列（Quorum Queue）原生支持延迟重试（指数退避）。
6. **镜像/仲裁队列**：队列多副本，主挂自动切，防单点。

---

## 五、RabbitMQ vs Kafka vs RocketMQ vs Pulsar

| 维度 | RabbitMQ | Kafka | RocketMQ | Pulsar |
|------|----------|-------|----------|--------|
| 吞吐 | 5万~10万 msg/s | 100万+ | 50万+ | 100万+ |
| 模型 | Exchange 灵活路由 | 分区日志 | 主题+队列 | 分层+多订阅 |
| 延迟 | 毫秒级 | 毫秒~秒 | 毫秒 | 毫秒（<10ms） |
| 事务消息 | 弱 | 弱 | ✅ | ✅ |
| 多协议 | ✅ AMQP/MQTT/STOMP | 自定义 | 自定义 | 多协议 |
| 消费模型 | 推送+竞争消费 | 拉取+Consumer Group | 拉取 | 推/拉+4 种订阅 |
| 运维 | 低（管理 UI 友好） | 高 | 中 | 高 |
| 适用 | 业务解耦/异步/通知 | 日志/流处理 | 金融/电商事务 | 云原生/多租户 |

**选型口诀**：业务要精细路由 + 易管理 → RabbitMQ；日志/大数据管道 → Kafka；事务消息/电商 → RocketMQ；云原生多租户全球化 → Pulsar。

---

## 六、生产实践与避坑

1. **手动 Ack + 幂等**：消费者处理完才 ack，且业务要做幂等（消息可能重投）。
2. **合理用死信**：失败消息进 DLX，避免无限重试阻塞主队列。
3. **Queue 长度限制**：设 `x-max-length` 防消息堆积撑爆内存。
4. **Prefetch 限流**：`basic.qos` 控制未 ack 上限，削峰防消费者被打垮。
5. **管理 UI**：自带 Management Plugin（15672 端口），可视化队列/连接/速率。
6. **Spring 集成**：`spring-boot-starter-amqp` + `RabbitTemplate` / `@RabbitListener`，声明 Exchange/Queue/Binding 用 `BindingBuilder`。
7. **集群部署**：3 节点起步，仲裁队列（Quorum Queue）替代镜像队列。
8. **网络分区处理**：配 autoheal 或 pause_minority（默认 ignore 需人工介入）。

---

## 补充：Quorum 队列选举与脑裂处理

### Quorum 队列选举机制

Quorum 队列基于 Raft 共识协议：

```
Raft 选举流程：
  1. Leader 心跳超时 → Follower 变 Candidate
  2. Candidate 递增 term，请求投票
  3. 多数派（>N/2）投票 → 成为 Leader
  4. Leader 处理所有写请求，复制到多数派后返回 ack

选举超时：150-300ms 随机（避免活锁）
心跳间隔：50ms
```

### 脑裂处理

| 场景 | 行为 | 消息影响 |
|------|------|---------|
| 网络分区（少数派隔离） | 少数派 Leader 无法获得多数派 ack | 少数派无法写入 |
| 网络恢复 | 旧 Leader 发现更高 term，降级为 Follower | 无消息丢失 |
| 分区期间客户端写少数派 | 写入被拒绝（未达到多数派） | 客户端收到错误 |

**脑裂防护配置**：

```ini
# rabbitmq.conf
cluster_partition_handling = autoheal
# 或
cluster_partition_handling = pause_minority
```

| 策略 | 行为 | 适用 |
|------|------|------|
| ignore | 不处理（默认） | 测试环境 |
| autoheal | 自动选择多数派恢复 | 推荐生产 |
| pause_minority | 少数派节点暂停 | 严格一致性 |

## 补充：惰性队列内存行为

### 惰性队列（Lazy Queue）内存模型

```
普通队列：消息驻留内存 → 内存满 → page 到磁盘
惰性队列：消息直接写磁盘 → 内存仅缓存少量

内存行为：
  1. 消息入队 → 直接追加到磁盘文件（mnesia 表 + 磁盘段）
  2. 消费者拉取 → 从磁盘读取（有缓存加速）
  3. 内存占用 ≈ 活跃消费者数 × prefetch_count × 消息大小
```

### 惰性队列 vs 普通队列

| 维度 | 普通队列 | 惰性队列 |
|------|---------|---------|
| 消息存储 | 内存优先 | 磁盘优先 |
| 内存占用 | 高（消息堆积时） | 低（固定开销） |
| 消费延迟 | 低（内存读取） | 略高（磁盘读取） |
| 恢复速度 | 慢（需重新加载） | 快（已在磁盘） |
| 适用 | 短队列、低延迟 | 长队列、消息堆积、内存紧张 |

### 3.12+ 默认行为

RabbitMQ 3.12+ 默认所有队列为惰性队列（`default_queue_type = quorum`），Quorum 队列本身也使用磁盘存储。

## 补充：blocked connections/consumer timeout 排查

### Blocked Connections

当内存/磁盘接近阈值时，RabbitMQ 阻塞生产者连接：

```bash
# 查看 blocked 连接
rabbitmqctl list_connections name state blocks

# 常见 blocked 原因
# 1. 内存告警：vm_memory_high_watermark
# 2. 磁盘告警：disk_free_limit
# 3. Flow Control：内部流控
```

### Consumer Timeout

消费者处理超时被 Broker 断开：

```java
// 设置消费者超时（Spring AMQP）
@Bean
public SimpleRabbitListenerContainerFactory rabbitListenerContainerFactory(
        ConnectionFactory connectionFactory) {
    SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
    factory.setAcknowledgeMode(AcknowledgeMode.MANUAL);
    factory.setPrefetchCount(10);
    // 消费者超时（默认无限）
    factory.setReceiveTimeout(30000L);  // 30 秒
    return factory;
}
```

| 问题 | 原因 | 解决 |
|------|------|------|
| 消费者频繁断开 | 处理逻辑太慢 | 优化消费逻辑/增加消费者 |
| blocked 连接 | 内存/磁盘告警 | 增加资源/启用惰性队列 |
| 消费者卡住 | 死锁/外部依赖慢 | 检查下游依赖/设置超时 |

## 补充：优先级队列代价

### 优先级队列实现原理

RabbitMQ 优先级队列内部维护多个子队列（每个优先级一个）：

```
优先级队列内部结构：
  priority-queue
    ├── sub-queue-0 (优先级 0，最低)
    ├── sub-queue-1
    ├── sub-queue-2
    └── sub-queue-9 (优先级 9，最高)

消费者优先从高优先级子队列消费
```

### 优先级队列代价

| 代价 | 说明 |
|------|------|
| 内存开销 | 每个优先级一个子队列，N 个优先级 = N 倍队列元数据 |
| 消费效率 | 需遍历子队列找到非空最高优先级 |
| 消息顺序 | 同优先级内 FIFO，跨优先级不确定 |
| 吞吐下降 | 相比无优先级队列，吞吐降低 10-30% |
| 堆积风险 | 高优先级消息少时，低优先级消息可能长期堆积 |

> **建议**：优先级数量尽量少（3-5 级），避免使用 10+ 优先级。

## 补充：Federation 上下游配置实例

### Federation 配置

```bash
# 启用插件
rabbitmq-plugins enable federation
rabbitmq-plugins enable federation_management

# 配置上游（Cluster A）
rabbitmqctl set_parameter federation-upstream upstream-b   '{"uri": "amqp://user:pass@cluster-b:5672", "prefetch-count": 1000}'

# 配置策略（Cluster A 的 exchange 使用上游）
rabbitmqctl set_policy federation-test "orders"   '{"federation-upstream": "upstream-b"}'   --apply-to exchanges
```

### Federation vs Shovel 选型

| 场景 | 推荐 | 原因 |
|------|------|------|
| 跨机房异步复制 | Federation | 自动路由，最终一致 |
| 精确搬运（Queue→Queue） | Shovel | 点对点精确控制 |
| 广播复制 | Federation | Exchange 级别 |
| 协议转换（AMQP→STOMP） | Shovel | 支持多协议 |
| 简单场景 | Federation | 配置简单 |

## 补充：Prometheus 关键告警规则

### Prometheus 告警规则

```yaml
groups:
  - name: rabbitmq
    rules:
      - alert: RabbitMQHighMemory
        expr: rabbitmq_process_resident_memory_bytes / rabbitmq_resident_memory_limit_bytes > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "RabbitMQ 内存使用超过 80%"

      - alert: RabbitMQHighDisk
        expr: rabbitmq_disk_space_available_bytes / rabbitmq_disk_space_available_limit_bytes < 0.2
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "RabbitMQ 磁盘空间低于 20%"

      - alert: RabbitMQQueueHigh
        expr: rabbitmq_queue_messages > 100000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "队列消息堆积超过 10 万"

      - alert: RabbitMQConsumerDown
        expr: rabbitmq_queue_consumers == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "队列无消费者"

      - alert: RabbitMQLagHigh
        expr: rabbitmq_queue_messages - rabbitmq_queue_messages_ready > 50000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "未确认消息超过 5 万"
```

### 关键监控指标

| 指标 | 含义 | 阈值建议 |
|------|------|---------|
| `rabbitmq_process_resident_memory_bytes` | 内存使用 | < 80% watermark |
| `rabbitmq_disk_space_available_bytes` | 磁盘剩余 | > 20% 可用 |
| `rabbitmq_queue_messages` | 队列消息数 | 业务定义 |
| `rabbitmq_queue_consumers` | 消费者数量 | > 0 |
| `rabbitmq_queue_messages_unacknowledged` | 未确认消息 | < prefetch × consumers |
| `rabbitmq_connections` | 连接数 | < channel_max × nodes |
| `rabbitmq_channel_messages_published_total` | 发布速率 | 基线对比 |

## 七、与其他板块的关系



- 与 [消息队列 MQ](../MQ.md)、[Apache Pulsar](ApachePulsar.md)、[MQTT](MQTT与消息broker.md)：同属消息中间件家族，RabbitMQ 偏「业务级可靠路由」，Pulsar/Kafka 偏「高吞吐流」，MQTT 偏「设备协议」。
- 与 [分布式事务 Seata](分布式事务Seata.md)：可靠消息最终一致性（本地事务表 + 消息确认）是 RabbitMQ 常见分布式事务落地方式。
- 与 [注册中心与配置中心](注册中心与配置中心.md)：RabbitMQ 集群常借助外部元数据，但不强依赖注册中心。

---

## 八、速查表

| 项 | 结论 |
|----|------|
| 类型 | 通用消息代理（AMQP） |
| 核心 | Exchange → Binding → Queue 路由 |
| 路由类型 | direct / topic / fanout / headers |
| 可靠 | Ack + 持久化 + Confirm + DLX + 仲裁队列 |
| 延迟消息 | 插件 或 死信+TTL |
| 吞吐 | 5万~10万 msg/s（中等） |
| 许可证 | MPL 2.0 + Apache 2.0 |
| 一句话 | 「业务级消息」——可靠、路由灵活、好管理 |

---

## 九、面试高频问题（20+ 条）

1. **RabbitMQ 是什么，核心组件？** 基于 AMQP 0-9-1 的开源消息代理，Erlang 编写。组件：Producer、Consumer、Queue（FIFO）、Exchange（路由）、Binding（规则）、Vhost（逻辑隔离）、Channel（轻量连接）。

2. **四种 Exchange 类型？** Direct（精确匹配 Routing Key，点对点）；Fanout（广播到所有绑定队列）；Topic（模式匹配 * 单层、# 多层，日志/订阅）；Headers（按消息头匹配，性能差少用）。

3. **如何保证消息不丢失（三层防护）？** 生产者：开启 Confirm 模式（异步 ACK）；Broker：Exchange/Queue/消息都 durable 持久化（delivery_mode=2）；消费者：关闭 autoAck，业务处理完手动 basicAck，失败 NACK/重入队或进死信队列。

4. **死信队列（DLX）是什么？** 消息变成死信（被拒 requeue=false、TTL 过期、队列满）后，按 x-dead-letter-exchange 路由到死信队列。常用于异常隔离、重试、审计。

5. **如何实现延迟队列？** 方案：① 死信交换机 + 消息/队列 TTL（过期后进 DLX）；② 官方 rabbitmq-delayed-message-exchange 插件（原生延迟，推荐）。

6. **消息重复消费如何处理？** 消费端做幂等：数据库唯一索引、Redis SETNX、状态机（已支付再支付直接返回成功）、布隆过滤器去重 Message ID。

7. **RabbitMQ 与 Kafka 核心区别？** 设计目标：RabbitMQ 通用队列/复杂路由，Kafka 高吞吐日志流；吞吐量：RabbitMQ 万级/秒，Kafka 十万~百万级/秒；消息模型：RabbitMQ 队列 Push/Pull，Kafka 分区日志 Pull；顺序：RabbitMQ 单队列有序，Kafka 分区内有序。

8. **集群模式有哪些？** 普通集群（元数据共享，队列数据单节点）；镜像队列（队列数据同步多节点，HA，但 3.12+ 被 Quorum Queue 取代）；Federation（跨机房异步复制）；Shovel（跨集群主动搬运）。

9. **镜像队列/Quorum Queue？** 镜像队列把队列数据复制到多节点防丢失；RabbitMQ 3.12+ 默认所有队列为惰性队列，推荐用 Quorum Queue（Raft 复制）替代老镜像队列做高可用。

10. **内存告警与磁盘告警？** 内存超 vm_memory_high_watermark（默认 0.4）阻塞所有连接；磁盘低于 disk_free_limit（默认 50MB）阻塞生产者。可调水位或启用惰性队列。

11. **什么是惰性队列（Lazy Queue）？** 消息直接写磁盘、不驻留内存，适合长队列/消息堆积/内存紧张；3.12+ 默认开启。恢复快（已在磁盘）。

12. **Flow Control 流控？** 当内存/磁盘接近阈值，RabbitMQ 暂停接收消息防止过载，资源回落后自动恢复。

13. **如何保证消息顺序？** 单队列 + 单消费者（性能低）；或用分片队列/单一消费者避免并发乱序。RabbitMQ 全局顺序难保证，网络分区下尤甚。

14. **TTL 配置方式？** 消息级 expiration 属性；队列级 x-message-ttl 参数。过期消息移除，配 DLX 则进死信队列。

15. **优先级队列？** 声明队列时 x-max-priority 指定最大优先级，发送时设 priority；高优先级先消费。

16. **QoS / prefetch 作用？** channel.basic_qos(prefetch_count) 限制消费者未确认消息数，防止单消费者积压、实现公平分发（轮询 + 预取）。

17. **脑裂（Network Partition）处理？** 策略：ignore（默认需人工）、autoheal（自动愈合）、pause_minority（少数派暂停）。建议生产配 autoheal 或 pause_minority。

18. **Vhost 作用？** 单 Broker 上逻辑隔离，相当于独立 MQ 实例；不同业务用独立 Vhost + 权限控制（configure/write/read）。

19. **消息积压怎么处理？** 增加消费者、优化消费逻辑、消息分流到多队列/Exchange、临时扩容、惰性队列抗堆积；必要时丢弃非关键消息。

20. **安全机制？** 认证（内置/ LDAP/ OAuth2-JWT）、授权（Vhost + 权限）、传输 TLS/mTLS、防火墙限制端口（5672/15672/15674）。

21. **性能瓶颈与解决？** 磁盘 IO（SSD、分离日志）、内存（加内存、惰性队列）、CPU（避免复杂 Topic 正则）、连接数（连接池 + 多 Channel）、队列过长（分片/联邦）。

22. **RabbitMQ 选型场景？** 需精确路由、低延迟、可靠投递、延迟队列的业务解耦；超高通量日志流选 Kafka/Pulsar。

---

## 十、RabbitMQ 生产配置清单

### 10.1 rabbitmq.conf 关键配置

```ini
# 内存限制
vm_memory_high_watermark.relative = 0.4
vm_memory_high_watermark_paging_ratio = 0.75

# 磁盘限制
disk_free_limit.absolute = 50GB

# 连接限制
channel_max = 2048

# 队列配置
queue_master_locator = min-masters

# 网络
tcp_listen_options.backlog = 256
tcp_listen_options.nodelay = true
tcp_listen_options.sndbuf = 196608
tcp_listen_options.recbuf = 196608
```

### 10.2 监控指标

```
RabbitMQ 指标：
  队列长度（queue_length）
  消息速率（publish_rate/consume_rate）
  内存使用（mem_used）
  磁盘使用（disk_free）
  连接数（connections）
  通道数（channels）
  未确认消息数（messages_unacknowledged）
```

### 10.3 常见问题排查

| 问题 | 原因 | 解决 |
|------|------|------|
| 内存告警 | 消息堆积/内存限制低 | 增加内存/启用惰性队列 |
| 消费者卡住 | 处理逻辑慢/未 ACK | 优化逻辑/手动 ACK |
| 网络分区 | 网络不稳定 | 配置 autoheal/pause_minority |
| 消息丢失 | 未持久化/未 Confirm | 开启持久化+Confirm |

---

## 十一、RabbitMQ 运维命令

```bash
# 队列管理
rabbitmqctl list_queues name messages consumers
rabbitmqctl purge_queue <queue_name>

# 用户管理
rabbitmqctl add_user <username> <password>
rabbitmqctl set_user_tags <username> administrator
rabbitmqctl set_permissions -p / <username> ".*" ".*" ".*"

# 集群管理
rabbitmqctl cluster_status
rabbitmqctl join_cluster <node_name>

# 插件管理
rabbitmq-plugins enable rabbitmq_management
rabbitmq-plugins enable rabbitmq_delayed_message_exchange
```

---

## 十二、Quorum Queues（仲裁队列）

### 12.1 什么是 Quorum Queue

Quorum Queue 是 RabbitMQ 3.8+ 引入的高可用队列，基于 Raft 共识协议实现数据复制，替代老版本的镜像队列（Mirror Queue）。

```mermaid
flowchart TB
    PRODUCER[生产者] --> LEADER[Leader 节点]
    LEADER -->|Raft 复制| F1[Follower 1]
    LEADER -->|Raft 复制| F2[Follower 2]
    F1 --> C1[消费者]
    F2 --> C2[消费者]
```

### 12.2 Quorum Queue vs Mirror Queue

| 维度 | Quorum Queue | Mirror Queue |
|------|-------------|--------------|
| 协议 | Raft | 自定义同步 |
| 数据一致性 | 强一致 | 最终一致 |
| 消息持久化 | 必须持久化 | 可选 |
| 内存占用 | 较低（磁盘优先） | 较高（内存复制） |
| 消息吞吐 | 较低（Raft 开销） | 较高 |
| 推荐版本 | 3.8+（推荐） | 已废弃 |

### 12.3 配置与使用

```bash
# 声明仲裁队列
rabbitmqadmin declare queue name=order-queue durable=true \
  arguments='{"x-queue-type": "quorum", "x-quorum-initial-group-size": 3}'

# 监控
rabbitmqctl list_queues name type messages consumers
```

---

## 十三、Stream Queues（流队列）

### 13.1 Stream 特性

RabbitMQ 3.9+ 引入的流存储队列，类似 Kafka 的日志模型：消息持久化、支持多消费者组、支持消息回溯。

```text
Stream Queue 特点：
  - 追加写入，不可变消息日志
  - 多消费者组独立消费（类似 Kafka）
  - 消费位移由客户端管理（支持回溯）
  - 高吞吐（顺序写磁盘）
  - 适合事件溯源、审计日志、CDC
```

### 13.2 Stream vs Classic vs Quorum

| 维度 | Classic | Quorum | Stream |
|------|---------|--------|--------|
| 消息模型 | 队列（消费即删） | 队列（消费即删） | 日志（持久保留） |
| 多消费者组 | 不支持 | 不支持 | 支持 |
| 消息回溯 | 不支持 | 不支持 | 支持 |
| 吞吐 | 中 | 中 | **高** |
| 适用 | 传统业务解耦 | 高可用队列 | 事件溯源/CDC |

### 13.3 使用示例

```bash
# 声明流队列
rabbitmqadmin declare queue name=event-stream durable=true \
  arguments='{"x-queue-type": "stream", "x-stream-max-length": 1000000}'

# 流消费者（Java 客户端）
StreamConsumer consumer = channel.consume("event-stream",
    new DeliverCallback() {
        public void handle(String tag, Delivery delivery) {
            // 处理消息，消费位移由客户端追踪
        }
    });
```

---

## 十四、RabbitMQ Federation 与 Shovel

### 14.1 Federation（联邦）

```text
Federation 用途：
  - 跨机房/跨地域消息复制
  - 异步复制，最终一致
  - 不同集群/不同 Vhost 间桥接

配置：
  1. 启用插件：rabbitmq-plugins enable federation
  2. 创建 Federation Upstream（上游地址）
  3. 配置 Exchange/Queue Federation 策略
```

```mermaid
flowchart LR
    DC1[机房A Exchange] -->|Federation 异步| DC2[机房B Exchange]
    DC2 --> Q1[Queue B1]
    DC2 --> Q2[Queue B2]
```

### 14.2 Shovel（铲子）

```text
Shovel 用途：
  - 跨集群主动搬运消息
  - 支持 AMQP 和 STOMP 协议
  - 精确控制消息转发规则

配置：
  rabbitmq-plugins enable shovel
  rabbitmqctl set_parameter shovel my-shovel \
    '{"src-protocol": "amqp", "src-uri": "amqp://host1", "src-queue": "q1", "dest-protocol": "amqp", "dest-uri": "amqp://host2", "dest-queue": "q2"}'
```

### 14.3 Federation vs Shovel

| 维度 | Federation | Shovel |
|------|-----------|--------|
| 粒度 | Exchange/Queue 级别 | Queue→Queue/Exchange |
| 方向 | 自动路由 | 精确点对点 |
| 适用 | 广播复制 | 精确搬运 |
| 复杂度 | 较低 | 较高 |

---

## 十五、消息去重与优先级队列

### 15.1 消息去重策略

```text
RabbitMQ 不保证 exactly-once，需要应用层去重：

1. 消息 ID 去重表
   - 生产者设唯一 message-id
   - 消费者查去重表（Redis/DB）
   - 已处理则跳过

2. 业务唯一键
   - 订单号/支付流水号 做幂等
   - 数据库唯一索引兜底

3. Redis SETNX
   - SETNX message_id 1 EX 3600
   - 成功则消费，失败则跳过
```

```java
// Redis 去重示例
public boolean isDuplicate(String messageId) {
    String key = "mq:dedup:" + messageId;
    return !redisTemplate.opsForValue().setIfAbsent(key, "1", 24, TimeUnit.HOURS);
}
```

### 15.2 优先级队列

```bash
# 声明优先级队列
rabbitmqadmin declare queue name=priority-queue durable=true \
  arguments='{"x-max-priority": 10}'

# 发送带优先级的消息
rabbitmqadmin publish routing_key=priority-queue payload='high priority' \
  properties='{"priority": 8}'
```

| 优先级 | 说明 |
|--------|------|
| 0-9 | 数字越大优先级越高 |
| 消费者 | 优先消费高优先级消息 |
| 适用 | VIP 用户优先处理、紧急任务优先 |

---

## 十六、死信队列深度

### 16.1 死信产生原因

```text
消息变成死信的三种场景：
1. 消费者拒绝（basic.reject / basic.nack 且 requeue=false）
2. 消息 TTL 过期（message-ttl 或 per-message expiration）
3. 队列达到最大长度（x-max-length），头部消息被丢弃
```

### 16.2 死信处理架构

```mermaid
flowchart LR
    DLX[Dead Letter Exchange] --> DLQ1[DLQ 告警队列]
    DLX --> DLQ2[DLQ 补偿队列]
    DLX --> DLQ3[DLQ 审计队列]
    DLQ1 --> ALERT[告警通知]
    DLQ2 --> RETRY[重试补偿]
    DLQ3 --> AUDIT[审计日志]
```

### 16.3 配置示例

```java
@Bean
public Queue businessQueue() {
    return QueueBuilder.durable("business.queue")
        .withArgument("x-dead-letter-exchange", "dlx.exchange")
        .withArgument("x-dead-letter-routing-key", "dlq.routing")
        .withArgument("x-message-ttl", 60000)  // 消息 60s 未消费进死信
        .build();
}
```

---

## 十七、RabbitMQ on Kubernetes

### 17.1 RabbitMQ Operator

```text
RabbitMQ Cluster Operator（VMware 开源）：
  - 声明式管理 RabbitMQ 集群
  - 自动处理集群扩缩容、版本升级
  - 集成 K8s Service/Ingress/PVC

安装：
  kubectl apply -f https://github.com/rabbitmq/cluster-operator/releases/latest/download/cluster-operator.yml
```

### 17.2 Operator 资源定义

```yaml
apiVersion: rabbitmq.com/v1beta1
kind: RabbitmqCluster
metadata:
  name: rabbitmq
spec:
  replicas: 3
  image: rabbitmq:3.12-management
  persistence:
    storageClassName: gp3
    storage: 50Gi
  resources:
    requests:
      cpu: "1"
      memory: 2Gi
    limits:
      cpu: "2"
      memory: 4Gi
  rabbitmq:
    additionalConfig: |
      vm_memory_high_watermark.relative = 0.6
      disk_free_limit.absolute = 10GB
```

---

## 十八、rabbitmq.conf 生产调优

### 18.1 核心参数

```ini
# 连接与通道
channel_max = 2048
heartbeat = 60

# 内存
vm_memory_high_watermark.relative = 0.4
vm_memory_high_watermark_paging_ratio = 0.75

# 磁盘
disk_free_limit.absolute = 50GB

# 队列
queue_master_locator = min-masters
default_queue_type = quorum  # 默认使用仲裁队列

# 网络
tcp_listen_options.backlog = 256
tcp_listen_options.nodelay = true
tcp_listen_options.sndbuf = 196608
tcp_listen_options.recbuf = 196608

# 日志
log.file.level = info
log.file.rotation.date = $D0
log.file.rotation.size = 104857600
```

### 18.2 Erlang VM 调优

```erlang
%% Erlang VM 参数（advanced.config）
[
  {kernel, [
    {inet_dist_listen_min, 60000},
    {inet_dist_listen_max, 60100}
  ]},
  {sasl, [
    {sasl_error_logger, false}
  ]},
  {os_mon, [
    {memsup_system_memory_high_watermark, 0.8},
    {disksup_diskspace_high_watermark, 0.85}
  ]}
].

%% 环境变量
ERL_FLAGS="+P 1048576 +Q 65536 +A 32 +S 2:2"
%% +P 进程数上限  +Q 端口上限  +A 线程池  +S CPU核心绑定
```

### 18.3 调优检查清单

| 检查项 | 建议值 | 说明 |
|--------|--------|------|
| vm_memory_high_watermark | 0.4~0.6 | 视内存和队列堆积情况 |
| disk_free_limit | 50GB+ | 防磁盘满阻塞 |
| channel_max | 2048 | 单连接最大通道数 |
| heartbeat | 60 | 检测死连接 |
| tcp listen backlog | 256 | 高并发连接队列 |
| Erlang 进程数 | 1048576+ | 默认上限可能不够 |

---

## 十九、RabbitMQ Spring Boot 集成示例

### 12.1 配置类

```java
@Configuration
public class RabbitMQConfig {
    @Bean
    public DirectExchange orderExchange() {
        return new DirectExchange("order.exchange");
    }
    
    @Bean
    public Queue orderQueue() {
        return QueueBuilder.durable("order.queue")
            .withArgument("x-dead-letter-exchange", "order.dlx.exchange")
            .build();
    }
    
    @Bean
    public Binding orderBinding(Queue orderQueue, DirectExchange orderExchange) {
        return BindingBuilder.bind(orderQueue).to(orderExchange).with("order.create");
    }
}
```

### 12.2 生产者

```java
@Service
@RequiredArgsConstructor
public class OrderProducer {
    private final RabbitTemplate rabbitTemplate;
    
    public void sendOrder(Order order) {
        rabbitTemplate.convertAndSend("order.exchange", "order.create", order);
    }
}
```

### 12.3 消费者

```java
@Component
@RabbitListener(queues = "order.queue")
public class OrderConsumer {
    @RabbitHandler
    public void handleOrder(Order order, Channel channel, Message message) {
        try {
            // 处理订单
            channel.basicAck(message.getMessageProperties().getDeliveryTag(), false);
        } catch (Exception e) {
            channel.basicNack(message.getMessageProperties().getDeliveryTag(), false, true);
        }
    }
}
```

### 12.4 死信消费者

```java
@Component
@RabbitListener(queues = "order.dlq")
public class DeadLetterConsumer {
    @RabbitHandler
    public void handleDeadLetter(Order order) {
        // 记录日志/告警/人工处理
    }
}
```
