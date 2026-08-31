# Dubbo 核心源码要点

Apache Dubbo 是面向微服务的高性能 RPC 框架，核心是服务注册发现、RPC 通信、集群容错与治理。
本文从总体架构、SPI 机制、服务暴露、服务引用、调用链路、集群容错、线程模型梳理关键实现要点。
（以下基于 Dubbo 2.x/3.x 通用设计原则，具体类名为示意，以官方源码为准。）

## 一、总体架构分层

Dubbo 逻辑上分为多层：

- 服务接口层（API）：业务定义的服务接口。
- 配置层（Config）：ServiceConfig、ReferenceConfig 等配置入口。
- 代理层（Proxy）：生成服务接口的动态代理。
- 注册层（Registry）：服务注册与订阅。
- 集群层（Cluster）：容错、负载均衡、路由。
- 监控层（Monitor）：调用统计。
- 协议层（Protocol）：RPC 协议编解码与交换。
- 交换层（Exchange）：请求响应语义封装。
- 传输层（Transport）：基于 Netty 等做网络传输。
- 序列化层（Serialize）：对象编解码。

## 二、SPI 扩展机制

### 2.1 为什么用 SPI

Dubbo 大量使用 JDK SPI 的增强版：自有的 `@SPI` + `@Adaptive` 机制。
它支持按 URL 参数动态选择实现，解耦核心与扩展。

### 2.2 核心要点

- 扩展点接口用 `@SPI` 标注，默认值通过注解指定。
- `META-INF/dubbo/` 下以接口全限定名命名的文件列出实现类。
- `@Adaptive` 标注的方法会根据 URL 参数在运行时生成自适应代理。
- `ExtensionLoader` 负责加载、缓存、实例化扩展。

### 2.3 与 JDK SPI 的区别

- 按需加载单个实现，而非全部实例化。
- 支持 IOC（注入其他扩展）与 AOP（Wrapper 包装）。
- 通过 URL 动态适配，更灵活。

## 三、服务暴露（Provider 侧）

### 3.1 入口

`ServiceConfig.export()` 触发暴露流程。

### 3.2 关键步骤

1. 校验配置与延迟/异步策略。
2. 将实现类包装为 Invoker（可执行体）。
3. 由 Protocol 暴露：绑定端口、启动 Server（如 Netty）。
4. 向注册中心注册服务 URL（含接口、方法、地址、权重等元数据）。
5. 启动本地服务监听，等待消费方调用。

### 3.3 Invoker 与 Exporter

- Invoker：封装"可调用"的抽象，统一本地/远程调用入口。
- Exporter：记录已暴露的服务，便于取消暴露。

## 四、服务引用（Consumer 侧）

### 4.1 入口

`ReferenceConfig.get()` 触发引用流程。

### 4.2 关键步骤

1. 解析配置，构造 ReferenceConfig。
2. 向注册中心订阅服务列表（URL 列表）。
3. 注册中心回调通知可用的 Provider 地址。
4. 为每个地址创建 Invoker，经 Cluster 封装成具备容错的 Invoker。
5. 生成接口的动态代理，业务代码像调用本地方法一样调用。

## 五、调用链路

### 5.1 一次同步调用经过什么

1. 业务调用代理方法。
2. 经过 Filter 链（监控、日志、限流等）。
3. Cluster Invoker 做路由、负载均衡选一个 Invoker。
4. 经过失败重试/容错包装。
5. Protocol 把 Invocation 序列化，通过 Transport 发送。
6. Provider 端反向解包、执行、返回结果。

### 5.2 Invocation

封装方法名、参数类型、参数值、附件（attachments）等调用信息。
是贯穿整个调用链路的上下文对象。

## 六、集群容错

### 6.1 Cluster 的作用

把多个 Provider Invoker 聚合成一个 Invoker。
调用时按策略选择并执行，屏蔽单个节点故障。

### 6.2 容错策略

- Failover：失败重试其他节点（默认，适合读）。
- Failfast：快速失败，只调一次（适合写）。
- Failsafe：失败忽略（适合日志等）。
- Failback：失败异步重试。
- Forking：并行调多个，一个成功即返回。
- Broadcast：广播到所有节点。

### 6.3 负载均衡

- Random：加权随机（默认）。
- RoundRobin：加权轮询。
- LeastActive：最少活跃调用优先。
- ConsistentHash：一致性哈希，同参数落同节点。

## 七、线程模型

### 7.1 两类线程

- IO 线程：Netty 的 EventLoop，负责网络读写，不应做重业务逻辑。
- 业务线程：由线程池派发执行具体方法。

### 7.2 派发策略（Dispatcher）

- All：所有消息派发到线程池。
- Direct：直接在 IO 线程执行。
- Message：请求/响应派发，连接等事件直接处理。
- Execution：仅请求派发，响应在 IO 线程。

### 7.3 线程池

- Fixed：固定大小（默认）。
- Cached：弹性。
- Limited：数量受限增长。

## 八、注册中心

### 8.1 角色

Provider 注册 URL，Consumer 订阅并监听变更。
注册中心（如 Zookeeper、Nacos）推送节点上下线事件。

### 8.2 数据模型

以"接口为维度"组织节点：
- providers：服务提供者列表。
- consumers：消费者列表。
- configurators：动态配置。
- routers：路由规则。

### 8.3 典型故障

- 注册中心短暂不可用：Consumer 使用本地缓存继续调用。
- 网络抖动导致误摘除：需合理的心跳与 session 超时配置。

## 九、序列化与协议

### 9.1 常见协议

- Dubbo 协议：TCP 长连接、NIO、Hessian 等序列化，适合小数据高并发。
- Triple：基于 HTTP/2，支持 gRPC 风格、跨语言。
- 其他：REST、gRPC 等可插拔。

### 9.2 序列化选择

- Hessian2：跨语言、紧凑（默认常用）。
- FastJson、Kryo、FST：性能更高但需注意兼容性。

## 十、常见坑

- 接口参数未实现 Serializable，序列化失败。
- 超时时间设置不合理导致级联雪崩。
- 注册中心连接不稳定造成大面积抖动。
- 异步调用未正确传递上下文（如 TraceId）。
- 大对象传输占用带宽与序列化 CPU。

## 十一、速记

- 分层架构：配置→代理→注册→集群→协议→交换→传输→序列化。
- 扩展靠 SPI：`@SPI` + 自适应，URL 动态选实现。
- 暴露：实现→Invoker→Protocol 暴露→注册。
- 引用：订阅→Cluster 封装→动态代理。
- 容错：Failover 读、Failfast 写；负载：随机/轮询/最少活跃/一致性哈希。
- 线程：IO 线程只做网络，业务逻辑派发到线程池。
