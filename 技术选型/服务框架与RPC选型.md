# 服务框架与 RPC 选型

> 板块：技术选型 　|　 返回：[README](README.md)
> 关联：[微服务拆分与设计原则](../../架构/微服务拆分与设计原则.md)、[服务框架与RPC深度选型](服务框架与RPC深度选型.md)、[源码系列/Dubbo核心源码要点](../源码系列/Dubbo核心源码要点.md)

微服务间通信是架构的"血管"。选错通信方式，会带来性能瓶颈、耦合混乱、治理困难。本文对比 REST/gRPC/Dubbo/Thrift/Spring Cloud，拆解关键能力与选型框架。

## 一、RPC vs HTTP（REST）

### 1.1 HTTP/JSON（REST）

- 优点：通用、易调试（curl 即可）、跨语言好、生态成熟、缓存友好（CDN/网关）。
- 缺点：文本协议体积大、无强类型契约、序列化慢、长连接/流式支持弱。
- 适合：对外 API、低频跨团队调用、浏览器/移动端直连。

### 1.2 RPC（gRPC/Dubbo/Thrift）

- 优点：二进制（Protobuf/Hessian）体积小、强类型契约、高性能、支持流式。
- 缺点：调试不如 REST 直观（需工具）、跨语言需生成代码、学习成本。
- 适合：内部高频服务间调用、对延迟与吞吐敏感的核心链路。

### 1.3 选型直觉

| 场景 | 选 |
|------|----|
| 对外 / 跨组织 / 调试频繁 | REST / GraphQL |
| 内部 / 高频 / 高性能 | RPC（gRPC / Dubbo） |
| 云原生基础设施 | gRPC（K8s、Istio 原生支持） |

> 现实趋势：**外部 REST、内部 gRPC** 成为主流组合，网关做转换。

## 二、主流框架对比

| 框架 | 协议/传输 | 特点 | 生态 | 适用 |
|------|-----------|------|------|------|
| gRPC | HTTP/2 + Protobuf | 跨语言、流式、云原生标配 | 极强 | 跨语言、云原生 |
| Dubbo | 自建 / Triple(HTTP/2) | 阿里系，服务治理强，国内流行 | 强（Java） | Java 微服务 |
| Thrift | 多协议（TCP/HTTP） | 跨语言、灵活、Facebook 出品 | 中 | 跨语言老牌 |
| Spring Cloud | HTTP（OpenFeign） | 全家桶、生态大、上手快 | 强（Java） | Java 快速搭建 |
| Kitex(TGO) | 多协议 | 字节云原生、Go 友好、高性能 | 中 | Go 微服务 |

## 三、gRPC 关键

### 3.1 Protobuf 契约

- `.proto` 文件定义 service 与 message，是"强契约"。
- 通过 `protoc` / `buf` 生成各语言客户端/服务端代码。
- 字段用编号（tag）标识，支持向后兼容（新增字段不破坏旧客户端，旧字段用 `reserved` 防复用）。

```protobuf
syntax = "proto3";
service OrderService {
  rpc CreateOrder(CreateOrderReq) returns (CreateOrderResp);
}
message CreateOrderReq {
  string user_id = 1;
  repeated Item items = 2;
}
```

### 3.2 四种调用模式

| 模式 | 说明 | 例子 |
|------|------|------|
| Unary | 一问一答 | 普通 RPC |
| Server Streaming | 服务端持续推流 | 实时行情、日志流 |
| Client Streaming | 客户端持续发 | 批量上传、传感器数据 |
| Bidirectional | 双向流 | 聊天、实时协作、游戏 |

### 3.3 网关转换

- 外部 REST、内部 gRPC：通过 Envoy / APISIX / grpc-gateway 做 REST↔gRPC 转换。
- 便于浏览器/移动端接入，内部享受高性能。

### 3.4 注意

- 默认 HTTP/2 要求 TLS（或 h2c 明文，需谨慎，仅内网）。
- 错误码用 gRPC status（如 `NOT_FOUND`、`INTERNAL`），映射到业务异常。
- 大消息注意默认 4MB 限制（`max_receive_message_length` 可调，但应反思是否该拆）。
- 截止时间（deadline）需透传，避免后端无限等待。

## 四、Dubbo 关键

- 注册中心（Nacos/ZK）、负载均衡、容错（failover/failsafe/forking）。
- **按 tag 消费**（见用户 RocketMQ 按 tag 消费实践），实现灰度/隔离/多版本路由。
- 序列化：Hessian2 / Fastjson / Protobuf（跨语言用 Protobuf）。
- **Triple 协议**：兼容 gRPC（HTTP/2 + Protobuf），兼顾云原生与原有 Dubbo 生态。
- 生态：dubbo-spring-boot-starter、Admin 管控台、Metrics 集成。

```java
// Dubbo 接口即契约
@DubboService
public class OrderServiceImpl implements OrderService {
    public Order create(OrderReq req) { ... }
}
// 消费者
@DubboReference
private OrderService orderService;
```

## 五、服务治理要素（无论哪种框架）

| 要素 | 说明 | 注意 |
|------|------|------|
| 注册发现 | Provider 注册、Consumer 订阅 | 注册中心高可用 |
| 负载均衡 | 随机/轮询/最少活跃/一致性哈希 | 一致性哈希用于有状态 |
| 熔断限流 | 依赖故障快速失败 | 配合 Sentinel/Hystrix |
| 重试与超时 | 重试需幂等 | 超时链要传递 |
| 链路追踪 | TraceId 透传 | 跨进程传递 |

> 治理是"框架之上的能力"——框架提供机制，治理策略要自己设计（见 [SRE/README](../../SRE/README.md)）。

## 六、序列化选型

| 格式 | 优点 | 缺点 | 适用 |
|------|------|------|------|
| Protobuf | 跨语言、紧凑、快 | 需 schema、可读性差 | 内部高频（推荐） |
| Hessian2 | Java 生态好 | 跨语言一般 | Dubbo 默认 |
| JSON | 可读、调试方便 | 慢、体积大 | 对外/调试 |
| Avro | 紧凑、schema 演进好 | 生态较小 | 大数据 |

原则：**内部高频用二进制（Protobuf）；对外/调试用 JSON**。

## 七、版本与兼容

- 接口演进遵循"**向后兼容**"：不删字段、不改类型、新增可选字段。
- Protobuf 用 `reserved` 防字段编号复用冲突。
- 多版本并存时用版本号/header 路由灰度（如 `x-api-version: v2`）。
- 破坏性变更：新增接口而非改旧接口，旧接口走 Deprecation 周期下线。

## 八、超时与重试的工程细节

- **超时链传递**：上游超时 ≥ 下游超时之和（含网络），否则上游已超时下游还在算，资源空耗。
- **重试预算**：重试次数 × 并发 = 放大倍数，必须配合熔断与指数退避，防重试风暴。
- **重试仅对幂等操作**：查询/读可重试；写/扣款需业务幂等（见 [分布式锁与幂等设计](../../场景设计/分布式锁与幂等设计.md)）。
- **对冲（Hedging）**：发多个副本取最快，适合延迟敏感（gRPC hedging）。

## 九、选型建议

| 场景 | 推荐 |
|------|------|
| 内部高频调用 | gRPC（云原生）/ Dubbo（Java 治理强） |
| 对外 API | REST / GraphQL |
| 大数据/流式 | gRPC streaming / Thrift |
| 云原生 | gRPC + Service Mesh（治理下沉） |
| 快速 Java 搭建 | Spring Cloud（后期可迁 Dubbo/gRPC） |

## 十、常见坑

1. **超时设太长** → 故障堆积，雪崩（应短超时 + 熔断）。
2. **不降级不熔断** → 依赖故障拖垮主链路。
3. **版本不兼容** → Protobuf 字段乱、序列化失败（用 reserved）。
4. **大对象 RPC** → 序列化慢、网络拥塞（拆小/分页）。
5. **重试不幂等** → 重复请求造成资损/脏数据。
6. **忽视超时链传递** → 上游短、下游长，资源空耗。
7. **契约不管理** → 接口演进失控，消费者频繁报错（用 proto/OpenAPI 管控）。
8. **没做限流** → 热点接口被打爆（网关 + 应用双层限流）。

## 十一、落地清单

- [ ] 对外 REST、内部 gRPC/Dubbo 的组合定型。
- [ ] 定义契约（proto / OpenAPI），纳入版本管理。
- [ ] 注册发现 + 负载均衡 + 熔断限流 + 链路追踪全套到位。
- [ ] 超时链传递 + 重试预算 + 幂等保障。
- [ ] 序列化选型（内部 Protobuf）。
- [ ] 接口兼容性规范（向后兼容 + Deprecation 周期）。

## 十二、延伸阅读

- [微服务拆分与设计原则](../../架构/微服务拆分与设计原则.md)
- [服务框架与RPC深度选型](服务框架与RPC深度选型.md)
- [架构/技术选型与决策实战](../../架构/技术选型与决策实战.md)
- [源码系列/Dubbo核心源码要点](../源码系列/Dubbo核心源码要点.md)
- [分布式锁与幂等设计](../../场景设计/分布式锁与幂等设计.md)
- [云原生/README](../../云原生/README.md)
