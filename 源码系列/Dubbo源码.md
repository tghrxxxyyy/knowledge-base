# Dubbo 源码解析（深入：Filter 链 / 线程模型 / 连接管理 / 优雅关闭）

> Apache Dubbo 是 Java 生态最主流的 RPC 框架。本篇深入拆解：Filter 链机制、线程模型、连接管理、优雅关闭、序列化选型。

---

## 一、十层架构

| 层 | 职责 | 核心接口 |
|----|------|----------|
| Service | 业务接口（开发者定义） | 你的 `UserService` |
| Config | 对外配置，启动入口 | `ServiceConfig` / `ReferenceConfig` |
| Proxy | 透明代理，生成 Stub/Skeleton | `ProxyFactory` |
| Registry | 服务注册与发现 | `RegistryFactory` / `Registry` |
| Cluster | 多 Provider 路由、容错、负载均衡 | `Cluster` / `Directory` / `LoadBalance` |
| Monitor | 调用次数/耗时统计 | `MonitorFactory` / `Monitor` |
| Protocol ★ | 封装 RPC 调用（核心） | `Protocol` / `Invoker` / `Exporter` |
| Exchange | 请求-响应模式，同步转异步 | `Exchanger` / `ExchangeChannel` |
| Transport | 抽象 Netty 为统一接口 | `Transporter` / `Channel` |
| Serialize | 对象 ↔ 字节流 | `Serialization` / `ObjectInput/Output` |

---

## 二、一次 RPC 调用链路

```
1. Service 接口调用
2. Proxy 层：InvokerInvocationHandler.invoke() → 构造 RpcInvocation
3. Cluster 层：LoadBalance.select() 选一个 Provider
4. 集群容错：FailoverClusterInvoker（失败重试）
5. Filter 链：ConsumerContextFilter → MonitorFilter → ExecuteLimitFilter → ...
6. Protocol 层：DubboProtocol.refer() → DubboInvoker
7. Exchange 层：HeaderExchangeChannel.request() 生成 Request
8. Transport 层：NettyChannel.send() 写入 Socket
9. Serialize 层：Hessian2Serialization 序列化
--- 网络传输 ---
10. Provider：Netty Handler → 解码 → DubboProtocol.reply() → 调真实服务 → 返回
11. Consumer：解码 → 反序列化 → Future 返回给调用方
```

---

## 三、Filter 链机制（深入）

### 3.1 概念

```
Filter = AOP 思想，在调用前后插入逻辑（如监控、限流、日志）

Consumer 端 Filter：调用前插入（如 ConsumerContextFilter 设置隐式参数）
Provider 端 Filter：请求到达后插入（如 ExecuteLimitFilter 限流）
```

### 3.2 核心源码

```
源码路径：
  dubbo-rpc/dubbo-rpc-api/src/main/java/org/apache/dubbo/rpc/Filter.java

SPI 扩展：
  META-INF/dubbo/org.apache.dubbo.rpc.Filter
  
执行链：
  Filter1 → Filter2 → Filter3 → Invoker.invoke()

源码实现：
  AbstractInvoker.invoke() → Filter chain → 真实调用
  
关键代码：
  List<Filter> filters = getFilters(); // 从 SPI 加载
  for (Filter filter : filters) {
      result = filter.invoke(invoker, invocation);
  }
```

### 3.3 内置 Filter

| Filter | 说明 | 端 |
|--------|------|----|
| ConsumerContextFilter | 设置隐式参数（如 traceId） | Consumer |
| MonitorFilter | 统计调用次数/耗时 | 双端 |
| ExecuteLimitFilter | 限流（执行限制） | Provider |
| ActiveLimitFilter | 并发调用限制 | Consumer |
| TimeoutFilter | 超时处理 | Provider |
| GenericFilter | 泛化调用 | Provider |

### 3.4 自定义 Filter

```java
@Activate(group = "consumer", order = 100)
public class MyConsumerFilter implements Filter {
    @Override
    public Result invoke(Invoker<?> invoker, Invocation invocation) throws RpcException {
        // 调用前逻辑
        RpcContext.getContext().setAttachment("my_key", "my_value");
        Result result = invoker.invoke(invocation);
        // 调用后逻辑
        return result;
    }
}
```

---

## 四、线程模型

### 4.1 线程池配置

```
dubbo.protocol.threadpool=fixed
dubbo.protocol.threads=200
dubbo.protocol iothreads=4

固定大小（fixed）：线程数固定（默认 200）
缓存（cached）：按需创建，空闲回收（不推荐生产）
限制（limited）：只创建不回收
```

### 4.2 IO 线程 vs 业务线程

```
IO 线程（Netty EventLoop）：
  处理网络读写
  解码/编码
  不执行业务逻辑

业务线程（dubbo 业务线程池）：
  执行 Filter 链
  调用真实业务方法
  处理序列化/反序列化

原则：IO 线程不阻塞，业务逻辑都放业务线程
```

### 4.3 Dispatcher 分发策略

| 策略 | 说明 |
|------|------|
| all | 所有消息分发到业务线程（默认） |
| direct | 直接在 IO 线程处理（不推荐） |
| message | 只分发请求消息到业务线程 |
| execution | 只分发请求，不处理连接 |
| connection | 只分发连接事件 |

---

## 五、连接管理

### 5.1 连接模型

```
Consumer → Provider：
  默认单连接 + 多路复用（同一个 TCP 连接上传多个请求）
  高吞吐场景可配多连接（connections=10）

长连接优势：
  - 减少 TCP 三次握手开销
  - 减少连接数（K8s Pod 多时重要）
  - 多路复用提升吞吐
```

### 5.2 连接复用

```
Dubbo 协议：
  请求 ID（8字节）关联响应
  一个连接上多个请求并发
  Provider 端按请求 ID 解码

HTTP/2 协议：
  天然支持多路复用
  更适合云原生场景
```

### 5.3 连接池

```
连接数控制：
  consumer.connections=1（默认单连接）
  consumer.connections=10（高吞吐场景）
  
连接健康检查：
  心跳检测（默认 60s）
  断线重连
  连接超时（默认 3s）
```

---

## 六、优雅关闭

### 6.1 Provider 优雅关闭

```
收到 kill -15 信号后：
  1. 标记为不可用（不接新请求）
  2. 等待进行中的请求完成（默认 10s）
  3. 从注册中心下线
  4. 关闭连接
  5. 释放资源

配置：
  dubbo.service.shutdown.wait=10000（等待时间 ms）
  dubbo.registry.stop等待时间（注册中心下线等待时间）
```

### 6.2 Consumer 优雅关闭

```
收到 kill -15 信号后：
  1. 标记为不可用（不发新请求）
  2. 等待进行中的请求完成
  3. 取消订阅
  4. 关闭连接

关键：
  Consumer 关闭顺序：先关 Dubbo，再关 Spring 容器
  避免出现调用失败（Provider 已下线但 Consumer 还在调）
```

---

## 七、序列化选型

| 序列化 | 速度 | 体积 | 兼容性 | 适用 |
|--------|------|------|--------|------|
| Hessian2 | 快 | 小 | 好 | 默认推荐 |
| JSON | 慢 | 大 | 极好 | 调试/跨语言 |
| Kryo | 极快 | 小 | 差 | Java 内部 |
| Protobuf | 快 | 最小 | 好 | 跨语言/gRPC |
| FST | 快 | 小 | 差 | Java 内部 |

---

## 八、常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 调用超时 | 网络/Provider 慢 | 检查超时配置 + Provider 日志 |
| 服务找不到 | 注册中心地址错误 | 检查注册中心配置 |
| 序列化失败 | 类未实现 Serializable | 加 Serializable |
| 线程池满 | 并发量超过线程池大小 | 调大线程池/限流 |
| 连接断开 | 网络抖动/Provider 重启 | 检查心跳配置 |
| 内存泄漏 | 对象未释放（如 ThreadLocal） | 检查 Filter/拦截器 |

---

## 九、读源码建议

```
调用链：InvokerInvocationHandler → ClusterInvoker → Filter 链 → DubboInvoker → HeaderExchangeChannel.request
扩展：@SPI / @Adaptive 与 ExtensionLoader
容错：FailoverClusterInvoker.select/invoke
服务暴露：ServiceConfig → ProxyFactory → Protocol.export → Registry.register
服务引用：ReferenceConfig → Registry → ProxyFactory 生成代理
```

---

## 十、与其他板块的关系

- Dubbo 使用见「[Dubbo](../基础知识/中间件/Dubbo.md)」；
- Spring Cloud 对比见「[Spring Cloud 微服务](../基础知识/SpringCloud微服务.md)」；
- gRPC 对比见「[gRPC](../基础知识/中间件/gRPC.md)」；
- 负载均衡见「[分布式系统](../基础知识/分布式系统.md)」。

> 一句话：**Dubbo = 十层架构 + SPI 扩展 + Filter AOP + IO/业务线程分离 + 长连接多路复用——核心模型是 Invoker，读源码从 Filter 链和 Invoker 入手**。
