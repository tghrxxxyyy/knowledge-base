# gRPC（跨语言 RPC 框架 / 云原生通信协议）

> gRPC 是 Google 开源的**跨语言高性能 RPC 框架**，以「HTTP/2 多路复用 + Protobuf 二进制序列化 + IDL 契约优先 + 流式通信」成为云原生微服务通信的事实标准之一（CNCF 毕业项目）。相比 Dubbo（Java 服务治理强）、REST（JSON 弱类型/慢）、Thrift（生态弱），gRPC 以**跨语言、强契约、性能高**独树一帜。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 跨语言调用 | 多语言栈（Java/Go/Python/Node）之间高效通信 |
| 契约不一致 | 前后端/服务间接口定义漂移，联调成本高 |
| 性能瓶颈 | HTTP/1.1 + JSON 序列化慢、连接不能复用 |
| 长连接效率 | 频繁短连接（TCP 握手/HTTP 头开销）浪费资源 |
| 流式通信 | 实时推送/大文件传输需要流式而非一问一答 |

> 核心认知：**gRPC = HTTP/2 传输 + Protobuf 编码 + 契约优先（IDL）**——用「.proto 文件」统一接口契约，自动生成多语言代码。

---

## 二、gRPC 核心原理

### 2.1 整体架构

```
客户端                                  服务端
├── Stub（自动生成，接口调用入口）        ├── Service 实现（业务逻辑）
├── Channel（连接管理/负载均衡）         ├── gRPC Server（HTTP/2 监听）
├── 序列化（Protobuf）                  ├── 序列化（Protobuf）
└── HTTP/2（多路复用/流式/二进制帧）     └── HTTP/2

gRPC Web → Envoy 代理（gRPC-Web 协议转换）→ gRPC Server
```

### 2.2 IDL 契约（.proto 文件）

```proto
syntax = "proto3";

service UserService {
  rpc GetUser (GetUserRequest) returns (User);          // 一元调用
  rpc ListUsers (ListUsersRequest) returns (stream User); // 服务端流
  rpc UploadAvatar (stream Chunk) returns (UploadReply);  // 客户端流
  rpc Chat (stream Message) returns (stream Message);     // 双向流
}

message User {
  int64 id = 1;       // 字段编号 = 二进制编码的标识
  string name = 2;
  repeated string tags = 3;  // 数组
}
```

- **契约优先（Contract First）**：一份 .proto → protoc 生成 Java/Go/Python/C++/TS 等全部 Stub，接口永不漂移；
- **兼容性**：字段号一旦发布不可改（新增字段向后兼容，删除字段需预留编号）。

### 2.3 四种调用模式（RPC 类型）

| 模式 | 说明 | 典型场景 |
|------|------|----------|
| Unary | 一问一答（最常用） | 常规服务调用 |
| Server Streaming | 客户端发一次，服务端持续返回 | 订阅推送/大列表分页 |
| Client Streaming | 客户端持续发送，服务端返回一次 | 上传大文件/批量提交 |
| Bidi Streaming | 双向持续通信 | 实时聊天/实时协同 |

### 2.4 HTTP/2 带来的核心优势

```
HTTP/1.1: 一个连接一个请求（串行）→ 队头阻塞
HTTP/2:   一个连接多个流（多路复用）+ 头部压缩（HPACK）+ 二进制帧 + 流优先级
```

**选型关注点**：多路复用让长连接复用率极高（连接数从 N² 降到 N），是 gRPC 性能优于 REST 的根基。

### 2.5 Protobuf 编码（Varint + ZigZag + TLV）

- **Varint**：小整数用 1 字节（高位表示是否续段），数字越小编码越短；
- **Tag = 字段号<<3 | wire_type**：TLV 格式，解码不依赖 Schema 顺序；
- **对比 JSON**：同样 payload 体积约为 JSON 的 1/5~1/3，编解码 CPU 开销低一个量级。

**选型关注点**：Protobuf 不是人类可读的（调试需转 JSON 工具），适合内部服务通信而非对外 API。

---

## 三、gRPC 核心特性

| 特性 | 说明 |
|------|------|
| 跨语言 | 10+ 语言官方支持，protoc 生成 Stub |
| 高性能 | Protobuf + HTTP/2，比 REST/JSON 快 5~10 倍 |
| 流式通信 | 四种模式覆盖推送/上传/双向实时 |
| 强契约 | .proto 即文档，接口演进兼容 |
| 负载均衡 | 客户端侧 LB（多 DNS/自研 resolver） |
| 拦截器 | 客户端/服务端拦截器（鉴权/日志/熔断/metrics） |
| 超时/取消 | Deadline + Context 传播（分布式取消） |
| 元数据 | Header 自定义 KV（类似 HTTP Header） |
| TLS/mTLS | 原生支持，与 Envoy/Istio 无缝集成 |
| gRPC-Web | 浏览器通过代理调用 gRPC（前端可直连） |

---

## 四、gRPC vs Dubbo vs REST vs Thrift

| 维度 | gRPC | Dubbo | REST | Thrift |
|------|------|-------|------|--------|
| 传输 | HTTP/2 | TCP/HTTP2(Triple) | HTTP/1.1 | TCP |
| 序列化 | Protobuf | Hessian2/Protobuf | JSON | Thrift 二进制 |
| 契约 | IDL（强） | Java Interface（弱） | OpenAPI（可选） | IDL（强） |
| 跨语言 | 强 | Triple 支持 | 强 | 强 |
| 服务治理 | 弱（需自集成） | 强（路由/限流/降级） | 无 | 无 |
| 流式 | 四种模式 | 支持（Triple） | SSE 有限 | 支持 |
| 生态 | CNCF 云原生 | Java 生态 | 通用 | 中 |
| 学习成本 | 中（IDL） | 低（Java 注解） | 低 | 中 |

**选型关注点**：
- 跨语言 + 云原生 → **gRPC**；
- Java 微服务 + 强服务治理 → **Dubbo**（Triple 协议可互操作 gRPC）；
- 对外开放 API/浏览器直连 → **REST**（或 gRPC-Gateway 转 REST）。

---

## 五、gRPC 生产实践

### 5.1 生态配套

| 组件 | 说明 |
|------|------|
| grpc-gateway | proto 注释生成 REST 代理（对外 REST、对内 gRPC） |
| grpcurl | 命令行调试 gRPC 服务 |
| protoc-gen-validate | 参数校验代码生成 |
| Envoy/Istio | gRPC 原生转发、重试、超时、mTLS |
| grpc-health-probe | K8s 健康检查探针 |

### 5.2 关键配置

| 配置 | 建议 |
|------|------|
| Deadline 超时 | 必须设置（默认无限等待会拖垮调用链） |
| 消息大小上限 | 默认 4MB，大消息需调大 + 评估内存 |
| Keepalive | 设置 Ping 间隔（NAT 下防连接失效） |
| 拦截器顺序 | 鉴权→限流→日志→业务（责任链） |
| 重试策略 | 幂等操作可开重试（配合 Exponential Backoff） |

### 5.3 常见坑

- **阻塞式 stub 吃线程**：高并发用异步/流式 stub（或响应式框架）；
- **元数据过大**：Header 不能太大（HPACK 动态表膨胀）；
- **Deadline 传播**：Context 必须向下游传递（否则超时不生效）；
- **嵌套 message 循环引用**：proto 不支持循环依赖，需拆包。

---

## 六、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 跨语言微服务 | gRPC | Thrift |
| Java 微服务+治理 | Dubbo（Triple） | gRPC |
| 浏览器/App 直连 | REST / gRPC-Web | — |
| 双向实时通信 | gRPC Bidi | WebSocket |
| 服务网格通信 | gRPC + Istio | — |
| 对外 API + 对内 gRPC | grpc-gateway | — |

---

## 七、与其他板块的关系

- Dubbo 对比见「[Apache Dubbo RPC 框架](./ApacheDubboRPC框架.md)」；
- Envoy（gRPC 原生代理/网关转换）见「[Envoy 服务代理](./Envoy服务代理.md)」；
- 网络协议（HTTP/2/HTTP/3）见「[网络协议深挖](../网络协议深挖.md)」；
- 云原生通信见「[云原生/Service Mesh](../../云原生/ServiceMesh.md)」。

> 一句话：**gRPC = HTTP/2（多路复用）+ Protobuf（紧凑二进制）+ IDL 契约（跨语言）+ 四模式流式；选型先看「语言栈（跨语言→gRPC，纯 Java→Dubbo）」，再定「通信形态（一元/流式）」，最后配「超时 Deadline + 拦截器 + 网关（grpc-gateway/Envoy）」**。
