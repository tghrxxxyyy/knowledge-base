# Apache Dubbo（RPC 框架 / 微服务通信）

> Dubbo 是阿里开源的**高性能 RPC 框架**，以「透明远程调用 + 服务治理（注册/发现/路由/限流/降级）+ 多协议/多注册中心」成为 Java 微服务通信的首选。相比 gRPC（跨语言强但服务治理弱）、Spring Cloud HTTP（性能低），Dubbo 以**Triple 协议（gRPC 兼容）+ 服务治理能力**独树一帜。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 远程调用透明化 | 像调用本地方法一样调用远程服务，不用写 HTTP 模板代码 |
| 服务注册发现 | 服务实例动态上下线，调用方自动感知 |
| 负载均衡 | 多实例间智能分配请求（轮询/随机/一致性哈希/最少活跃） |
| 服务治理 | 路由规则、权重、灰度、降级、限流、熔断 |
| 高性能通信 | 比 HTTP/JSON 更高的吞吐、更低的延迟 |

> 核心认知：**Dubbo = 高性能 RPC + 服务治理框架**——不只是「能调通」，更是「调得好、管得住」。

---

## 二、Dubbo 核心原理

### 2.1 架构

```
Consumer（消费者）
  ├── Proxy（动态代理：生成接口的代理对象）
  ├── Cluster（集群容错：Failover/Failfast/Failsafe）
  ├── Directory（目录：从注册中心获取服务列表）
  ├── Router（路由：条件路由、标签路由）
  ├── LoadBalance（负载均衡：Random/RoundRobin/LeastActive/ConsistentHash）
  ├── Filter（过滤器链：超时/限流/降级/监控）
  └── Invoker（远程调用执行器）
      ├── Protocol（协议：Dubbo/Triple/HTTP）
  ├── Exchange（信息交换：请求/响应模型）
  ├── Transport（网络传输：Netty/Mina/Grizzly）
  └── Serialization（序列化：Hessian2/JSON/Protobuf）

Provider（提供者）
  ├── Export（暴露服务）
  └── Invoke（执行本地实现）
```

### 2.2 调用流程

1. Consumer 调用接口方法 → Proxy 拦截
2. Proxy → Cluster 选择集群策略
3. Directory 从注册中心（Nacos/ZK）获取服务列表
4. Router 按规则过滤列表
5. LoadBalance 选一个实例
6. Filter 链执行（超时/限流/降级）
7. Protocol 编码 → Transport 发送（Netty）
8. Provider 接收 → 解码 → 执行方法 → 返回结果

### 2.3 协议体系

| 协议 | 说明 | 适用场景 |
|------|------|----------|
| Dubbo 协议 | 单一长连接 + NIO 异步 + Hessian2 序列化（默认） | 内网高性能 RPC |
| Triple 协议 | 基于 HTTP/2 + Protobuf（gRPC 兼容） | 跨语言/网关穿透 |
| REST | HTTP + JSON | 对外开放 API |
| gRPC | 原生 gRPC | 跨语言微服务 |

**选型关注点**：内网高性能 → Dubbo 协议（默认）；跨语言/网关 → Triple（gRPC 兼容，Dubbo 3 默认）。

### 2.4 序列化

| 序列化 | 说明 | 性能 |
|--------|------|------|
| Hessian2 | Dubbo 默认，跨语言 | 高 |
| Protobuf | Triple 协议默认，跨语言 | 最高 |
| JSON | REST 协议默认 | 低 |
| Kryo/FST | Java 专用 | 高 |

**选型关注点**：跨语言 → Protobuf/Hessian2；纯 Java 且追求极致性能 → Kryo/FST。

### 2.5 负载均衡策略

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| Random | 随机 + 权重（默认） | 通用 |
| RoundRobin | 轮询 + 权重 | 请求耗时均匀 |
| LeastActive | 选最少活跃调用 | 请求耗时差异大 |
| ConsistentHash | 一致性哈希 | 有状态路由（同一参数→同实例） |
| ShortestResponse | 最短响应 | 自动感知实例性能 |

**选型关注点**：请求耗时差异大 → LeastActive；有状态（如购物车）→ ConsistentHash。

### 2.6 集群容错

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| Failover | 失败自动切换（默认，重试 N 次） | 读操作（幂等） |
| Failfast | 快速失败（不重试） | 非幂等写操作 |
| Failsafe | 失败忽略（记日志） | 不重要操作 |
| Forking | 并行调多个，一个成功即返回 | 实时性要求高 |
| Broadcast | 广播所有实例 | 通知/缓存刷新 |

**选型关注点**：幂等读 → Failover；非幂等写 → Failfast（避免重复扣款）。

---

## 三、Dubbo 3（云原生时代）

| 特性 | 说明 |
|------|------|
| 应用级服务发现 | 从「接口级」升级到「应用级」，注册中心压力降 10 倍+ |
| Triple 协议 | 默认 HTTP/2 + Protobuf，gRPC 兼容，网关穿透友好 |
| 流量治理 | 与 Sentinel 集成，条件路由/标签路由/动态配置 |
| 极致性能 | 比 Dubbo 2 提升 50% 吞吐 |
|  Mesh 支持 | 支持 Sidecar 模式（Dubbo Mesh） |

**选型关注点**：新项目 → Dubbo 3（Triple + 应用级发现）；存量 Dubbo 2 → 渐进升级。

---

## 四、Dubbo vs gRPC vs Spring Cloud

| 维度 | Dubbo | gRPC | Spring Cloud |
|------|-------|------|--------------|
| 语言 | Java 为主（Triple 跨语言） | 跨语言（多语言 SDK） | Java |
| 协议 | Dubbo/Triple（HTTP/2） | HTTP/2 + Protobuf | HTTP/REST |
| 序列化 | Hessian2/Protobuf | Protobuf | JSON |
| 性能 | 高 | 高 | 中 |
| 服务治理 | 强（路由/限流/降级） | 弱（需自己集成） | 强（Hystrix/Gateway） |
| 注册中心 | Nacos/ZK/ Consul/ etcd | 需自己集成 | Eureka/Nacos |
| 网关穿透 | Triple（HTTP/2 友好） | HTTP/2 友好 | HTTP 友好 |
| 跨语言 | Triple 支持 | 强 | 弱（Java） |
| 社区 | 阿里，活跃 | Google，活跃 | Spring，活跃 |

**选型关注点**：Java 微服务 + 强服务治理 → **Dubbo**；跨语言/多语言栈 → **gRPC**；Spring 生态 + REST → **Spring Cloud**。

---

## 五、Dubbo 注册中心选型

| 注册中心 | 说明 | 推荐场景 |
|----------|------|----------|
| Nacos | 阿里开源，注册+配置一体 | 国内业务首选（与 Spring Cloud Alibaba 集成） |
| ZooKeeper | 老牌 CP 协调 | 已有 ZK 基础设施 |
| Consul | 注册+配置+健康检查 | 多数据中心 |
| etcd | 云原生 CP 协调 | K8s 环境 |
| Kubernetes | K8s 原生服务发现 | K8s 环境（Dubbo 3 支持） |

**选型关注点**：Spring Cloud Alibaba 生态 → Nacos（注册+配置一体，Dubbo + Nacos 是黄金组合）。

---

## 六、Dubbo 生产实践

### 6.1 关键配置

| 配置 | 说明 |
|------|------|
| 超时（timeout） | 调用超时时间（默认 1000ms，建议根据 P99 设置） |
| 重试（retries） | 失败重试次数（幂等读 2-3 次，写 0 次） |
| 负载均衡 | 按场景选择（LeastActive/ConsistentHash） |
| 集群容错 | Failover（读）/ Failfast（写） |
| 限流 | Sentinel 集成 |
| 异步调用 | `async=true` 异步调用（提升吞吐） |

### 6.2 监控

- **Dubbo Admin**：控制台（服务管理/监控/配置/路由规则）
- **Prometheus**：Dubbo Metrics（QPS/RT/成功率/异常数）
- **SkyWalking**：Dubbo 调用链路追踪（自动埋点）

---

## 七、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| Java 微服务 RPC | Dubbo 3 | gRPC |
| 跨语言 RPC | gRPC | Dubbo 3（Triple） |
| 高性能内网调用 | Dubbo 协议 | gRPC |
| 网关穿透 | Triple（HTTP/2） | REST |
| 服务治理（路由/限流） | Dubbo + Sentinel | Spring Cloud |
| 注册中心 | Nacos | ZooKeeper |

---

## Dubbo 协议 Internals

### Dubbo 协议头结构

```
Dubbo 协议帧格式（TCP 长连接）：
  +--------+--------+--------+--------+--------+
  | Magic  | Flag   | Status | Length | Id     | Body
  | 2 bytes| 1 byte | 1 byte | 4 bytes| 8 bytes| N bytes
  +--------+--------+--------+--------+--------+

Magic: 0xdabb（魔数，标识 Dubbo 协议）
Flag:  请求/响应标志位
  ├── bit 0: 1=请求, 0=响应
  ├── bit 1: 1=双向（需要响应）, 0=单向
  ├── bit 2: 1=事件消息（心跳）
  ├── bit 3: 1=序列化类型
  └── bits 4-7: 序列化 ID（2=Hessian2, 6=Protobuf）
Status: 响应状态码（20=OK, 30=服务端异常, 40=客户端异常）
Length: 消息体长度（含头部）
Id: 请求 ID（用于匹配请求-响应）
```

### 心跳机制

```
心跳检测（保持长连接）：
  客户端 → 服务端: 心跳请求（event=true, body=空）
  服务端 → 客户端: 心跳响应
  
默认配置：
  heartbeat: 60000ms（60秒）
  timeout: 1000ms（调用超时）
  reconnect: 2000ms（断线重连）

重连策略：
  指数退避：2s → 4s → 8s → 16s → 30s（最大）
  线程池满：拒绝新连接（防雪崩）
  
监控：
  dubbo_removing_connections（断开连接数）
  dubbo_request_duration_seconds（调用延迟）
```

## Dubbo SPI Mechanism

### SPI 扩展点加载

```
Dubbo SPI = Service Provider Interface 扩展机制
  比 Java SPI 更灵活：按名称加载 + 条件激活

加载流程：
  1. 扫描 META-INF/dubbo/ 目录
  2. 读取扩展点配置文件（key=实现类全限定名）
  3. 按名称加载指定实现

配置文件格式（META-INF/dubbo/org.apache.dubbo.rpc.Filter）：
  timeout=com.alibaba.dubbo.rpc.filter.TimeoutFilter
  execute=com.alibaba.dubbo.rpc.filter.ExecuteLimitFilter
  tps=com.alibaba.dubbo.rpc.filter.TpsLimitFilter
```

### Adaptive 扩展（自适应）

```java
// Adaptive = 根据运行时参数动态选择实现
@SPI("random")
public interface LoadBalance {
    @Adaptive("loadbalance")  // 从 URL 参数 "loadbalance" 取值
    <T> Invoker<T> select(List<Invoker<T>> invokers, 
                          URL url, Invocation invocation);
}

// 运行时 URL: dubbo://host:20880/com.example.UserService?loadbalance=leastactive
// → 自动选择 LeastActiveLoadBalance
```

### Extension 自定义扩展

```java
// 自定义 Filter
@Activate(group = "provider", order = 100)
public class MyCustomFilter implements Filter {
    
    @Override
    public Result invoke(Invoker<?> invoker, Invocation invocation) {
        // 前置处理
        long start = System.currentTimeMillis();
        
        Result result = invoker.invoke(invocation);
        
        // 后置处理
        long elapsed = System.currentTimeMillis() - start;
        log.info("Call {} took {}ms", invocation.getMethodName(), elapsed);
        
        return result;
    }
}

// 注册：META-INF/dubbo/org.apache.dubbo.rpc.Filter
myCustom=com.example.MyCustomFilter
```

## Dubbo Filter Chain

### Provider 端 Filter 链

```
请求 → Provider Filter Chain → 业务方法 → Provider Filter Chain（反向）
  ├── timeout          超时控制（Provider 端兜底）
  ├── activeLimit      并发限制（防过载）
  ├── executeLimit     执行期并发限制
  ├── tps              TPS 限流
  ├── accesslog        访问日志记录
  ├── generic          泛化调用
  ├── echo             健康检查（$echo 服务）
  ├── token            令牌验证（防绕过注册中心）
  ├── validation       参数校验（JSR 303）
  └── trace            链路追踪
```

### Consumer 端 Filter 链

```
调用 → Consumer Filter Chain → 网络 → Provider
  ├── cluster          集群容错
  ├── timeout          超时控制（Consumer 端）
  ├── retries          重试逻辑
  ├── loadbalance      负载均衡
  ├── generic          泛化调用
  ├── filter           通用过滤器
  ├── activeLimit      Consumer 端并发限制
  └── monitor          监控数据采集
```

### Filter 执行顺序

```java
// Order 值越小越先执行
@Activate(group = "provider", order = -10000)
public class FirstFilter implements Filter { ... }

@Activate(group = "provider", order = 10000)
public class LastFilter implements Filter { ... }

// 调试：查看实际 Filter 链
// -Ddubbo.filter.trace=true
```

## Dubbo Cluster Fault Tolerance

### Failover（失败重试）

```
Failover = 默认策略，失败自动切换其他实例重试

流程：
  Consumer 调用 → 选择实例 A → 失败
  → 自动切换实例 B → 成功 → 返回
  
  retries=2 表示最多重试 2 次（共 3 次调用）

注意：
  重试必须保证幂等（防重复扣款）
  写操作建议 retries=0（Failfast）
  
配置：
  @DubboService(retries = 2, loadbalance = "random")
  或 consumer 端：@DubboReference(retries = 2)
```

### Failfast（快速失败）

```
Failfast = 调用失败立即报错，不重试

适用：
  非幂等写操作（创建订单、扣款）
  数据库唯一约束冲突
  
配置：
  @DubboService(cluster = "failfast")
```

### Failsafe（失败安全）

```
Failsafe = 调用失败忽略，只记日志

适用：
  不重要的旁路操作（日志写入、审计）
  缓存更新失败不影响主流程

配置：
  @DubboService(cluster = "failsafe")
```

### Forking（并行调用）

```
Forking = 并行调用多个实例，取第一个成功返回

适用：
  实时性要求极高（如推荐结果）
  可以用冗余换取成功率

配置：
  @DubboService(cluster = "forking", forking = 2)
  # 并行调 2 个实例，第一个成功即返回
```

## Dubbo Load Balancing Deep

### ConsistentHash 一致性哈希

```
一致性哈希环：
  0 ──────────────────── 2^32
  │                       │
  Instance A ───────── Instance B
  │                       │
  └───────── Instance C ──┘

虚拟节点（解决数据倾斜）：
  每个真实节点 160 个虚拟节点（均匀分布）
  增删节点只影响相邻 key（~1/N 的数据迁移）

适用场景：
  有状态服务（购物车、会话）
  缓存亲和性（同一用户请求同一实例）
  数据库连接复用
```

### LeastActive 最少活跃

```
LeastActive = 选当前活跃调用最少的实例

原理：
  每个实例维护 activeCount（活跃请求数）
  选择 activeCount 最小的实例
  如果多个实例相同，降级为 Random

适用：
  请求耗时差异大的场景
  快实例自动分担更多请求
  
配置：
  @DubboService(loadbalance = "leastactive")
```

## Dubbo Registry Deep

### Nacos 注册中心

```
Nacos 作为 Dubbo 注册中心：

注册流程：
  Provider 启动 → 注册服务实例到 Nacos
  Consumer 启动 → 订阅服务列表
  Provider 变更 → Nacos 推送通知 Consumer

心跳机制：
  Provider → Nacos: 每 5 秒发送心跳
  Nacos → 检测: 15 秒未收到心跳 → 标记不健康
  → 30 秒未收到 → 自动摘除

配置：
  dubbo.registry.address=nacos://nacos-server:8848
  dubbo.registry.parameters.namespace=dev
  dubbo.registry.parameters.group=DEFAULT_GROUP
```

### ZooKeeper 注册中心

```
ZooKeeper 作为 Dubbo 注册中心：

节点结构：
  /dubbo
    └── com.example.UserService
        ├── providers
        │   ├── dubbo://host1:20880/com.example.UserService
        │   └── dubbo://host2:20880/com.example.UserService
        ├── consumers
        │   └── consumer://host3/com.example.UserService
        ├── configurators
        └── routers

Watch 机制：
  Consumer watch providers 节点
  Provider 上下线 → ZK 临时节点变更 → 触发 watch
  Consumer 重新拉取服务列表

注意：
  ZK 是 CP 系统（强一致），Nacos 是 AP 系统（高可用）
  大规模服务注册推荐 Nacos（性能更好）
```

## Dubbo Triple Protocol Deep

### Triple 协议详解

```
Triple = Dubbo 3 默认协议，基于 HTTP/2 + Protobuf

帧格式（HTTP/2）：
  HEADERS 帧: method, path, content-type
  DATA 帧: Protobuf 二进制 payload
  END_STREAM: 标记流结束

四种调用模式：
  1. Unary（一元调用）: Request → Response
  2. Server Streaming: Request → Stream Response
  3. Client Streaming: Stream Request → Response
  4. Bidi Streaming: Stream Request → Stream Response

性能对比：
  Triple (HTTP/2) vs Dubbo (TCP):
  吞吐: 差距 < 10%（HTTP/2 多路复用优化）
  延迟: Triple 略高（HTTP/2 帧开销）
  跨语言: Triple 天然支持
  网关穿透: Triple 优于 Dubbo（HTTP/2 友好）
```

### Triple 在 K8s Ingress

```
K8s Ingress 配置 Triple：
  apiVersion: networking.k8s.io/v1
  kind: Ingress
  metadata:
    annotations:
      nginx.ingress.kubernetes.io/backend-protocol: "GRPC"
      nginx.ingress.kubernetes.io/ssl-redirect: "true"
  spec:
    rules:
      - host: grpc.example.com
        http:
          paths:
            - path: /
              pathType: Prefix
              backend:
                service:
                  name: my-dubbo-service
                  port:
                    number: 50051

优势：
  HTTP/2 + TLS 一次握手
  穿透大多数网关/负载均衡器
  支持双向流（实时推送）
```

## Dubbo vs gRPC vs Thrift

| 维度 | Dubbo | gRPC | Thrift |
|------|-------|------|--------|
| 序列化 | Hessian2/Protobuf | Protobuf | Thrift Binary |
| 传输 | TCP/HTTP/2 | HTTP/2 | TCP |
| 服务治理 | 强（内置） | 弱（需自建） | 弱（需自建） |
| 负载均衡 | 5种策略 | 需自建 | 需自建 |
| 跨语言 | Triple 支持 | 原生支持 | 原生支持 |
| 注册中心 | Nacos/ZK/Consul | 需自建 | 需自建 |
| 连接模型 | 长连接 + 连接池 | 长连接 | 长连接 |
| 适用场景 | Java 微服务 + 治理 | 跨语言微服务 | 高性能 RPC |

## Dubbo in Spring Cloud

```java
// Dubbo + Spring Cloud Alibaba 集成
@EnableDubbo
@SpringBootApplication
public class ProviderApp {
    public static void main(String[] args) {
        SpringApplication.run(ProviderApp.class, args);
    }
}

// 服务提供者
@DubboService(version = "1.0", group = "order")
public class OrderServiceImpl implements OrderService {
    @Override
    public Order getOrder(Long orderId) {
        return orderRepository.findById(orderId);
    }
}

// 服务消费者
@DubboReference(version = "1.0", group = "order",
                loadbalance = "roundrobin",
                timeout = 3000,
                retries = 2)
private OrderService orderService;

// 配置
dubbo:
  registry:
    address: nacos://nacos-server:8848
  protocol:
    name: tri
    port: 50051
  scan:
    base-packages: com.example.service
```

## Dubbo 负载均衡策略详解

### Random（随机，默认）

```
Random = 随机选择 + 权重

算法：
  1. 计算所有 invoker 权重之和 totalWeight
  2. 生成 [0, totalWeight) 随机数 offset
  3. 遍历 invoker，累加权重，offset 落在区间内则选中

特点：
  权重越大，被选中概率越高
  大量调用后分布趋于均匀
  默认选型（无需额外配置）

配置：
  @DubboService(loadbalance = "random")
  # 或 consumer 端
  @DubboReference(loadbalance = "random")
```

### RoundRobin（轮询）

```
RoundRobin = 按权重轮询

算法（加权轮询）：
  1. 维护 currentWeight 数组
  2. 每次选择 currentWeight 最大的 invoker
  3. 选中后 currentWeight -= totalWeight
  4. 每轮所有 invoker currentWeight += weight

示例（A:5, B:1, C:1）：
  第1轮: A(5)→选A(-2), B(1)→选B(-6), C(1)→选C(-6)
  第2轮: A(3)→选A(-4), B(2)→选B(-5), C(2)→选C(-5)
  → A:B:C = 5:1:1

适用：请求耗时均匀的场景
```

### LeastActive（最少活跃调用）

```
LeastActive = 选当前活跃调用最少的实例

算法：
  1. 统计每个 invoker 当前活跃调用数 activeCount
  2. 选择 activeCount 最小的
  3. 若多个相同，降级为 Random

特点：
  快实例自动分担更多请求
  适合请求耗时差异大的场景
  需配合 timeout 兜底（防慢实例阻塞）

配置：
  @DubboService(loadbalance = "leastactive")
```

### ConsistentHash（一致性哈希）

```
一致性哈希环：
  0 ──────────────────── 2^32
  │                       │
  Instance A ───────── Instance B
  │                       │
  └───────── Instance C ──┘

虚拟节点：每个真实节点 160 个虚拟节点
增删节点只影响相邻 key（~1/N 数据迁移）

适用：有状态服务（购物车、会话、缓存亲和）
配置：
  @DubboService(loadbalance = "consistenthash",
    loadbalancearguments = "userId")  # 按 userId 哈希
```

## Dubbo 超时与重试的嵌套陷阱

```
⚠️ 关键规则：Provider 端超时 < Consumer 端超时

场景（嵌套调用）：
  Consumer A → Provider B → Provider C

配置陷阱：
  A→B: timeout=3000ms, retries=2
  B→C: timeout=5000ms（错误！大于 A→B 超时）

  → A 等 3s 超时放弃，B 继续调 C（浪费资源）
  → B 重试 2 次，每次等 5s → A 已超时

正确配置：
  A→B: timeout=3000ms
  B→C: timeout=2000ms（留出重试时间）
  
超时嵌套公式：
  B→C timeout = A→B timeout / (retries+1) - 网络开销
  例：3000ms / (2+1) - 200ms = 800ms
```

| 层级 | timeout | retries | 实际最大耗时 |
|------|---------|---------|-------------|
| Consumer→Provider | 3000ms | 2 | 3000ms（首次失败即重试） |
| Provider→下游 | 800ms | 0 | 800ms（不可重试） |

## Dubbo 集群容错 Retry 次数计算规则

```
Failover 重试次数 = retries 参数值（默认 2）

重要规则：
  1. retries=2 表示最多调用 3 次（1 次原始 + 2 次重试）
  2. 重试不包含首次调用
  3. 写操作（非幂等）必须 retries=0
  4. 超时重试 vs 异常重试：超时也算失败，会触发重试

重试次数优先级（从高到低）：
  Consumer 方法级 > Consumer 接口级 > Consumer 全局
  > Provider 方法级 > Provider 接口级

最佳实践：
  读操作：retries=2-3
  写操作：retries=0
  关键链路：retries=1（平衡可用性与资源）
```

## Dubbo 路由规则（Condition/Script/Tag）

```
路由规则 = 在 LoadBalance 之前过滤候选实例

三种路由：
  1. Condition Router：条件路由（表达式）
  2. Script Router：脚本路由（JavaScript/Groovy）
  3. Tag Router：标签路由（灰度发布）
```

| 路由类型 | 语法示例 | 适用 |
|----------|----------|------|
| Condition | `consumer.host != 'dev' AND provider.env != 'prod'` | 环境隔离 |
| Tag | `tag=gray → provider.tag=gray` | 灰度发布 |
| Script | `return invoker.getUrl().getParameter("region") == "cn"` | 复杂逻辑 |

```yaml
# Tag 路由规则（灰度发布）
# Consumer 带 tag=gray 请求 → 只路由到 tag=gray 的 Provider
# Consumer 不带 tag → 走主链路（无 tag 的 Provider）
```

## Dubbo Triple 协议兼容 HTTP/1.1 的设计

```
Triple = Dubbo 3 默认协议，基于 HTTP/2 + Protobuf

HTTP/1.1 兼容设计：
  1. 传统 Dubbo 协议（TCP）→ 无法穿透 HTTP 网关
  2. Triple（HTTP/2）→ 天然穿透 HTTP 网关/API Gateway
  3. 支持 HTTP/1.1 客户端（降级为 Unary 调用）

四种调用模式：
  Unary（一元）：Request → Response（最常用）
  Server Streaming：Request → Stream Response
  Client Streaming：Stream Request → Response
  Bidi Streaming：双向流

性能对比：
  Triple vs Dubbo 协议：
  吞吐差距 < 10%（HTTP/2 多路复用优化）
  延迟略高 1-2ms（HTTP/2 帧开销）
  网关穿透能力大幅提升
```

## Dubbo 在 K8s 中注册中心选择决策

```
注册中心选型决策树：

已有 K8s 基础设施？
  ├── 是 → K8s 原生服务发现（Dubbo 3 支持）
  │        优势：零额外组件、与 K8s Service 打通
  │        劣势：不支持 Dubbo 特有元数据（权重/路由）
  │
  └── 否 → 业务规模？
           ├── 中小 → Nacos（注册+配置一体）
           │        优势：Spring Cloud Alibaba 生态
           │        劣势：额外运维 Nacos 集群
           │
           └── 大规模 → ZooKeeper / etcd
                    ZK：强一致、成熟稳定
                    etcd：云原生、轻量

K8s 注册中心配置：
  dubbo.registry.address=kubernetes://default.svc.cluster.local:443
  dubbo.application.metadata-service.port=20880
```

## 与其他板块的关系（扩展）

- 源码精读见「[源码系列/Dubbo 源码](../../源码系列/Dubbo源码.md)」；
- 注册中心见「[注册中心与配置中心](./注册中心与配置中心.md)」；
- 限流熔断见「[Sentinel 限流熔断](./Sentinel限流熔断.md)」；
- 链路追踪见「[链路追踪 SkyWalking](./链路追踪SkyWalking.md)」；
- RPC 协议原理见「[网络协议深挖](../../基础知识/网络协议深挖.md)」。

> 一句话：**Dubbo = 高性能 RPC（Dubbo/Triple 协议 + Hessian2/Protobuf 序列化）+ 服务治理（注册发现/负载均衡/集群容错/流量治理）+ 云原生（应用级发现 + Mesh 支持）；选型先看「语言栈（纯 Java → Dubbo，跨语言 → gRPC）」，再定「协议（内网 → Dubbo 协议，网关穿透 → Triple）」，最后配「注册中心（Nacos）」。**

---

## 九、Dubbo Filter 机制（拦截器/扩展点）

Dubbo 的 Filter 是请求处理链的拦截器，类似 Servlet Filter / Spring Interceptor：

```
请求 → Consumer Filter 链 → 网络 → Provider Filter 雾 → 业务方法
```

| Filter | 说明 |
|--------|------|
| timeout | 超时控制（Provider 端也生效） |
| activeLimit | Consumer 端并发限制 |
| executeLimit | Provider 端并发限制 |
| tps | TPS 限流 |
| accesslog | 访问日志 |
| generic | 泛化调用（无接口 stub 时） |
| echo | 健康检查（$echo 服务） |
| token | 令牌验证（防绕过注册中心） |
| validation | 参数校验（JSR 303） |
| cache | 结果缓存（LRU/ThreadLocal） |

**自定义 Filter**：实现 `org.apache.dubbo.rpc.Filter` 接口 + `@Activate` 注解，META-INF/dubbo 目录注册。

---

## 十、Dubbo 与 Spring Cloud 选型深度对比

| 维度 | Dubbo | Spring Cloud |
|------|-------|--------------|
| 通信方式 | 二进制 RPC（Dubbo/Triple） | HTTP/REST（JSON） |
| 性能 | 高（二进制序列化+长连接） | 中（JSON+短连接） |
| 服务治理 | 内置（路由/限流/降级/权重） | 需集成 Hystrix/Sentinel |
| 注册中心 | Nacos/ZK/Consul/etcd | Eureka/Nacos/Consul |
| 负载均衡 | 5种策略（Random/LeastActive/ConsistentHash等） | Ribbon/LoadBalancer（少） |
| 网关 | Triple（HTTP/2）友好 | Spring Cloud Gateway |
| 跨语言 | Triple 支持 | Java 为主 |
| 学习曲线 | 中（需理解 Filter/Cluster/Protocol） | 低（Spring 注解） |
| 适用规模 | 中大规模（阿里系） | 中小规模（Spring 生态） |
| 维护方 | 阿里（活跃） | VMware（活跃） |

**选型结论**：
- **选 Dubbo**：纯 Java/性能敏感/强治理需求/Spring Cloud Alibaba 生态
- **选 Spring Cloud**：快速迭代/轻量/REST 对外/团队熟悉 Spring
- **混合使用**：内部 RPC 用 Dubbo，对外 API 用 Spring Cloud Gateway

---

## 十一、Dubbo 常见坑与最佳实践

### 11.1 常见坑

| 坑 | 表现 | 解法 |
|----|------|------|
| 超时设置不合理 | 慢接口拖垮调用链 | 根据 P99 设置超时，写操作设 Failfast |
| 重试导致重复扣款 | 非幂等操作重试 | 写操作 retries=0，用幂等令牌 |
| 注册中心压力大 | 接口级注册（Dubbo 2） | 升级 Dubbo 3 应用级注册 |
| 负载不均 | Random 权重配置不当 | 耗时差异大用 LeastActive |
| 线程池打满 | Provider 处理慢 | 调整线程池 + 异步调用 |
| 序列化兼容 | Hessian2 跨版本不兼容 | 升级 Protobuf（Triple 协议） |
| 路由规则不生效 | 规则语法错误/未下发 | 用 Dubbo Admin 验证规则 |

### 11.2 最佳实践

- **超时**：Provider 端设默认超时，Consumer 端按场景覆盖
- **重试**：读操作 retries=2-3，写操作 retries=0
- **异步**：非阻塞调用用 `async=true` + `return=true`
- **线程池**：Provider 按 CPU 核心数设置，避免 IO 密集型阻塞
- **监控**：接入 Prometheus + Grafana，关注 QPS/RT/成功率
- **版本管理**：`dubbo:service` 加 `group` + `version` 实现灰度

---

## 十二、Dubbo 3 Triple 协议深度

Triple 是 Dubbo 3 的默认协议，基于 HTTP/2 + Protobuf：

| 特性 | 说明 |
|------|------|
| 兼容 gRPC | 可直接与 gRPC 服务互通 |
| 流式支持 | 四种模式（Unary/Server/Client/Bidi） |
| 网关友好 | HTTP/2 可穿透大多数网关/API Gateway |
| 元数据传递 | Header 传递（类似 HTTP Header） |
| 跨语言 | Java/Go/Python/Node 等多语言 Stub |
| 性能 | HTTP/2 多路复用 + Protobuf 二进制 |

**Triple vs Dubbo 协议选型**：
- 内网高性能 → Dubbo 协议（TCP 长连接）
- 跨语言/网关穿透 → Triple（HTTP/2）
- 新项目推荐 → Triple（Dubbo 3 默认）

---

## 十三、与其他板块的关系（扩展）

- 源码精读见「[源码系列/Dubbo 源码](../../源码系列/Dubbo源码.md)」；
- 注册中心见「[注册中心与配置中心](./注册中心与配置中心.md)」；
- 限流熔断见「[Sentinel 限流熔断](./Sentinel限流熔断.md)」；
- 链路追踪见「[链路追踪 SkyWalking](./链路追踪SkyWalking.md)」；
- RPC 协议原理见「[网络协议深挖](../../基础知识/网络协议深挖.md)」；
- 服务网格见「[云原生/Service Mesh](../../云原生/ServiceMesh.md)」；
- 对比 gRPC 见「[gRPC](./gRPC.md)」；
- 对比 Spring Cloud 见「[微服务治理全链路](../../架构/微服务治理全链路.md)」。

## Dubbo 3 Triple 协议深度

```
Triple 协议架构：

  ┌─────────────────────────────────────────────┐
  │                  Triple                      │
  │  ┌─────────────┐  ┌─────────────────────┐   │
  │  │ HTTP/2      │  │ gRPC 兼容           │   │
  │  │ 二进制帧     │  │ 四种调用模式        │   │
  │  └─────────────┘  └─────────────────────┘   │
  │  ┌─────────────┐  ┌─────────────────────┐   │
  │  │ 流式通信     │  │ 健康检查            │   │
  │  │ Streaming   │  │ HTTP/2 PING        │   │
  │  └─────────────┘  └─────────────────────┘   │
  └─────────────────────────────────────────────┘

  支持特性：
    ├── 四种调用模式：
    │     ├── Unary（一元调用）
    │     ├── Server Streaming
    │     ├── Client Streaming
    │     └── Bidirectional Streaming
    │
    ├── 元数据传递（Header/Trailer）
    ├── 取消传播（Cancellation Propagation）
    ├── 超时传播（Timeout Propagation）
    ├── 异步化（Async）
    └── 流控（Flow Control）
```

```protobuf
// Triple IDL 定义（Proto3）
syntax = "proto3";
package com.example;

service OrderService {
    rpc GetOrder(GetOrderRequest) returns (OrderResponse);
    rpc ListOrders(ListOrdersRequest) returns (stream OrderResponse);
    rpc BatchCreateOrders(stream CreateOrderRequest) returns (BatchCreateResponse);
    rpc StreamOrders(stream OrderRequest) returns (stream OrderResponse);
}
```

| 协议 | 传输层 | 序列化 | 兼容性 | 性能 |
|------|--------|--------|--------|------|
| Dubbo2 | TCP（私有） | Hessian2 | Dubbo 客户端 | 高 |
| Triple | HTTP/2 | Protobuf | gRPC/HTTP 客户端 | 高 |
| gRPC | HTTP/2 | Protobuf | gRPC 客户端 | 高 |
| REST | HTTP/1.1 | JSON | 任何 HTTP 客户端 | 中 |

## Dubbo 负载均衡策略

```
负载均衡算法：

  Random（默认）
    ├── 按权重随机
    ├── 支持动态权重（活跃度）
    └── 适合大多数场景

  RoundRobin
    ├── 轮询（加权）
    ├── 平滑加权轮询
    └── 适合请求耗时均匀场景

  LeastActive
    ├── 最少活跃数优先
    ├── 慢服务自动降权
    └── 适合耗时差异大场景

  ConsistentHash
    ├── 一致性哈希
    ├── 同一参数请求路由到同一节点
    └── 适合缓存场景

  ShortestResponse
    ├── 最短响应时间优先
    ├── 适合低延迟场景
    └── Dubbo 3.1+ 支持
```

```yaml
dubbo:
  provider:
    loadbalance: roundrobin    # 全局默认
  service:
    com.example.OrderService:
      loadbalance: leastactive # 服务级配置
    com.example.UserService:
      loadbalance: consistenthash
      parameters:
        hash.arguments: 0,2    # 对第 0、2 个参数做 hash
```

## Dubbo 超时与重试机制

```
超时设置层级（优先级从高到低）：

  consumer method → consumer service → provider method → provider service
       │                  │                   │                │
    最细粒度           服务级              服务级           全局默认

  重试机制：
    ├── retries: 2（默认）
    ├── 非幂等操作建议 retries=0
    └── 异常类型决定是否重试：
          ├── 网络异常 → 重试
          ├── 业务异常 → 不重试
          └── 超时异常 → 可配置重试
```

```yaml
dubbo:
  consumer:
    timeout: 5000
    retries: 2
    check: false
  reference:
    com.example.OrderService:
      timeout: 3000
      retries: 1
      methods:
        createOrder:
          timeout: 10000
          retries: 0      # 非幂等不重试
```

## Dubbo 路由规则

```
路由规则类型：

  条件路由（Condition）
    ├── 基于表达式
    └── 适合灰度/AB 测试

  标签路由（Tag）
    ├── 按标签分组
    └── 适合环境隔离

  动态配置（Dynamic）
    ├── 运行时修改
    └── 支持配置中心热更新
```

```yaml
conditions:
  - force: false
    rule: "arguments[0].version == '2.0' => addresses.*.host == '10.0.0.1'"

tags:
  - name: gray
    addresses:
      - 10.0.0.1
      - 10.0.0.2
    force: false
```

## Dubbo 常见坑与最佳实践

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 调用超时 | 网络延迟/服务慢 | 检查网络、调优超时参数 |
| 序列化失败 | 类不兼容 | 统一版本、检查 Serializable |
| 连接池耗尽 | 并发过高 | 调大 connections、异步化 |
| Provider OOM | 请求堆积 | 限流、降级、扩容 |
| 消费者找不到服务 | 注册中心问题 | 检查注册中心、网络连通性 |
| ClassCastException | 版本不一致 | 统一接口版本 |
| 随机负载不均 | 权重设置不当 | 使用 LeastActive 或加权 |
| 重试导致重复 | 非幂等操作 | 设置 retries=0 + 幂等设计 |

---

## 十四、Dubbo服务治理配置

### 14.1 限流配置

```java
// 限流配置
@DubboService(filter = "echoFilter,myLimitFilter", timeout = 5000)
public class OrderService implements IOrderService {
    @Override
    public Order createOrder(OrderRequest request) {
        return orderService.createOrder(request);
    }
}

// 自定义限流Filter
@Activate(group = Constants.PROVIDER)
public class MyLimitFilter implements Filter {
    
    private final RateLimiter rateLimiter = RateLimiter.create(100);  // 100 QPS
    
    @Override
    public Result invoke(Invoker<?> invoker, Invocation invocation) throws RpcException {
        if (!rateLimiter.tryAcquire()) {
            throw new RpcException(RpcException.LIMIT_EXCEEDED_EXCEPTION, 
                "请求限流，请稍后重试");
        }
        return invoker.invoke(invocation);
    }
}
```

### 14.2 熔断配置

```java
// 熔断配置（集成Sentinel）
@DubboService(filter = "sentinel.dubbo.provider.filter", timeout = 5000)
public class OrderService implements IOrderService {
    @Override
    public Order createOrder(OrderRequest request) {
        return orderService.createOrder(request);
    }
}

// Sentinel配置
@SentinelResource(
    value = "createOrder",
    blockHandler = "createOrderBlockHandler",
    fallback = "createOrderFallback"
)
public Order createOrder(OrderRequest request) {
    return orderService.createOrder(request);
}

public Order createOrderBlockHandler(OrderRequest request, BlockException ex) {
    throw new RuntimeException("请求被限流");
}

public Order createOrderFallback(OrderRequest request, Throwable ex) {
    return Order.emptyOrder();  // 降级返回空订单
}
```

### 14.3 服务治理最佳实践

```text
服务治理最佳实践：

  限流策略：
    QPS限流：限制每秒请求数
    并发限流：限制并发数
    自适应限流：根据系统负载动态调整

  熔断策略：
    错误率熔断：错误率超过阈值
    慢调用熔断：慢调用比例超过阈值
    异常数熔断：异常数超过阈值

  降级策略：
    返回默认值：返回空对象或默认值
    调用备用服务：调用其他可用服务
    快速失败：直接抛出异常

  监控告警：
    限流触发告警
    熔断触发告警
    降级触发告警
```

## 十五、Dubbo线程模型配置

### 15.1 线程模型配置

```java
// 线程模型配置
@DubboService(
    protocol = {"dubbo", "triple"},
    timeout = 5000,
    threads = 200,  // 线程池大小
    dispatcher = "message"  // 消息派发策略
)
public class OrderService implements IOrderService {
    @Override
    public Order createOrder(OrderRequest request) {
        return orderService.createOrder(request);
    }
}

// 线程池配置
dubbo.protocol.threads=200
dubbo.protocol.threadpool=fixed  // fixed/cached/limited
dubbo.protocol.queues=0
dubbo.protocol.thread-pool.queue-size=100
```

### 15.2 线程模型对比

| 模型 | 说明 | 适用场景 |
|------|------|----------|
| fixed | 固定大小线程池 | 生产环境（推荐） |
| cached | 缓存线程池（弹性伸缩） | 测试环境 |
| limited | 限制线程池（无队列） | 高并发场景 |

### 15.3 线程模型最佳实践

```text
线程模型最佳实践：

  线程池大小：
    CPU密集型：线程数 = CPU核数 + 1
    IO密集型：线程数 = CPU核数 * 2
    混合型：线程数 = CPU核数 * (1 + IO时间/CPU时间)

  线程池队列：
    有界队列：防止内存溢出
    无界队列：可能导致内存溢出
    建议：使用有界队列

  线程池拒绝策略：
    AbortPolicy：抛出异常（默认）
    CallerRunsPolicy：调用者执行
    DiscardPolicy：丢弃任务
    DiscardOldestPolicy：丢弃最旧任务

  监控指标：
    线程池活跃线程数
    线程池队列大小
    线程池拒绝次数
```

## 十六、Dubbo协议家族对比

### 16.1 协议配置

```java
// Dubbo协议配置
@DubboService(protocol = "dubbo", timeout = 5000)
public class OrderService implements IOrderService {
    @Override
    public Order createOrder(OrderRequest request) {
        return orderService.createOrder(request);
    }
}

// Triple协议配置
@DubboService(protocol = "triple", timeout = 5000)
public class OrderService implements IOrderService {
    @Override
    public Order createOrder(OrderRequest request) {
        return orderService.createOrder(request);
    }
}

// REST协议配置
@DubboService(protocol = "rest", timeout = 5000)
@Path("/order")
public class OrderService implements IOrderService {
    @POST
    @Path("/create")
    @Override
    public Order createOrder(OrderRequest request) {
        return orderService.createOrder(request);
    }
}
```

### 16.2 协议对比

| 协议 | 传输层 | 序列化 | 适用场景 |
|------|--------|--------|----------|
| Dubbo | TCP | Hessian2 | 内网高性能 |
| Triple | HTTP/2 | Protobuf | 云原生/跨语言 |
| REST | HTTP | JSON | 开放API |

### 16.3 协议选择建议

```text
协议选择建议：

  Dubbo协议：
    优点：高性能、二进制协议
    缺点：Java绑定、调试困难
    场景：内网高性能RPC调用

  Triple协议：
    优点：跨语言、云原生、HTTP/2
    缺点：性能略低
    场景：微服务、服务网格

  REST协议：
    优点：通用性强、易于调试
    缺点：性能低、文本协议
    场景：开放API、第三方集成

  选型建议：
    内网调用：Dubbo
    跨语言调用：Triple
    开放API：REST
```

## 十七、Dubbo注册中心容错机制

### 17.1 注册中心配置

```java
// 注册中心配置
@DubboService(
    registry = {
        @RegistryConfig(address = "nacos://127.0.0.1:8848", timeout = 10000),
        @RegistryConfig(address = "zookeeper://127.0.0.1:2181", timeout = 10000)
    },
    timeout = 5000
)
public class OrderService implements IOrderService {
    @Override
    public Order createOrder(OrderRequest request) {
        return orderService.createOrder(request);
    }
}

// 注册中心容错配置
dubbo.registry.address=nacos://127.0.0.1:8848
dubbo.registry.timeout=10000
dubbo.registry.check=false  // 启动时不检查注册中心
dubbo.registry.register=true  // 注册服务
dubbo.registry.subscribe=true  // 订阅服务
```

### 17.2 容错机制

```text
注册中心容错机制：

  故障检测：
    心跳检测：定期发送心跳
    超时检测：检测超时
    连接检测：检测连接状态

  故障转移：
    自动切换：自动切换到备用注册中心
    人工切换：手动切换到备用注册中心
    混合切换：部分自动+部分人工

  数据同步：
    全量同步：启动时全量同步
    增量同步：运行时增量同步
    最终一致：最终一致性保证

  监控告警：
    注册中心故障告警
    服务注册失败告警
    服务订阅失败告警
```

### 17.3 容错最佳实践

```text
容错最佳实践：

  注册中心选择：
    Nacos：推荐，支持动态配置
    ZooKeeper：稳定，社区活跃
    Consul：支持健康检查
    etcd：轻量级

  容错配置：
    多注册中心：配置多个注册中心
    超时设置：合理设置超时时间
    重试机制：配置重试次数

  监控告警：
    注册中心状态监控
    服务注册状态监控
    服务订阅状态监控

  运维管理：
    定期检查注册中心状态
    定期备份注册数据
    定期更新注册中心版本
```

## 十八、Dubbo K8s部署模式

### 18.1 K8s部署配置

```yaml
# K8s部署配置
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: dubbo-system
spec:
  replicas: 3
  selector:
    matchLabels:
      app: order-service
  template:
    metadata:
      labels:
        app: order-service
    spec:
      containers:
        - name: order-service
          image: order-service:1.0.0
          ports:
            - containerPort: 20880
              protocol: DUBBO
            - containerPort: 8080
              protocol: TCP
          env:
            - name: DUBBO_REGISTRY_ADDRESS
              value: "nacos://nacos.dubbo-system:8848"
            - name: DUBBO_PROTOCOL_PORT
              value: "20880"
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            tcpSocket:
              port: 20880
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            tcpSocket:
              port: 20880
            initialDelaySeconds: 5
            periodSeconds: 5
```

### 18.2 K8s部署最佳实践

```text
K8s部署最佳实践：

  容器配置：
    镜像：使用官方镜像
    资源：合理设置资源限制
    环境变量：配置必要环境变量

  服务发现：
    K8s Service：使用K8s Service
    注册中心：配置注册中心
    健康检查：配置健康检查

  部署策略：
    滚动更新：逐步更新
    蓝绿部署：零停机部署
    金丝雀发布：小流量验证

  监控告警：
    Pod状态监控
    服务调用监控
    资源使用监控
```

### 18.3 服务网格集成

```text
服务网格集成：

  Sidecar模式：
    Istio：使用Istio作为服务网格
    Envoy：使用Envoy作为Sidecar
    mTLS：启用双向TLS

  流量管理：
    路由规则：配置路由规则
    负载均衡：配置负载均衡策略
    熔断降级：配置熔断降级策略

  安全策略：
    认证：启用服务认证
    授权：配置访问控制
    加密：启用数据加密

  可观测性：
    指标：收集服务指标
    日志：收集访问日志
    追踪：分布式追踪
```

| 项 | 结论 |
|----|------|
| 类型 | 高性能 RPC 框架 + 服务治理 |
| 协议 | Dubbo（TCP）/ Triple（HTTP/2）/ REST |
| 序列化 | Hessian2 / Protobuf / JSON |
| 负载均衡 | Random / RoundRobin / LeastActive / ConsistentHash / ShortestResponse |
| 集群容错 | Failover / Failfast / Failsafe / Forking / Broadcast |
| 注册中心 | Nacos（推荐）/ ZooKeeper / Consul / etcd / K8s |
| 版本 | Dubbo 3（Triple + 应用级发现） |
| 扩展点 | Filter / Protocol / Registry / Cluster |
| 云原生 | 支持 Mesh Sidecar 模式 |
| 一句话 | 「Java 微服务 RPC + 治理」的首选 |
