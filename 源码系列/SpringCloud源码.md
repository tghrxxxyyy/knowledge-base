# Spring Cloud 源码解析（服务治理全家桶）

> Spring Cloud 是 **Java 微服务治理的事实标准**：以 Spring Boot 为基础，提供服务发现/配置中心/网关/熔断/链路追踪等一站式能力。本篇按「核心组件源码 → 关键流程」拆解，聚焦 Nacos/Eureka（注册发现）、Gateway（网关）、Sentinel（熔断）三个核心组件的源码机制。

---

## 一、Spring Cloud 核心架构

```
应用代码（Spring Boot）
  → Spring Cloud 自动装配（@EnableXxx）
  → 核心组件：
      服务发现：Nacos/Eureka/Consul（注册中心）
      配置中心：Nacos Config/Apollo/Spring Cloud Config
      网关：Spring Cloud Gateway（路由/鉴权/限流）
      熔断：Sentinel/Hystrix（限流/熔断/降级）
      负载均衡：Spring Cloud LoadBalancer / Ribbon
      链路追踪：Sleuth + Zipkin / Micrometer Tracing
```

---

## 二、服务发现源码

### 2.1 Nacos Client 源码

```
核心类：
  NacosDiscoveryClient   — 注册发现客户端
  NacosServiceInstance   — 服务实例
  NacosDiscoveryProperties — 配置属性

启动流程：
  1. @EnableDiscoveryClient → 导入 DiscoveryClientAutoConfiguration
  2. NacosDiscoveryClient 注册到 Spring 容器
  3. 定时任务：每 10s 从 Nacos 拉取服务列表（pull 模式）
  4. 推送机制：Nacos 长轮询（Long Polling）变更通知

服务注册：
  ApplicationStartEvent → NacosServiceRegistry.register()
    → 调用 Nacos API：PUT /nacos/v1/ns/instance
    → 携带 IP/端口/权重/元数据/健康状态
```

### 2.2 Eureka Client 源码

```
与 Nacos 的区别：
  Eureka = P2P 架构（每个节点都是对等的，无主从）
  Nacos = 集群模式（Leader/Follower + Raft）

Eureka 启动流程：
  1. @EnableEurekaClient → DiscoveryClient
  2. 启动后台线程：register → heartbeat → fetchRegistry
  3. register：POST /eureka/apps/{app}（注册）
  4. heartbeat：PUT /eureka/apps/{app}/{instance}（续约，30s）
  5. fetchRegistry：GET /eureka/apps（全量拉取，30s）

Eureka 保护机制（自我保护）：
  15 分钟内心跳失败 < 85% → 进入保护模式 → 不剔除实例（防误删）
```

---

## 三、Spring Cloud Gateway 源码

### 3.1 核心架构

```
请求 → DispatcherHandler（WebFlux 调度）
  → RoutePredicateHandlerMapping（匹配路由）
  → FilteringWebHandler（执行过滤器链）
  → ProxyWebFilter（转发到后端）

过滤器链 = GlobalFilter（全局）+ GatewayFilter（路由级）
  → 按 order 排序依次执行
  → pre（前置）→ 转发 → post（后置）
```

### 3.2 核心源码

```
核心类：
  RouteDefinitionLocator      — 路由定义加载（YAML/配置中心/Nacos）
  RoutePredicateHandlerMapping — 路由匹配（Path/Header/Method 等）
  GatewayFilterChain          — 过滤器链执行
  NettyRoutingFilter          — 底层 Netty HTTP 转发
  GlobalFilter                — 全局过滤器（鉴权/限流/日志）

请求流程：
  1. HTTP 请求 → DispatcherHandler
  2. RoutePredicateHandlerMapping 遍历所有路由，匹配 predicate
  3. 匹配到路由 → 构建 GatewayFilterChain
  4. 执行 pre filter（如 TokenRelayFilter 鉴权）
  5. NettyRoutingFilter 转发到后端服务
  6. 执行 post filter（如响应头修改）
  7. 返回客户端
```

### 3.3 动态路由

```
路由配置来源：
  YAML 文件（bootstrap.yml）— 静态
  Nacos Config — 动态推送（配置变更 → 刷新路由）
  自定义 RouteDefinitionRepository — 代码动态添加

动态刷新机制：
  @RefreshScope + 配置变更事件 → 重新加载 RouteDefinition
```

---

## 四、Sentinel 熔断源码（简要）

```
核心流程：
  1. @SentinelResource 注解 → SentinelResourceAspect 拦截
  2. SphU.entry(resource) — 获取令牌（滑动窗口计数）
  3. 通过 → 执行业务逻辑
  4. 异常/超时 → 触发 fallback（降级）
  5. 滑动窗口：LeapArray 统计 QPS/RT/异常率
  6. 熔断规则：异常比例/慢调用比例/异常数 → 打开/半开/关闭

关键类：
  LeapArray — 滑动窗口统计
  StatisticSlot — 统计入口
  DegradeSlot — 熔断判断
  FlowSlot — 流控判断
```

---

## 五、与其他板块的关系

- Spring Cloud Gateway 详细见「[Spring Cloud Gateway](../基础知识/中间件/SpringCloudGateway.md)」；
- Nacos 源码见「[Nacos](./Nacos.md)」；
- Sentinel 源码见「[sentinel](./sentinel.md)」；
- Dubbo RPC 见「[Dubbo 源码](./Dubbo源码.md)」；
- 微服务治理见「[架构/微服务治理全链路](../架构/微服务治理全链路.md)」。

> 一句话：**Spring Cloud 源码核心 = 自动装配（@EnableXxx）+ 服务发现（Nacos Client 注册+拉取+长轮询）+ Gateway（WebFlux + 过滤器链 + 动态路由）+ Sentinel（滑动窗口 + 熔断状态机）**。
