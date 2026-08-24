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

## 八、与其他板块的关系

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
- 对比 Spring Cloud 见「[微服务架构](../../架构/微服务架构.md)」。

---

## 十四、速查表（扩展）

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
