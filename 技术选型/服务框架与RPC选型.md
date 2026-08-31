# 服务框架与 RPC 选型

> 板块：技术选型 　|　 返回：[README](README.md)

## 一、RPC vs HTTP

- **HTTP/JSON（REST）**：通用、易调试、跨语言好，但性能与类型弱。
- **RPC（gRPC/Dubbo/Thrift）**：二进制、强类型、高性能，适合内部服务间。

## 二、主流框架

| 框架 | 协议 | 特点 |
|------|------|------|
| gRPC | HTTP/2 + Protobuf | 跨语言、流式、云原生标配 |
| Dubbo | 自建/Triple | 阿里系，服务治理强 |
| Thrift | 多协议 | 跨语言、灵活 |
| Spring Cloud | HTTP | 全家桶、生态大 |

## 三、Dubbo 关键

- 注册中心（Nacos/ZK）、负载均衡、容错（failover/failsafe）。
- 按 tag 消费（见用户消息总线/RocketMQ 按 tag 消费实践）。
- 序列化：Hessian2 / Fastjson / Protobuf。

## 四、gRPC 关键

- Protobuf 定义契约，自动生成客户端/服务端。
- 支持四种流： unary / 服务端流 / 客户端流 / 双向流。
- 网关（Envoy/APISIX）做 gRPC-HTTP 转换。

## 五、服务治理要素

- 注册发现、负载均衡、熔断限流、重试、超时、链路追踪。
- 见 [SRE/README](../../SRE/README.md) 与 [架构/技术选型与决策实战](../../架构/技术选型与决策实战.md)。

## 六、选型建议

- 内部高频调用：gRPC/Dubbo。
- 对外 API：REST/GraphQL。
- 云原生：gRPC + Service Mesh。

## 七、常见坑

1. 超时设太长 → 雪崩。
2. 不降级 → 依赖故障拖垮主链路。
3. 版本不兼容 → Protobuf 字段乱。
4. 大对象 RPC → 序列化慢。

## 八、延伸阅读

- [架构/技术选型与决策实战](../../架构/技术选型与决策实战.md)
- [云原生/README](../../云原生/README.md)
