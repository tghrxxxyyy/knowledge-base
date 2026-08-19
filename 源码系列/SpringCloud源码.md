# Spring Cloud 源码解析（Nacos 注册/Gateway Filter 链/OpenFeign 负载均衡/Sentinel 滑动窗口）

> Spring Cloud 是 **Java 微服务治理的事实标准**。本篇深入拆解核心组件源码：Nacos Client 注册/发现/长轮询、Gateway Filter 链执行机制、OpenFeign 调用链、Sentinel 滑动窗口统计。

---

## 一、Spring Cloud 核心架构

```
应用代码（Spring Boot）
  → Spring Cloud 自动装配（@EnableXxx）
  → 核心组件：
      服务发现：Nacos/Eureka/Consul
      配置中心：Nacos Config/Apollo
      网关：Spring Cloud Gateway
      熔断：Sentinel/Hystrix
      负载均衡：Spring Cloud LoadBalancer / Ribbon
      链路追踪：Sleuth + Zipkin / Micrometer Tracing
```

---

## 二、Nacos Client 源码（深入）

### 2.1 启动注册流程

```
核心类：
  NacosDiscoveryClient   — 注册发现客户端
  NacosServiceInstance   — 服务实例
  NacosDiscoveryProperties — 配置属性
  NamingService          — 命名服务（核心 API）

启动流程：
  1. @EnableDiscoveryClient → DiscoveryClientAutoConfiguration
  2. NacosDiscoveryClient 注册到 Spring 容器
  3. 创建 NamingService（NacosClientProperties → NacosFactory）
  4. 调用 namingService.registerInstance() 注册自身
  5. 启动心跳定时任务（每 5s 发送心跳）
  6. 启动服务列表拉取定时任务（每 10s 全量拉取）
  7. 启动长轮询监听（配置变更实时推送）

注册细节：
  ApplicationStartEvent → NacosServiceRegistry.register()
    → namingService.registerInstance(serviceName, ip, port, metadata)
    → HTTP PUT /nacos/v1/ns/instance
    → 携带 IP/端口/权重/元数据/健康状态/集群名
```

### 2.2 长轮询机制

```
Nacos 配置变更推送 = 长轮询（Long Polling）

流程：
  1. Client 向 Server 发起长轮询请求（挂起 30s）
  2. Server 收到请求后不立即返回，而是 hold 住
  3. 如果 30s 内有配置变更 → 立即返回变更内容
  4. 如果 30s 内无变更 → 返回空，Client 立即重新发起长轮询

优势：
  - 实时性高（变更后秒级推送）
  - 无 WebSocket 依赖（HTTP 即可）
  - 减少轮询开销（不像短轮询那样频繁请求）
```

### 2.3 服务发现缓存

```
NacosClient 拉取策略：
  1. 启动时全量拉取服务列表
  2. 每 10s 增量拉取（只拉变化的服务）
  3. 本地缓存 + 定时刷新（防止 Server 不可用时丢数据）

缓存结构：
  Map<String, Map<String, List<ServiceInstance>>>
  key: namespace → key: serviceName → value: 实例列表

更新机制：
  定时任务：每 10s 从 Nacos Server 拉取
  事件通知：长轮询收到变更后立即更新本地缓存
```

---

## 三、Gateway Filter 链源码（深入）

### 3.1 请求流程

```
HTTP 请求 → DispatcherHandler（WebFlux 调度）
  → RoutePredicateHandlerMapping（匹配路由）
  → FilteringWebHandler（执行过滤器链）
  → NettyRoutingFilter（Netty HTTP 转发）
  → 后端服务

过滤器链 = GlobalFilter（全局）+ GatewayFilter（路由级）
  → 按 order 排序依次执行
  → pre（前置）→ 转发 → post（后置）
```

### 3.2 核心源码

```
核心类：
  RouteDefinitionLocator      — 路由定义加载
  RoutePredicateHandlerMapping — 路由匹配
  GatewayFilterChain          — 过滤器链执行
  NettyRoutingFilter          — 底层 Netty HTTP 转发
  GlobalFilter                — 全局过滤器

请求流程源码：
  1. DispatcherHandler.handle()
  2. RoutePredicateHandlerMapping.getHandler()
     → 遍历所有路由，匹配 predicate（Path/Header/Method）
  3. FilteringWebHandler.handle()
     → 构建 GatewayFilterChain
     → 按 order 排序执行 pre filter
  4. NettyRoutingFilter.filter()
     → 创建 Netty HttpClient 请求
     → 转发到后端服务
  5. 执行 post filter（响应头修改/日志）
  6. 返回客户端
```

### 3.3 动态路由

```
路由配置来源：
  YAML 文件（bootstrap.yml）— 静态
  Nacos Config — 动态推送（配置变更 → 刷新路由）
  自定义 RouteDefinitionRepository — 代码动态添加

动态刷新机制：
  @RefreshScope + 配置变更事件 → 重新加载 RouteDefinition
  RouteDefinitionRepository.findAll() → 重新构建路由表
  通知 RoutePredicateHandlerMapping 刷新

Nacos 动态路由：
  Nacos 配置变更 → @RefreshScope 触发
  → NacosRouteDefinitionRepository 重新拉取路由配置
  → 更新内存中的路由表
  → 新请求使用新路由
```

### 3.4 鉴权过滤器示例

```java
@Component
public class AuthFilter implements GlobalFilter, Ordered {
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String token = exchange.getRequest().getHeaders().getFirst("Authorization");
        if (token == null || !validate(token)) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }
        // 传递用户信息到下游
        exchange.getRequest().mutate()
            .header("X-User-Id", parseUserId(token));
        return chain.filter(exchange);
    }
    
    @Override
    public int getOrder() {
        return -100;  // 高优先级（先执行）
    }
}
```

---

## 四、OpenFeign 调用链

### 4.1 调用流程

```
@FeignClient 接口 → JdkDynamicProxy 代理
  → FeignInvocationHandler.invoke()
  → SynchronousMethodHandler.invoke()
  → Client.execute() → HTTP 请求

负载均衡集成：
  Client = RibbonLoadBalancerClient / SpringCloudLoadBalancer
  → 从 LoadBalancer 获取实例列表
  → 按负载均衡策略选择实例
  → 发送 HTTP 请求
```

### 4.2 源码关键路径

```
Feign 调用链：
  1. @FeignClient("user-service") → 创建代理对象
  2. 代理对象.method() → FeignInvocationHandler.invoke()
  3. SynchronousMethodHandler.invoke() → 构建 MethodMetadata
  4. Client.execute() → 发送 HTTP 请求
  5. LoadBalancerClient.choose() → 选择实例
  6. 发送请求 → 获取响应 → 反序列化

负载均衡：
  Spring Cloud LoadBalancer（默认）：
    RoundRobinLoadBalancer — 轮询
    RandomLoadBalancer — 随机
    
  Ribbon（旧版）：
    RoundRobinRule — 轮询
    RandomRule — 随机
    BestAvailableRule — 最小并发
    ZoneAvoidanceRule — 区域亲和
```

---

## 五、Sentinel 滑动窗口统计

### 5.1 核心数据结构

```
LeapArray（滑动窗口）：
  = 固定长度的环形数组（默认 2 个窗口，每个窗口 1s）
  → 每个窗口 = Bucket（桶，包含计数器）

计数器 MetricBucket：
  EXCEPTION = 异常计数
  SUCCESS = 成功计数
  RT = 响应时间总和
  OCCUPIED_PASS = 通过计数（QPS 模式）

窗口计算：
  当前时间 / 窗口大小 = 窗口索引
  → 找到对应的 Bucket
  → 如果过期 → 重置并复用
  → 更新计数器
```

### 5.2 熔断状态机

```
CLOSED（关闭）→ OPEN（打开）→ HALF_OPEN（半开）→ CLOSED

CLOSED → OPEN：
  异常比例 > 阈值（如 50%）→ 熔断开启
  慢调用比例 > 阈值 → 熔断开启
  异常数 > 阈值 → 熔断开启

OPEN → HALF_OPEN：
  熔断时长结束（如 10s）→ 进入半开

HALF_OPEN → CLOSED：
  半开期间请求成功 → 熔断关闭

HALF_OPEN → OPEN：
  半开期间请求失败 → 重新熔断
```

### 5.3 源码关键路径

```
Sentinel 执行链：
  1. @SentinelResource → SentinelResourceAspect 拦截
  2. SphU.entry(resource) → 获取令牌
  3. Entry 持有 Chain（ProcessorSlotChain）
  4. Chain 中按顺序执行 Slot：
     NodeSelectorSlot → 构建调用树
     ClusterBuilderSlot → 聚合统计
     StatisticSlot → 统计计数（滑动窗口）
     FlowSlot → 流控判断（QPS/线程数）
     DegradeSlot → 熔断判断（异常比例/慢调用）
     SystemSlot → 系统保护（CPU/Load）
  5. 通过 → 执行业务逻辑
  6. 异常/超时 → 触发 fallback
```

---

## 六、与其他板块的关系

- Spring Cloud Gateway 见「[Spring Cloud Gateway](../基础知识/中间件/SpringCloudGateway.md)」；
- Nacos 源码见「[Nacos](./Nacos.md)」；
- Sentinel 源码见「[sentinel](./sentinel.md)」；
- Dubbo RPC 见「[Dubbo 源码](./Dubbo源码.md)」；
- 微服务治理见「[微服务治理全链路](../架构/微服务治理全链路.md)」。

> 一句话：**Spring Cloud 源码核心 = 自动装配（@EnableXxx）+ Nacos Client（注册+拉取+长轮询）+ Gateway（WebFlux + Filter 链 + 动态路由）+ OpenFeign（代理+负载均衡）+ Sentinel（滑动窗口 + 熔断状态机）**。
