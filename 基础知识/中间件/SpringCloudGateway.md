# Spring Cloud Gateway（Java 网关 / Spring 生态路由）

> Spring Cloud Gateway 是 **Spring 官方出品的响应式网关**，基于 WebFlux（Netty + Reactor），以「非阻塞 + 路由断言 + 过滤器链 + 动态路由」成为 Java/Spring 生态微服务网关首选。相比 Zuul 1（Servlet 阻塞式，已停更）、Kong/APISIX（Lua 生态）、Envoy（云原生），它以「与 Spring Cloud 生态无缝集成 + Java 编程模型」独树一帜。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| Spring 生态统一入口 | 微服务众多，需要与 Nacos/Eureka 注册中心联动的网关 |
| 阻塞式网关瓶颈 | Zuul 1 基于 Servlet 线程池，高并发线程耗尽 |
| 路由规则复杂 | 按路径/Host/Header/Query/权重灵活分发 |
| 横切逻辑重复 | 鉴权/限流/日志在每个服务重复实现 |
| 动态路由 | 服务上下线/规则调整需热生效 |

> 核心认知：**Spring Cloud Gateway = 响应式（非阻塞）+ Route（路由）+ Predicate（断言）+ Filter（过滤器）**——请求按「断言」匹配「路由」，经过「过滤器链」处理。

---

## 二、核心原理

### 2.1 架构

```
Client → Gateway HandlerMapping（匹配 Route）
  ├── Predicate（断言：Path/Host/Method/Header/Query/Cookie/Weight...）
  ├── Route（路由：id + 断言 + URI + 过滤器列表）
  ├── Global Filter（全局过滤器：NettyRoutingFilter 等）
  ├── Gateway Filter（路由级过滤器：限流/重写/熔断/重试）
  └── Netty Routing Filter → 转发到下游服务（WebFlux 非阻塞）
```

- **底层是 WebFlux**：Netty 事件循环 + Reactor，**一个线程处理海量连接**（对比 Zuul 1 一请求一线程）；
- **Route = id + Predicate + URI + Filters**：核心配置模型。

### 2.2 路由配置（yml）

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: order-service
          uri: lb://order-service        # lb:// 走注册中心负载均衡
          predicates:
            - Path=/api/order/**
            - Weight=group1, 90          # 权重路由（灰度）
          filters:
            - StripPrefix=2              # 去掉 /api/order 前缀
            - AddRequestHeader=X-Trace, 12345
            - name: RequestRateLimiter   # 限流过滤器
              args:
                redis-rate-limiter.replenishRate: 10
                redis-rate-limiter.burstCapacity: 20
                key-resolver: "#{@userKeyResolver}"
```

### 2.3 过滤器链（Filter 执行顺序）

```
请求 → ① 前置 Filter（鉴权/限流/Header 改写）
     → ② 路由 Filter（熔断/重试/改写响应）
     → ③ 后置 Filter（日志/指标）
```

| Filter | 说明 |
|--------|------|
| GlobalFilter | 全局生效（自定义鉴权/日志） |
| RequestRateLimiter | Redis + 令牌桶限流（配合 KeyResolver 按用户/IP 限流） |
| CircuitBreaker | 集成 Resilience4J/Sentinel 熔断降级 |
| Retry | 下游失败重试 |
| RewritePath / StripPrefix | 路径重写 |
| AddRequestHeader / AddResponseHeader | Header 注入 |
| FallbackHeaders | 熔断降级响应 |

### 2.4 动态路由（Nacos 集成）

- 方式一：`spring.cloud.gateway.discovery.locator.enabled=true`（自动按服务名生成路由）；
- 方式二：Nacos 配置中心下发路由配置，监听刷新（RouteDefinitionRepository 自定义）；
- 方式三：Nacos 网关插件（`spring-cloud-starter-alibaba-nacos` 动态路由）。

**选型关注点**：动态路由是生产刚需——服务扩容/灰度切流必须热生效，推荐 Nacos 下发 + 监听刷新。

---

## 三、核心特性

| 特性 | 说明 |
|------|------|
| 非阻塞 | WebFlux + Netty，高并发低资源占用 |
| 断言丰富 | Path/Host/Method/Header/Query/Cookie/RemoteAddr/Weight |
| 过滤器链 | 全局 + 路由级 + 自定义，编程友好 |
| 注册中心集成 | lb:// + Nacos/Eureka 自动发现 |
| 限流 | Redis 令牌桶（RequestRateLimiter） |
| 熔断降级 | Resilience4J / Sentinel 集成 |
| 重试 | 内置 RetryFilter（指数退避） |
| 灰度 | Weight 断言 + Nacos 灰度路由 |
| 可观测 | 内置 Metrics（Micrometer）+ 链路透传 |
| CORS/WebSocket | 原生支持 |

---

## 四、对比：Spring Cloud Gateway vs Kong/APISIX vs Zuul

| 维度 | Spring Cloud Gateway | Kong/APISIX | Zuul 1（已停更） |
|------|----------------------|-------------|------------------|
| 语言 | Java（WebFlux/Netty） | Lua（OpenResty） | Java（Servlet） |
| 模型 | 非阻塞响应式 | 非阻塞事件驱动 | 阻塞式（线程池） |
| 性能 | 高 | 最高 | 低（线程耗尽） |
| 路由配置 | yml + 代码 | Admin API + Dashboard | yml |
| 动态生效 | 需配置中心配合 | 原生全动态 | 弱 |
| 插件生态 | Java 编码 | 80+ 插件 | 弱 |
| 注册中心 | Nacos/Eureka 原生 | 需插件 | Eureka |
| 学习成本 | 低（Java 团队） | 中（Lua） | 低 |
| 云原生 | 一般 | 强（Ingress/多语言插件） | 无 |

**选型关注点**：纯 Java/Spring Cloud 生态 → **Spring Cloud Gateway**（开发效率最高）；跨语言/高性能/云原生 → **Kong/APISIX**；新项目禁止用 Zuul 1（阻塞 + 停更）。

---

## 五、生产实践

### 5.1 关键配置

| 配置 | 建议 |
|------|------|
| 限流 | Redis 令牌桶 + 按用户/接口 KeyResolver |
| 超时 | `httpclient.response-timeout` 设置下游超时（防线程挂起） |
| 连接池 | `httpclient.pool.max-connections`（默认 500） |
| 重试 | 只对 GET 等幂等请求开重试 |
| 线程 | WebFlux 是事件循环，业务阻塞操作必须异步化（否则毁掉吞吐） |

### 5.2 常见坑

- **阻塞代码（JDBC/Thread.sleep）放进过滤器**：会阻塞 Netty 事件循环，务必用 `Mono.fromCallable(..., Schedulers.boundedElastic())`；
- **默认无路由时 404**：注意 `RouteDefinitionLocator` 顺序/命名冲突；
- **WebSocket 支持**：原生支持但需注意 `httpclient` 配置与 WebSocket 握手超时；
- **链路透传**：需自定义 GlobalFilter 透传 TraceId（配合 SkyWalking/OTel）。

---

## 六、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| Spring Cloud 微服务 | Spring Cloud Gateway | Kong/APISIX |
| 高并发大流量 | Kong/APISIX | Spring Cloud Gateway |
| Java 团队自定义逻辑 | Spring Cloud Gateway | — |
| 云原生 Ingress | APISIX/Kong | Traefik |
| 已有 Nginx 基础设施 | OpenResty | Kong |

---

## 七、与其他板块的关系

- 网关选型总览见「[API 网关](./API网关.md)」；
- Kong/APISIX 对比见「[Kong 与 APISIX 网关](./Kong与APISIX网关.md)」；
- 注册中心（Nacos/Eureka）见「[注册中心与配置中心](./注册中心与配置中心.md)」；
- 限流熔断见「[Sentinel 限流熔断](./Sentinel限流熔断.md)」；
- 链路追踪见「[链路追踪 SkyWalking](./链路追踪SkyWalking.md)」。

> 一句话：**Spring Cloud Gateway = WebFlux 非阻塞 + Route/Predicate/Filter 三件套 + lb:// 注册中心路由；选型先看「生态（Java→Spring Cloud Gateway，跨语言→Kong/APISIX）」，再定「路由策略（断言 + 权重灰度）」，最后配「限流（Redis）+ 熔断（Resilience4J/Sentinel）+ 动态路由（Nacos）」**。
