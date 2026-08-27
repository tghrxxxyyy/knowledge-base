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
- **ZigZag**：负数映射为无符号数，避免大整数编码膨胀；
- **Tag = 字段号<<3 | wire_type**：TLV 格式，解码不依赖 Schema 顺序；
- **对比 JSON**：同样 payload 体积约为 JSON 的 1/5~1/3，编解码 CPU 开销低一个量级。

**选型关注点**：Protobuf 不是人类可读的（调试需转 JSON 工具），适合内部服务通信而非对外 API。

### 2.6 完整调用链路

```
Client Stub 调用
  → 序列化参数为 Protobuf 二进制
  → 组装 HTTP/2 帧（含 gRPC 帧头：1字节压缩标志 + 4字节长度）
  → 通过 Channel 选连接发送（多路复用共享连接）
  → 服务端 gRPC Server 解码分发到对应 Service 方法
  → 返回结果序列化回传

超时/取消通过 gRPC-Timeout Header + Context 传播
元数据通过 :path + 自定义 Header 传递
```

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
| 健康检查 | grpc-health-probe 原生支持 K8s 探针 |
| 反射 | Server Reflection 让 grpcurl 动态调用 |

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
| buf | 新一代 proto 管理/编译工具（替代 protoc 部分场景） |

### 5.2 关键配置

| 配置 | 建议 |
|------|------|
| Deadline 超时 | 必须设置（默认无限等待会拖垮调用链） |
| 消息大小上限 | 默认 4MB，大消息需调大 + 评估内存 |
| Keepalive | 设置 Ping 间隔（NAT 下防连接失效） |
| 拦截器顺序 | 鉴权→限流→日志→业务（责任链） |
| 重试策略 | 幂等操作可开重试（配合 Exponential Backoff） |
| 连接池 | Channel 复用 + 负载均衡策略（round_robin/pick_first） |

### 5.3 常见坑

- **阻塞式 stub 吃线程**：高并发用异步/流式 stub（或响应式框架）；
- **元数据过大**：Header 不能太大（HPACK 动态表膨胀）；
- **Deadline 传播**：Context 必须向下游传递（否则超时不生效）；
- **嵌套 message 循环引用**：proto 不支持循环依赖，需拆包；
- **流式内存泄漏**：大流需背压/限流，防止接收端内存被打满；
- **跨语言类型映射**：timestamp/decimal 需注意各语言映射差异（用 well-known types）。

### 5.4 与网关/服务网格集成

```
gRPC 在云原生中的位置：
  网关：grpc-gateway（REST 转 gRPC）或 Envoy（HTTP/2 透传）
  服务网格：Istio 对 gRPC 原生支持（mTLS/重试/超时/金丝雀）
  可观测：OpenTelemetry gRPC 拦截器注入 trace
```

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

---

## 六、gRPC 拦截器（Interceptors）

gRPC 拦截器类似 Servlet Filter，分为 Unary 和 Streaming 两种：

### 6.1 Unary 拦截器

```go
// 服务端拦截器（Go 示例）
func loggingInterceptor(ctx context.Context, req interface{}, 
    info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
    start := time.Now()
    resp, err := handler(ctx, req)
    log.Printf("method=%s duration=%v err=%v", info.FullMethod, time.Since(start), err)
    return resp, err
}

server := grpc.NewServer(grpc.UnaryInterceptor(loggingInterceptor))
```

### 6.2 拦截器链

```
请求 → [鉴权拦截器] → [日志拦截器] → [限流拦截器] → [业务方法]
响应 → [Metrics拦截器] → [错误处理拦截器] → 返回
```

### 6.3 常见拦截器用途

| 用途 | 说明 |
|------|------|
| 鉴权 | JWT/Token 校验 |
| 日志 | 请求/响应日志记录 |
| 限流 | 基于令牌桶/滑动窗口 |
| Metrics | 延迟/吞吐/错误率采集 |
| 超时注入 | Deadline 传播 |
| 重试 | 自动重试（幂等操作） |
| 链路追踪 | OpenTelemetry Span 注入 |

---

## 七、gRPC 负载均衡策略

gRPC 客户端侧负载均衡（不同于 Dubbo 服务端侧）：

```
客户端 Channel
  ├── Name Resolver（服务发现：DNS/Consul/K8s）
  ├── Balancer（负载均衡策略）
  │   ├── pick_first（默认，选第一个）
  │   └── round_robin（轮询所有连接）
  └── Subconnections（每个后端一个连接）
```

| 策略 | 说明 |
|------|------|
| pick_first | 默认，连接第一个健康实例 |
| round_robin | 轮询所有可用连接 |
| weighted_round_robin | 加权轮询（需自定义） |

**与 Istio 集成**：Istio 通过 xDS 下发负载均衡策略，gRPC 客户端自动应用。

---

## 八、gRPC 错误处理

```protobuf
// 定义错误码
enum ErrorCode {
  OK = 0;
  INVALID_ARGUMENT = 3;
  NOT_FOUND = 5;
  ALREADY_EXISTS = 6;
  PERMISSION_DENIED = 7;
  UNAVAILABLE = 14;
}
```

| gRPC 状态码 | HTTP 等价码 | 说明 |
|-------------|-------------|------|
| OK | 200 | 成功 |
| INVALID_ARGUMENT | 400 | 参数错误 |
| NOT_FOUND | 404 | 资源不存在 |
| ALREADY_EXISTS | 409 | 资源已存在 |
| PERMISSION_DENIED | 403 | 无权限 |
| UNAUTHENTICATED | 401 | 未认证 |
| RESOURCE_EXHAUSTED | 429 | 资源耗尽（限流） |
| UNAVAILABLE | 503 | 服务不可用 |
| INTERNAL | 500 | 内部错误 |
| DEADLINE_EXCEEDED | 504 | 超时 |

**最佳实践**：用 `google.rpc.Status` 携带错误详情（`google.rpc.ErrorInfo` + `google.rpc.BadRequest`）。

---

## 九、gRPC 与 Envoy/Istio 集成

```
Envoy 对 gRPC 的原生支持：
  ├── HTTP/2 透传（无需协议转换）
  ├── gRPC-JSON 转码（gRPC ↔ REST）
  ├── gRPC-Web（浏览器直连）
  ├── 重试/超时（xDS 下发）
  ├── mTLS（自动双向认证）
  └── 链路追踪（自动注入 Span）
```

**Envoy gRPC 转码示例**：

```yaml
http_filters:
- name: envoy.filters.http.grpc_json_transcoder
  typed_config:
    "@type": type.googleapis.com/envoy.extensions.filters.http.grpc_json_transcoder.v3.GrpcJsonTranscoder
    proto_descriptor: /etc/envoy/proto.pb
    services: ["mypackage.UserService"]
```

---

## 十、gRPC 性能调优

| 维度 | 建议 |
|------|------|
| 连接复用 | 一个 Channel 复用所有请求（避免 N² 连接） |
| 流式 | 大数据用流式而非多次 Unary |
| Protobuf | 避免嵌套过深/大 repeated 字段 |
| 消息大小 | 默认 4MB，大消息调 `MaxRecvMsgSize` |
| Keepalive | 设置 Ping 间隔（NAT 防连接失效） |
| 拦截器 | 鉴权/日志拦截器异步执行 |
| 压缩 | 启用 gzip/snappy（CPU 换带宽） |

---

## 十三、gRPC 双向流式通信

### 13.1 四种流模式详解

| 模式 | 方向 | Proto 定义 | 典型场景 |
|------|------|-----------|---------|
| Unary | C ↔ S | `rpc Get(Req) returns (Resp)` | 常规 RPC |
| Server Streaming | C → S（单次），S → C（多次） | `rpc List(Req) returns (stream Resp)` | 推送/分页/订阅 |
| Client Streaming | C → S（多次），S → C（单次） | `rpc Upload(stream Chunk) returns (Resp)` | 文件上传/批量提交 |
| Bidi Streaming | C ↔ S（双向多次） | `rpc Chat(stream Msg) returns (stream Msg)` | 实时聊天/协同 |

### 13.2 双向流式实现（Go）

```go
// 服务端实现
func (s *chatServer) Chat(stream pb.Chat_ChatServer) error {
    for {
        msg, err := stream.Recv()
        if err == io.EOF {
            return nil
        }
        if err != nil {
            return err
        }
        // 处理消息并回复
        reply := &pb.Message{Content: "echo: " + msg.Content}
        if err := stream.Send(reply); err != nil {
            return err
        }
    }
}

// 客户端实现
stream, _ := client.Chat(context.Background())
go func() {
    for {
        msg, err := stream.Recv()
        if err == io.EOF { break }
        fmt.Println("Received:", msg.Content)
    }
}()
for i := 0; i < 10; i++ {
    stream.Send(&pb.Message{Content: fmt.Sprintf("msg %d", i)})
}
stream.CloseSend()
```

### 13.3 流式背压控制

```
背压问题：
  发送端太快 → 接收端处理不过来 → 内存溢出

gRPC 流式背压：
  Flow Control（HTTP/2 窗口机制）
  接收端消费慢 → 窗口满 → 发送端自动暂停
  
实践要点：
  设置合理缓冲区大小
  接收端及时消费（不阻塞）
  监控 stream pending bytes
```

---

## 十四、gRPC Deadline/Timeout

### 14.1 Deadline 原理

```
gRPC Deadline = 分布式超时机制
  客户端设置 Deadline → 通过 gRPC-Timeout Header 传播
  每个中间服务自动扣减已用时间
  Deadline 到达 → 自动取消请求 → 返回 DEADLINE_EXCEEDED
```

### 14.2 Deadline 配置

```go
// Go：设置 5 秒 Deadline
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()
resp, err := client.GetUser(ctx, &pb.GetUserRequest{Id: 123})

// Java：设置 Deadline
ResponseObserver observer = new ResponseObserver<>();
stub.withDeadlineAfter(5, TimeUnit.SECONDS)
    .getUser(request, observer);
```

### 14.3 Deadline 最佳实践

| 实践 | 说明 |
|------|------|
| 必须设置 | 默认无限等待会拖垮调用链 |
| 入口最长 | 入口服务 Deadline = 整条链路最长时间 |
| 逐级缩短 | 每层预留缓冲（如入口 10s，下游 5s） |
| Context 传播 | 向下游传递 Deadline（否则超时不生效） |
| 区分超时 | 读超时 / 写超时 / 总超时 |

---

## 十五、gRPC 错误处理模式

### 15.1 错误码体系

| 状态码 | 含义 | HTTP 等价 | 使用场景 |
|--------|------|----------|---------|
| OK | 成功 | 200 | 正常响应 |
| INVALID_ARGUMENT | 参数错误 | 400 | 请求参数校验 |
| NOT_FOUND | 不存在 | 404 | 资源未找到 |
| ALREADY_EXISTS | 已存在 | 409 | 重复创建 |
| PERMISSION_DENIED | 无权限 | 403 | 鉴权失败 |
| UNAUTHENTICATED | 未认证 | 401 | Token 无效 |
| RESOURCE_EXHAUSTED | 资源耗尽 | 429 | 限流 |
| FAILED_PRECONDITION | 前置条件不满足 | 412 | 业务校验 |
| ABORTED | 操作被中止 | 409 | 事务冲突 |
| UNAVAILABLE | 不可用 | 503 | 服务不可用 |
| DATA_LOSS | 数据丢失 | 500 | 不可恢复错误 |
| UNIMPLEMENTED | 未实现 | 501 | 功能未实现 |
| INTERNAL | 内部错误 | 500 | 服务端异常 |
| DEADLINE_EXCEEDED | 超时 | 504 | 请求超时 |

### 15.2 错误详情携带

```protobuf
// 使用 google.rpc.Status 携带详细错误信息
import "google/rpc/error_details.proto";

// 错误响应示例
{
  "code": 3,
  "message": "invalid argument",
  "details": [
    {
      "@type": "type.googleapis.com/google.rpc.BadRequest",
      "field_violations": [
        {"field": "email", "description": "invalid email format"}
      ]
    },
    {
      "@type": "type.googleapis.com/google.rpc.ErrorInfo",
      "reason": "INVALID_EMAIL",
      "domain": "user-service"
    }
  ]
}
```

### 15.3 错误处理最佳实践

```
错误处理三原则：
  1. 区分可重试/不可重试错误
     可重试：UNAVAILABLE / DEADLINE_EXCEEDED / RESOURCE_EXHAUSTED
     不可重试：INVALID_ARGUMENT / NOT_FOUND / PERMISSION_DENIED

  2. 携带丰富错误详情
     使用 google.rpc.Status + ErrorInfo
     包含错误码/字段/原因/ domain

  3. 客户端重试策略
     幂等操作：自动重试 + 指数退避
     非幂等操作：不重试 + 返回错误
```

---

## 十六、gRPC 负载均衡深入

### 16.1 客户端侧负载均衡

```
gRPC 负载均衡架构：
  Client Channel
    ├── Name Resolver（服务发现）
    │   ├── DNS Resolver（DNS 轮询）
    │   ├── Consul Resolver
    │   └── K8s Resolver
    ├── Balancer（负载均衡策略）
    │   ├── pick_first（默认，选第一个）
    │   ├── round_robin（轮询所有连接）
    │   └── weighted_round_robin（加权轮询）
    └── Subconnections（每个后端一个连接）
```

### 16.2 负载均衡配置

```go
// Go：round_robin 负载均衡
conn, _ := grpc.Dial(
    "dns:///my-service.default.svc.cluster.local:8080",
    grpc.WithDefaultServiceConfig(`{"loadBalancingPolicy":"round_robin"}`),
    grpc.WithInsecure(),
)

// Java：自定义负载均衡
ManagedChannel channel = ManagedChannelBuilder
    .forAddress("my-service", 8080)
    .defaultLoadBalancingPolicy("round_robin")
    .build();
```

### 16.3 代理模式 vs 客户端模式

| 模式 | 优点 | 缺点 |
|------|------|------|
| 客户端侧 LB | 低延迟（直连） | 客户端复杂 |
| 代理模式 LB（Envoy） | 简单（客户端无感知） | 多一跳延迟 |
| 服务网格（Istio） | 统一治理 | 运维复杂 |

### 16.4 gRPC 与 Envoy 集成

```
Envoy 作为 gRPC 代理：
  HTTP/2 透传（无需协议转换）
  自动服务发现（xDS）
  负载均衡（轮询/一致性哈希）
  重试/超时（可配置）
  mTLS（自动双向认证）
  链路追踪（自动注入 Span）

典型架构：
  Client → Envoy Sidecar → gRPC Server
    或
  Client → Envoy（L7 LB）→ gRPC Server 集群
```

---

## 十七、gRPC in Go vs Java

### 17.1 Go gRPC 特点

```go
// Go gRPC 特点：
// 1. 原生支持（gRPC 最早语言）
// 2. goroutine 天然适合流式
// 3. 性能极佳
// 4. 代码生成：protoc-gen-go-grpc

// 流式处理天然优雅
func (s *server) Stream(req *pb.Request, stream pb.Service_StreamServer) error {
    for i := 0; i < 100; i++ {
        stream.Send(&pb.Response{Data: fmt.Sprintf("item %d", i)})
    }
    return nil
}
```

### 17.2 Java gRPC 特点

```java
// Java gRPC 特点：
// 1. 生态丰富（与 Spring/Spring Boot 集成好）
// 2. 阻塞式 stub 需注意线程池
// 3. 异步 stub / 响应式支持
// 4. 代码生成：protobuf-java + grpc-java

// 异步客户端（避免线程阻塞）
stub.getUser(request, new StreamObserver<User>() {
    @Override
    public void onNext(User user) { /* 处理响应 */ }
    @Override
    public void onError(Throwable t) { /* 错误处理 */ }
    @Override
    public void onCompleted() { /* 完成 */ }
});
```

### 17.3 Go vs Java gRPC 对比

| 维度 | Go gRPC | Java gRPC |
|------|---------|-----------|
| 性能 | 极佳 | 好 |
| 内存占用 | 低 | 中 |
| 并发模型 | goroutine（轻量） | 线程池（较重） |
| 流式处理 | 天然优雅 | 需异步 stub |
| 生态集成 | 轻量 | Spring 生态丰富 |
| 学习曲线 | 低 | 中 |
| 适用 | 云原生/微服务 | Java 企业应用 |

---

## 十八、gRPC-Web

### 18.1 gRPC-Web 架构

```
浏览器（JavaScript）
  → gRPC-Web 协议（HTTP/1.1 或 HTTP/2）
    → Envoy 代理（协议转换）
      → gRPC Server（HTTP/2）

转换层：
  Envoy gRPC-Web Filter
    将 gRPC-Web 请求转换为标准 gRPC
    将 gRPC 响应转换为 gRPC-Web
```

### 18.2 gRPC-Web 使用

```javascript
// gRPC-Web 客户端
const {grpc} = require('grpc-web');
const {UserServiceClient} = require('./generated/UserServiceClientPb');

const client = new UserServiceClient('https://api.example.com');
const request = new GetUserRequest();
request.setId(123);

client.getUser(request, {}, (err, response) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log(response.getUser());
});
```

### 18.3 gRPC-Web 限制

| 限制 | 说明 | 解决方案 |
|------|------|---------|
| 仅支持 Unary + Server Streaming | 不支持 Client/Bidi Streaming | 使用 WebSocket |
| 需要代理层 | 浏览器不能直连 gRPC | Envoy 代理 |
| 浏览器兼容性 | 需要 fetch/XHR 支持 | polyfill |

---

## 十九、gRPC 反射与健康检查

### 19.1 gRPC 服务反射

```go
// 启用 Server Reflection（Go）
import "google.golang.org/grpc/reflection"

func main() {
    s := grpc.NewServer()
    pb.RegisterUserServiceServer(s, &server{})
    reflection.Register(s)  // 启用反射
    s.Serve(lis)
}

// 使用 grpcurl 调试
grpcurl -plaintext localhost:8080 list
grpcurl -plaintext localhost:8080 describe mypackage.UserService
grpcurl -plaintext -d '{"id": 123}' localhost:8080 mypackage.UserService/GetUser
```

### 19.2 gRPC 健康检查

```protobuf
// gRPC Health Checking Protocol
syntax = "proto3";
package grpc.health.v1;

service Health {
  rpc Check(HealthCheckRequest) returns (HealthCheckResponse);
  rpc Watch(HealthCheckRequest) returns (stream HealthCheckResponse);
}

message HealthCheckRequest {
  string service = 1;
}

message HealthCheckResponse {
  enum ServingStatus {
    UNKNOWN = 0;
    SERVING = 1;
    NOT_SERVING = 2;
    SERVICE_UNKNOWN = 3;
  }
  ServingStatus status = 1;
}
```

### 19.3 K8s 健康检查集成

```yaml
# K8s Pod 健康检查配置
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: grpc-server
    livenessProbe:
      exec:
        command:
        - /grpc-health-probe
        - -addr=:8080
      initialDelaySeconds: 10
      periodSeconds: 10
    readinessProbe:
      exec:
        command:
        - /grpc-health-probe
        - -addr=:8080
        - -service=my-service
      initialDelaySeconds: 5
      periodSeconds: 5
```

---

## 二十、gRPC vs REST 性能对比

### 20.1 性能基准测试

| 指标 | gRPC | REST/JSON |
|------|------|-----------|
| 序列化大小 | ~1/5 | 基准 |
| 序列化速度 | ~10x | 基准 |
| 传输速度 | ~2x | 基准 |
| 连接复用 | HTTP/2 多路复用 | HTTP/1.1 串行 |
| 延迟（P99） | 低 | 中 |
| CPU 开销 | 低 | 中（JSON 解析） |

### 20.2 适用场景对比

| 场景 | gRPC | REST |
|------|------|------|
| 内部微服务通信 | 极佳 | 一般 |
| 浏览器直连 | 需 gRPC-Web | 极佳 |
| 对外开放 API | 需 grpc-gateway | 极佳 |
| 实时流式通信 | 极佳 | SSE/WebSocket |
| 跨语言调用 | 极佳 | 极佳 |
| 调试便利性 | 需 grpcurl | curl 即可 |
| 人类可读 | 不可读（二进制） | 可读（JSON） |

### 20.3 性能优化建议

```
gRPC 性能优化：
  1. 连接复用：一个 Channel 复用所有请求
  2. 流式传输：大数据用流式替代多次 Unary
  3. 压缩：启用 gzip/snappy（CPU 换带宽）
  4. 消息大小：合理设置 MaxRecvMsgSize
  5. Keepalive：设置 Ping 间隔防连接失效
  6. 拦截器异步：鉴权/日志拦截器异步执行
```

---

## 十一、gRPC 高级特性与生产实践

### 11.1 Server Streaming 模式

```protobuf
// Proto 定义
service MarketDataService {
  rpc SubscribePrices (PriceRequest) returns (stream PriceUpdate);
  rpc GetHistoricalData (HistoryRequest) returns (stream HistoricalRecord);
}

message PriceRequest {
  repeated string symbols = 1;
}

message PriceUpdate {
  string symbol = 1;
  double price = 2;
  int64 timestamp = 3;
}
```

```java
// 服务端实现
@Override
public void subscribePrices(PriceRequest request, StreamObserver<PriceUpdate> responseObserver) {
    // 后台线程推送价格更新
    ScheduledExecutorService executor = Executors.newScheduledThreadPool(1);
    executor.scheduleAtFixedRate(() -> {
        for (String symbol : request.getSymbolsList()) {
            PriceUpdate update = PriceUpdate.newBuilder()
                .setSymbol(symbol)
                .setPrice(getCurrentPrice(symbol))
                .setTimestamp(System.currentTimeMillis())
                .build();
            responseObserver.onNext(update);
        }
    }, 0, 1, TimeUnit.SECONDS);

    // 客户端取消时清理资源
    responseObserver.setOnCancelHandler(() -> {
        executor.shutdownNow();
    });
}

// 客户端调用
stub.subscribePrices(request, new StreamObserver<PriceUpdate>() {
    @Override
    public void onNext(PriceUpdate update) {
        System.out.println(update.getSymbol() + ": " + update.getPrice());
    }

    @Override
    public void onError(Throwable t) {
        System.err.println("Error: " + t.getMessage());
    }

    @Override
    public void onCompleted() {
        System.out.println("Stream completed");
    }
});
```

### 11.2 客户端负载均衡

```java
// Round-Robin 负载均衡
ManagedChannel channel = ManagedChannelBuilder.forAddress("dns:///my-service", 8080)
    .defaultLoadBalancingPolicy("round_robin")
    .usePlaintext()
    .build();

// Pick-First 负载均衡（默认）
ManagedChannel channel = ManagedChannelBuilder.forAddress("dns:///my-service", 8080)
    .defaultLoadBalancingPolicy("pick_first")
    .usePlaintext()
    .build();

// 自定义负载均衡
public class CustomLoadBalancer extends LoadBalancer {
    private final List<Subchannel> subchannels = new CopyOnWriteArrayList<>();

    @Override
    protected void handleResolvedAddresses(ResolvedAddresses resolvedAddresses) {
        subchannels.clear();
        for (Object address : resolvedAddresses.getAddresses()) {
            Subchannel subchannel = createSubchannel(SubchannelArgs.newBuilder()
                .setAddresses((EquivalentAddressGroup) address)
                .build());
            subchannels.add(subchannel);
            subchannel.start();
        }
    }

    @Override
    protected void handleNameResolutionError(Status error) {
        // 处理名称解析错误
    }

    @Override
    public void requestConnection() {
        // 主动建立连接
    }

    private int index = 0;
    @Override
    public Subchannel pick(PickSubchannelArgs args) {
        // Round-Robin 选择
        Subchannel subchannel = subchannels.get(index % subchannels.size());
        index++;
        return subchannel;
    }
}
```

### 11.3 Deadline 传播

```java
// 设置 Deadline
UserProto.User request = UserProto.User.newBuilder()
    .setId(123)
    .build();

// 3 秒超时
UserProto.User response = userStub.getUser(request,
    CallOptions.DEFAULT.withDeadlineAfter(3, TimeUnit.SECONDS));

// Deadline 传播到下游服务
@Override
public void getUser(UserRequest request, StreamObserver<User> responseObserver) {
    // 获取当前 Deadline
    Deadline currentDeadline = Context.current().getDeadline();
    if (currentDeadline != null) {
        // 计算剩余时间
        long remainingMs = currentDeadline.timeRemaining(TimeUnit.MILLISECONDS);
        // 传递给下游服务
        OrderProto.OrderResponse orderResponse = orderStub.getOrder(
            OrderRequest.newBuilder().setUserId(request.getId()).build(),
            CallOptions.DEFAULT.withDeadlineAfter(remainingMs, TimeUnit.MILLISECONDS));
    }
}
```

### 11.4 状态码最佳实践

```text
gRPC 状态码使用场景：
┌──────────────────────┬────────────────────────────────────────────┐
│ 状态码                │ 使用场景                                    │
├──────────────────────┼────────────────────────────────────────────┤
│ OK                   │ 成功                                        │
│ CANCEL               │ 客户端取消                                  │
│ UNKNOWN              │ 未知错误（未处理的异常）                    │
│ INVALID_ARGUMENT     │ 参数校验失败                                │
│ DEADLINE_EXCEEDED    │ 超时                                        │
│ NOT_FOUND            │ 资源不存在                                  │
│ ALREADY_EXISTS       │ 资源已存在                                  │
│ PERMISSION_DENIED    │ 权限不足                                    │
│ RESOURCE_EXHAUSTED   │ 资源耗尽（限流）                            │
│ FAILED_PRECONDITION  │ 前置条件不满足                              │
│ ABORTED              │ 操作被中止（事务冲突）                      │
│ OUT_OF_RANGE         │ 参数超出范围                                │
│ UNIMPLEMENTED        │ 未实现                                      │
│ INTERNAL             │ 内部错误                                    │
│ UNAVAILABLE          │ 服务不可用                                  │
│ DATA_LOSS            │ 数据丢失                                    │
│ UNAUTHENTICATED      │ 未认证                                      │
└──────────────────────┴────────────────────────────────────────────┘
```

```java
// 状态码抛出示例
public void getUser(UserRequest request, StreamObserver<User> responseObserver) {
    if (request.getId() <= 0) {
        responseObserver.onError(Status.INVALID_ARGUMENT
            .withDescription("ID must be positive")
            .asRuntimeException());
        return;
    }

    User user = userRepository.findById(request.getId());
    if (user == null) {
        responseObserver.onError(Status.NOT_FOUND
            .withDescription("User not found: " + request.getId())
            .augmentDescription("Please check the user ID")
            .asRuntimeException());
        return;
    }

    responseObserver.onNext(user);
    responseObserver.onCompleted();
}
```

### 11.5 重试策略

```java
// 客户端重试配置
ManagedChannel channel = ManagedChannelBuilder.forAddress("localhost", 8080)
    .defaultServiceConfig(ServiceConfig.newBuilder()
        .loadBalancingPolicyConfig(RoundRobinConfig.getInstance())
        .setMethodConfig(MethodConfig.newBuilder()
            .addMethods(MethodConfig.newBuilder()
                .setName(MethodDescriptor.newBuilder()
                    .setService("my.service.UserService")
                    .setMethod("GetUser")
                    .build())
                .build())
            .setRetryPolicy(RetryPolicy.newBuilder()
                .setMaxAttempts(3)
                .setInitialBackoff("0.1s")
                .setMaxBackoff("5s")
                .setBackoffMultiplier(2)
                .setRetryableStatusCodes("UNAVAILABLE", "DEADLINE_EXCEEDED")
                .build())
            .build())
        .build())
    .usePlaintext()
    .build();

// 配置文件方式（推荐）
// grpc-retry-policy.json
{
  "methodConfig": [{
    "name": [{"service": "my.service.UserService"}],
    "retryPolicy": {
      "maxAttempts": 3,
      "initialBackoff": "0.1s",
      "maxBackoff": "5s",
      "backoffMultiplier": 2,
      "retryableStatusCodes": ["UNAVAILABLE"]
    }
  }]
}
```

### 11.6 Health Checking Protocol

```protobuf
// gRPC Health Checking 定义
service Health {
  rpc Check (HealthCheckRequest) returns (HealthCheckResponse);
  rpc Watch (HealthCheckRequest) returns (stream HealthCheckResponse);
}

message HealthCheckRequest {
  string service = 1;
}

message HealthCheckResponse {
  enum ServingStatus {
    UNKNOWN = 0;
    SERVING = 1;
    NOT_SERVING = 2;
  }
  ServingStatus status = 1;
}
```

```java
// 服务端健康检查实现
public class HealthServiceImpl extends HealthGrpc.HealthImplBase {
    private final Map<String, ServingStatus> serviceStatus = new ConcurrentHashMap<>();

    @Override
    public void check(HealthCheckRequest request, StreamObserver<HealthCheckResponse> responseObserver) {
        ServingStatus status = serviceStatus.getOrDefault(request.getService(), ServingStatus.UNKNOWN);
        responseObserver.onNext(HealthCheckResponse.newBuilder()
            .setStatus(status)
            .build());
        responseObserver.onCompleted();
    }

    @Override
    public void watch(HealthCheckRequest request, StreamObserver<HealthCheckResponse> responseObserver) {
        // 初始状态
        ServingStatus status = serviceStatus.getOrDefault(request.getService(), ServingStatus.UNKNOWN);
        responseObserver.onNext(HealthCheckResponse.newBuilder()
            .setStatus(status)
            .build());

        // 监听状态变化
        serviceStatus.addListener(() -> {
            ServingStatus newStatus = serviceStatus.get(request.getService());
            responseObserver.onNext(HealthCheckResponse.newBuilder()
                .setStatus(newStatus)
                .build());
        });
    }

    public void setStatus(String service, ServingStatus status) {
        serviceStatus.put(service, status);
    }
}
```

### 11.7 微服务拦截器（认证/日志）

```java
// 服务端认证拦截器
public class AuthServerInterceptor implements ServerInterceptor {
    @Override
    public <ReqT, RespT> ServerCall.Listener<ReqT> interceptCall(
            ServerCall<ReqT, RespT> call,
            Metadata headers,
            ServerCallHandler<ReqT, RespT> next) {

        // 提取 Token
        String token = headers.get(AUTHORIZATION_KEY);
        if (token == null || !token.startsWith("Bearer ")) {
            call.close(Status.UNAUTHENTICATED.withDescription("Missing token"), headers);
            return new ServerCall.Listener<>() {};
        }

        // 验证 Token
        try {
            Claims claims = JwtUtil.validateToken(token.substring(7));
            Context context = Context.current()
                .withValue(USER_ID_KEY, claims.getSubject())
                .withValue(ROLES_KEY, claims.get("roles"));
            return Contexts.interceptCall(context, call, headers, next);
        } catch (Exception e) {
            call.close(Status.UNAUTHENTICATED.withDescription("Invalid token"), headers);
            return new ServerCall.Listener<>() {};
        }
    }
}

// 日志拦截器
public class LoggingServerInterceptor implements ServerInterceptor {
    private static final Logger logger = LoggerFactory.getLogger(LoggingServerInterceptor.class);

    @Override
    public <ReqT, RespT> ServerCall.Listener<ReqT> interceptCall(
            ServerCall<ReqT, RespT> call,
            Metadata headers,
            ServerCallHandler<ReqT, RespT> next) {

        long start = System.currentTimeMillis();
        String method = call.getMethodDescriptor().getFullMethodName();

        logger.info("gRPC call started: {}", method);

        return new ServerCall.Listener<>() {
            @Override
            public void onMessage(ReqT message) {
                logger.info("gRPC message received: {}", message);
            }

            @Override
            public void onHalfClose() {
                try {
                    next.startCall(call, headers);
                } finally {
                    long duration = System.currentTimeMillis() - start;
                    logger.info("gRPC call completed: {} in {}ms", method, duration);
                }
            }
        };
    }
}
```

### 11.8 性能调优

```text
gRPC 性能调优清单：
┌──────────────────────┬────────────────────────────────────────────┐
│ 调优项                │ 配置方式                                    │
├──────────────────────┼────────────────────────────────────────────┤
│ 连接复用              │ 使用 ManagedChannel 长连接                  │
│ 流式传输              │ 大数据用 Server/Client Streaming            │
│ 压缩                  │ 使用 gzip/snappy                           │
│ 消息大小              │ 合理设置 MaxSendMsgSize/MaxRecvMsgSize     │
│ Keepalive             │ 设置 Ping 间隔防连接失效                    │
│ 拦截器异步            │ 鉴权/日志拦截器异步执行                     │
│ 线程池                │ 使用异步 Stub + 业务线程池                  │
│ HTTP/2                │ 启用 HTTP/2 多路复用                       │
│ Protobuf 优化          │ 使用 proto3 + optional 字段               │
│ 流控                  │ 设置窗口大小                               │
└──────────────────────┴────────────────────────────────────────────┘
```

```java
// 性能调优配置
ManagedChannel channel = ManagedChannelBuilder.forAddress("localhost", 8080)
    .maxInboundMessageSize(1024 * 1024 * 10)  // 10MB
    .maxInboundMetadataSize(1024 * 1024)       // 1MB
    .enableRetry()
    .keepAliveTime(30, TimeUnit.SECONDS)
    .keepAliveTimeout(5, TimeUnit.SECONDS)
    .usePlaintext()
    .build();

// 启用压缩
stub.withCompression("gzip").getUser(request);

// 异步 Stub
AsyncUserStub asyncStub = UserGrpc.newAsyncStub(channel);
asyncStub.getUser(request, new StreamObserver<User>() {
    @Override
    public void onNext(User user) {
        // 异步处理
    }

    @Override
    public void onError(Throwable t) {
        // 错误处理
    }

    @Override
    public void onCompleted() {
        // 完成处理
    }
```

## gRPC 四种调用模式（Unary/Server-Stream/Client-Stream/Bidirectional）

### 1. Unary RPC（一元调用）

```protobuf
service UserService {
  rpc GetUser (GetUserRequest) returns (UserResponse);
}
```

```java
// 客户端
UserResponse response = stub.getUser(request);

// 服务端
@Override
public void getUser(GetUserRequest request, StreamObserver<UserResponse> responseObserver) {
    UserResponse response = UserResponse.newBuilder().setName("John").build();
    responseObserver.onNext(response);
    responseObserver.onCompleted();
}
```

### 2. Server Streaming RPC（服务端流）

```protobuf
service UserService {
  rpc ListUsers (ListUsersRequest) returns (stream UserResponse);
}
```

```java
// 客户端
stub.listUsers(request, new StreamObserver<UserResponse>() {
    @Override
    public void onNext(UserResponse user) { /* 处理每个用户 */ }
    @Override
    public void onCompleted() { /* 流结束 */ }
});
```

### 3. Client Streaming RPC（客户端流）

```protobuf
service UserService {
  rpc UploadUsers (stream UserRequest) returns (UploadResponse);
}
```

### 4. Bidirectional Streaming RPC（双向流）

```protobuf
service UserService {
  rpc Chat (stream ChatMessage) returns (stream ChatMessage);
}
```

## gRPC 拦截器（Unary/Stream Interceptor）

### Unary Interceptor

```java
// 服务端拦截器
public class AuthInterceptor implements ServerInterceptor {
    @Override
    public <ReqT, RespT> ServerCall.Listener<ReqT> interceptCall(
        ServerCall<ReqT, RespT> call,
        Metadata headers,
        ServerCallHandler<ReqT, RespT> next) {
        
        // 鉴权逻辑
        String token = headers.get(AUTHORIZATION_KEY);
        if (!validateToken(token)) {
            call.close(Status.UNAUTHENTICATED.withDescription("Invalid token"), headers);
            return new ServerCall.Listener<ReqT>() {};
        }
        return next.startCall(call, headers);
    }
}

// 注册拦截器
ServerBuilder.forPort(8080)
    .intercept(new AuthInterceptor())
    .addService(new UserServiceImpl())
    .build();
```

### Client Interceptor

```java
// 客户端拦截器
public class LoggingInterceptor implements ClientInterceptor {
    @Override
    public <ReqT, RespT> ClientCall<ReqT, RespT> interceptCall(
        MethodDescriptor<ReqT, RespT> method,
        CallOptions options,
        Channel next) {
        
        long start = System.currentTimeMillis();
        return new ForwardingClientCall.SimpleForwardingClientCall<ReqT, RespT>(
            next.newCall(method, options)) {
            @Override
            public void start(Listener<RespT> responseListener, Metadata headers) {
                super.start(new ForwardingClientCallListener.SimpleForwardingClientCallListener<RespT>(responseListener) {
                    @Override
                    public void onClose(Status status, Metadata trailers) {
                        long elapsed = System.currentTimeMillis() - start;
                        log.info("RPC {} completed in {}ms", method.getFullMethodName(), elapsed);
                    }
                }, headers);
            }
        };
    }
}
```

## gRPC 负载均衡（round-robin/pick_first/custom LB）

### 负载均衡策略

```java
// Pick First（默认）
ManagedChannel channel = ManagedChannelBuilder.forAddress("localhost", 8080)
    .defaultLoadBalancingPolicy("pick_first")
    .build();

// Round Robin
ManagedChannel channel = ManagedChannelBuilder.forAddress("localhost", 8080)
    .defaultLoadBalancingPolicy("round_robin")
    .build();

// 使用 Name Resolver
ManagedChannel channel = ManagedChannelBuilder.forTarget("dns:///my-service:8080")
    .defaultLoadBalancingPolicy("round_robin")
    .build();
```

### 负载均衡策略对比

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| pick_first | 选择第一个可用连接 | 简单场景 |
| round_robin | 轮询所有连接 | 通用场景 |
| weighted_round_robin | 加权轮询 | 异构服务器 |
| custom | 自定义策略 | 特殊需求 |

## gRPC 健康检查（Health Checking Protocol）

### 健康检查配置

```protobuf
syntax = "proto3";

package grpc.health.v1;

message HealthCheckRequest {
  string service = 1;
}

message HealthCheckResponse {
  enum ServingStatus {
    UNKNOWN = 0;
    SERVING = 1;
    NOT_SERVING = 2;
  }
  ServingStatus status = 1;
}

service Health {
  rpc Check (HealthCheckRequest) returns (HealthCheckResponse);
  rpc Watch (HealthCheckRequest) returns (stream HealthCheckResponse);
}
```

### 健康检查实现

```java
// 服务端实现
public class HealthServiceImpl extends HealthGrpc.HealthImplBase {
    private final Map<String, ServingStatus> statusMap = new ConcurrentHashMap<>();
    
    @Override
    public void check(HealthCheckRequest request, StreamObserver<HealthCheckResponse> observer) {
        ServingStatus status = statusMap.getOrDefault(request.getService(), ServingStatus.UNKNOWN);
        observer.onNext(HealthCheckResponse.newBuilder().setStatus(status).build());
        observer.onCompleted();
    }
    
    public void setServiceStatus(String service, ServingStatus status) {
        statusMap.put(service, status);
    }
}
```

## gRPC 错误处理（Status Code/Retry Policy）

### Status Code

| Code | 名称 | 说明 |
|------|------|------|
| OK | SUCCESS | 成功 |
| CANCELLED | CANCELLED | 客户端取消 |
| UNKNOWN | UNKNOWN | 未知错误 |
| INVALID_ARGUMENT | INVALID_ARGUMENT | 参数无效 |
| DEADLINE_EXCEEDED | DEADLINE_EXCEEDED | 超时 |
| NOT_FOUND | NOT_FOUND | 资源不存在 |
| ALREADY_EXISTS | ALREADY_EXISTS | 资源已存在 |
| PERMISSION_DENIED | PERMISSION_DENIED | 权限不足 |
| UNAUTHENTICATED | UNAUTHENTICATED | 未认证 |
| RESOURCE_EXHAUSTED | RESOURCE_EXHAUSTED | 资源耗尽 |
| INTERNAL | INTERNAL | 内部错误 |
| UNAVAILABLE | UNAVAILABLE | 服务不可用 |
| DATA_LOSS | DATA_LOSS | 数据丢失 |

### Retry Policy

```java
// 客户端重试配置
ManagedChannel channel = ManagedChannelBuilder.forAddress("localhost", 8080)
    .enableRetry()
    .maxRetryAttempts(3)
    .maxHedgedAttempts(3)
    .build();

// 方法级重试
stub.withDeadlineAfter(5, TimeUnit.SECONDS)
    .withOption(CallOptions.Key.of("retryPolicy"), "...")
    .getUser(request);
```

## gRPC 与 REST 共存（gRPC-Gateway）

### gRPC-Gateway 配置

```protobuf
syntax = "proto3";

import "google/api/annotations.proto";

service UserService {
  rpc GetUser (GetUserRequest) returns (UserResponse) {
    option (google.api.http) = {
      get: "/v1/users/{id}"
    };
  }
  
  rpc CreateUser (CreateUserRequest) returns (UserResponse) {
    option (google.api.http) = {
      post: "/v1/users"
      body: "*"
    };
  }
}
```

### Gateway 生成

```bash
# 生成 Gateway 代码
protoc -I . --grpc-gateway_out=. --grpc-gateway_opt=paths=source_relative \
  --grpc-gateway_opt=generate_unbound_methods=true \
  api.proto

# 启动 Gateway
go run gateway.go -grpc-server=localhost:8080 -http-server=:8081
```
});
```

## 十二、与其他板块的关系（扩展）

- Dubbo 对比见「[Apache Dubbo RPC 框架](./ApacheDubboRPC框架.md)」；
- Envoy（gRPC 原生代理/网关转换）见「[Envoy 服务代理](./Envoy服务代理.md)」；
- 网络协议（HTTP/2/HTTP/3）见「[网络协议深挖](../网络协议深挖.md)」；
- 云原生通信见「[云原生/Service Mesh](../../云原生/ServiceMesh.md)」；
- 对比 Thrift 见「Apache Thrift」；
- 服务网格见「[Istio 服务网格（Service Mesh）](../../云原生/ServiceMesh.md)」。

---

## 十二、速查表（扩展）

| 项 | 结论 |
|----|------|
| 类型 | 跨语言高性能 RPC 框架 |
| 传输 | HTTP/2（多路复用） |
| 序列化 | Protobuf（二进制） |
| 契约 | IDL（.proto 文件） |
| 调用模式 | Unary / Server Streaming / Client Streaming / Bidi |
| 拦截器 | 客户端/服务端拦截器（鉴权/日志/限流） |
| 负载均衡 | 客户端侧（pick_first / round_robin） |
| 错误处理 | gRPC 状态码（22种）+ Status 详情 |
| 生态 | CNCF 毕业项目 / grpc-gateway / grpcurl / buf |
| 网关 | grpc-gateway（REST 转 gRPC）/ Envoy（HTTP/2 透传） |
| 一句话 | 「跨语言 RPC 的事实标准——HTTP/2 + Protobuf + IDL」 |