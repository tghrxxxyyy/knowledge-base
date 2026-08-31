# 服务框架与 RPC 选型

> 板块：技术选型 　|　 返回：[README](README.md)

微服务间通信是架构的"血管"。选错通信方式，会带来性能瓶颈、耦合混乱、治理困难。本文对比 REST/gRPC/Dubbo/Thrift/Spring Cloud，拆解关键能力与选型框架。

## 一、RPC vs HTTP（REST）

### 1.1 HTTP/JSON（REST）

- 优点：通用、易调试（curl 即可）、跨语言好、生态成熟、缓存友好。
- 缺点：文本协议体积大、无强类型契约、序列化慢、长连接/流式支持弱。
- 适合：对外 API、低频跨团队调用、浏览器/移动端直连。

### 1.2 RPC（gRPC/Dubbo/Thrift）

- 优点：二进制（Protobuf/ Hessian）体积小、强类型契约、高性能、支持流式。
- 缺点：调试不如 REST 直观、跨语言需生成代码、学习成本。
- 适合：内部高频服务间调用、对延迟与吞吐敏感的核心链路。

### 1.3 选型直觉

- 对外 / 跨组织 / 调试频繁 → REST/GraphQL。
- 内部 / 高频 / 高性能 → RPC。
- 云原生基础设施 → gRPC 是事实标准（K8s、Istio 原生支持）。

## 二、主流框架对比

| 框架 | 协议/传输 | 特点 | 生态 |
|------|-----------|------|------|
| gRPC | HTTP/2 + Protobuf | 跨语言、流式、云原生标配 | 极强 |
| Dubbo | 自建/Triple(HTTP/2) | 阿里系，服务治理强，国内流行 | 强（Java） |
| Thrift | 多协议（TCP/HTTP） | 跨语言、灵活、Facebook 出品 | 中 |
| Spring Cloud | HTTP（OpenFeign） | 全家桶、生态大、上手快 | 强（Java） |
| Go Micro / Kitex | 多协议 | 云原生、Go 友好 | 中 |

## 三、gRPC 关键

### 3.1 Protobuf 契约

- `.proto` 文件定义 service 与 message，是"强契约"。
- 通过 `protoc` 生成各语言客户端/服务端代码。
- 字段用编号（tag）标识，支持向后兼容（新增字段不破坏旧客户端）。

### 3.2 四种调用模式

- **Unary**：一问一答（最常见）。
- **Server Streaming**：服务端持续推流（如实时行情）。
- **Client Streaming**：客户端持续发（如批量上传）。
- **Bidirectional**：双向流（如聊天、实时协作）。

### 3.3 网关转换

- 外部用 REST，内部用 gRPC：通过 Envoy / APISIX / grpc-gateway 做 REST↔gRPC 转换。
- 便于浏览器/移动端接入。

### 3.4 注意

- 默认 HTTP/2 要求 TLS（或 h2c 明文，需谨慎）。
- 错误码用 gRPC status，映射到业务异常。
- 大消息注意默认 4MB 限制（可调，但应反思是否该拆）。

## 四、Dubbo 关键

- 注册中心（Nacos/ZK）、负载均衡、容错（failover/failsafe/forking）。
- 按 tag 消费（见用户 RocketMQ 按 tag 消费实践），实现灰度/隔离。
- 序列化：Hessian2 / Fastjson / Protobuf（跨语言用 Protobuf）。
- Triple 协议：兼容 gRPC（HTTP/2 + Protobuf），兼顾云原生。

## 五、服务治理要素（无论哪种框架）

- **注册发现**：Provider 注册、Consumer 订阅。
- **负载均衡**：随机/轮询/最少活跃/一致性哈希。
- **熔断限流**：依赖故障快速失败，自身不被压垮。
- **重试与超时**：重试需幂等，超时链要传递（上游短于下游无意义）。
- **链路追踪**：TraceId 透传，全链路可观测。
- 详见 [SRE/README](../../SRE/README.md) 与 [架构/技术选型与决策实战](../../架构/技术选型与决策实战.md)。

## 六、序列化选型

- Protobuf：跨语言、紧凑、快（推荐）。
- Hessian2：Java 生态、跨语言一般。
- JSON：可读、调试方便但慢、体积大。
- 原则：内部高频用二进制；对外/调试用 JSON。

## 七、版本与兼容

- 接口演进遵循"向后兼容"：不删字段、不改类型、新增可选字段。
- Protobuf 用保留字段编号防复用冲突。
- 多版本并存时用版本号/header 路由灰度。

## 八、选型建议

- 内部高频调用：gRPC（云原生）/ Dubbo（Java 治理强）。
- 对外 API：REST / GraphQL。
- 大数据/流式：gRPC streaming / Thrift。
- 云原生：gRPC + Service Mesh（治理下沉）。

## 九、常见坑

1. **超时设太长** → 故障堆积，雪崩。
2. **不降级不熔断** → 依赖故障拖垮主链路。
3. **版本不兼容** → Protobuf 字段乱、序列化失败。
4. **大对象 RPC** → 序列化慢、网络拥塞。
5. **重试不幂等** → 重复请求造成资损/脏数据。
6. **忽视超时链传递** → 上游短、下游长，资源空耗。

## 十、延伸阅读

- [架构/技术选型与决策实战](../../架构/技术选型与决策实战.md)
- [云原生/README](../../云原生/README.md)
- [源码系列/Dubbo核心源码要点](../源码系列/Dubbo核心源码要点.md)
