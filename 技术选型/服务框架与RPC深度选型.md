# 服务框架与 RPC 深度选型

> 本文深入服务间通信（RPC）的选型：从协议（HTTP/REST、gRPC、Thrift、Dubbo）、序列化（JSON、Protobuf、Hessian）、服务发现与治理，到主流框架（Dubbo、Spring Cloud、gRPC、brpc 等）的取舍。内容基于公开设计与实践，具体特性以官方为准。

## 1. 为什么需要 RPC 框架

- 微服务间需高效、类型安全的远程调用。
- 原生 HTTP + JSON 简单但性能与契约弱。
- RPC 框架提供：编解码、服务发现、负载均衡、容错、可观测。

## 2. 通信协议对比

- HTTP/REST（JSON）：通用、易调试、跨语言好，性能一般。
- gRPC（HTTP/2 + Protobuf）：高性能、流式、强契约，需代码生成。
- Thrift：多语言、多协议，老牌。
- Dubbo（自有 TCP 协议）：国内生态强，服务治理完整。
- 选型看：性能、语言、生态、团队熟悉度。

## 3. 序列化方式

- JSON：可读、跨语言，体积大、慢。
- Protobuf：二进制、小、快、强 schema，需生成代码。
- Hessian：Java 友好二进制。
- Kryo/FST：Java 高性能。
- Avro：Hadoop 生态。
- 原则：内部高性能用 Protobuf/Hessian，对外用 JSON。

## 4. 服务发现

- 客户端/服务端从注册中心（Nacos/ZK/etcd/Consul）获取实例列表。
- 客户端负载均衡：消费者侧选节点（如 Dubbo/Ribbon 思路）。
- 服务端负载均衡：网关/LB 侧（如 k8s Service）。
- 健康探测：心跳/探活摘除故障节点。

## 5. 负载均衡策略

- 随机、轮询、加权轮询。
- 一致性哈希：粘性、缓存命中。
- 最少活跃/最少连接：偏向轻负载。
- 就近/同机房优先：降延迟。

## 6. 容错策略

- 失败重试（failover）、快速失败（failfast）。
- 失败安全（忽略）、失败自动恢复（failsafe）。
- 熔断降级：下游异常走兜底。
- 与容错设计章节呼应。

## 7. Dubbo

### 7.1 特点

- 阿里开源，Java 生态服务治理强。
- 自有 RPC 协议（Dubbo 协议，TCP 长连接）。
- 完整治理：注册中心、路由、限流、降级、鉴权。
- 配合 Nacos/ZK 注册。

### 7.2 适用

- Java 微服务、需要强治理与高性能内部调用。
- 国内采用率高。

## 8. Spring Cloud

### 8.1 特点

- 基于 HTTP/REST 的微服务全家桶（注册、配置、网关、熔断、链路）。
- 生态广、与 Spring 无缝。
- 调用多为 REST（也可接 gRPC/Feign）。

### 8.2 适用

- 已有 Spring 体系、偏好 REST 简约、需要全家桶。
- 性能略低于 Dubbo 自有协议，但够用。

## 9. gRPC

### 9.1 特点

- Google 开源，HTTP/2 + Protobuf。
- 强契约（IDL），多语言。
- 支持双向流、流式 RPC。
- 性能好，但需要代码生成、调试不如 JSON 直观。

### 9.2 适用

- 跨语言、高性能内部服务、流式场景、云原生（K8s 内常见）。
- 与 Envoy/Istio 配合良好。

## 10. brpc / 其他

- brpc：百度开源，C++，高性能，百度/字节内部使用广。
- Thrift：跨语言 RPC 老牌，Facebook 开源。
- 选择取决于语言栈与性能诉求。

## 11. 契约与版本

- IDL（Protobuf/Thrift）提供强契约，利于演进。
- 接口兼容性：新增字段向后兼容，避免破坏性变更。
- 版本管理：多版本共存（灰度）。

## 12. 可观测

- 调用链：traceId 跨服务传递（OpenTelemetry）。
- 指标：QPS、延迟、错误率、饱和度。
- 日志：结构化、关联 traceId。
- 与可观测性章节呼应。

## 13. 安全

- 传输加密（TLS/mTLS，Service Mesh 可统一）。
- 认证鉴权：Token/网关鉴权。
- 限流防滥用。

## 14. 选型决策框架

1. 语言栈：纯 Java → Dubbo/Spring Cloud；跨语言 → gRPC/Thrift。
2. 性能：极致吞吐 → gRPC/brpc/Dubbo 协议；普通 → REST。
3. 治理需求：强治理 → Dubbo/Spring Cloud 全家桶。
4. 流式：需双向流 → gRPC。
5. 团队熟悉度：优先会用能维护的。

## 15. 对比表

| 框架 | 协议 | 序列化 | 治理 | 语言 | 适用 |
|---|---|---|---|---|---|
| Dubbo | Dubbo/TCP | Hessian/PB | 强 | Java | 国内 Java 微服务 |
| Spring Cloud | HTTP | JSON | 全 | Java | Spring 生态 |
| gRPC | HTTP/2 | Protobuf | 中(配网格) | 多 | 跨语言/高性能 |
| Thrift | 多 | 多 | 弱 | 多 | 老牌跨语言 |
| brpc | 自研 | 多 | 强 | C++ | 高性能 C++ |

## 16. 与 Service Mesh 关系

- 传统 RPC 框架把治理做在 SDK（Dubbo/Spring Cloud）。
- Mesh 把治理下沉到 sidecar（Istio），应用无感知。
- 趋势：治理与业务解耦，但 Mesh 有运维成本。

## 17. 常见踩坑

1. **序列化不兼容**：升级改字段导致反序列化失败；IDL 向后兼容。
2. **服务发现单点**：注册中心挂导致无法发现；用高可用注册中心。
3. **超时链路不统一**：A→B→C 各超时叠加，整体超；设合理且递减。
4. **重试放大**：RPC 重试 + 上游重试，请求指数涨；限流+熔断。
5. **JSON 大对象性能差**：内部高频调用换 Protobuf。
6. **跨语言 schema 漂移**：两端定义不一；用 IDL 单一来源。

## 18. 性能调优

- 连接池/长连接复用，避免短连接开销。
- 合适序列化（二进制优于 JSON）。
- 批量接口减少 RPC 次数。
- 异步/并行调用（CompletableFuture）降延迟。
- 合理超时与重试预算。

## 19. 演进趋势

- REST 简化外部，RPC 提速内部。
- IDL 驱动契约优先（Contract-First）。
- Mesh 接管治理，框架聚焦传输。
- 多协议共存（网关转换）。

## 20. 小结

RPC 选型围绕"协议 + 序列化 + 治理 + 语言"四要素：Java 强治理选 Dubbo，Spring 生态选 Spring Cloud，跨语言高性能选 gRPC，C++ 高性能选 brpc。铁律：**用强契约 IDL 保兼容、服务发现高可用、超时链路递减设、重试必配熔断限流、内部高频用二进制序列化**。治理可下沉 Mesh 但与框架不冲突。
