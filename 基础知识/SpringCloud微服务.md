# Spring Cloud 微服务整合（Nacos / Sentinel / Seata / Gateway / 链路追踪）

> Spring Cloud = **Java 微服务治理的事实标准**。本篇聚焦 Spring Cloud Alibaba 生态的完整集成实战：Nacos（注册+配置）+ Sentinel（限流熔断）+ Seata（分布式事务）+ Gateway（网关）+ Sleuth/Zipkin（链路追踪），给出可直接落地的架构方案。

---

## 一、Spring Cloud 全景

```
Spring Cloud 生态：
  服务发现：Nacos / Eureka / Consul
  配置中心：Nacos Config / Apollo / Spring Cloud Config
  网关：Spring Cloud Gateway
  熔断：Sentinel / Resilience4j
  负载均衡：Spring Cloud LoadBalancer / Ribbon
  链路追踪：Sleuth + Zipkin / Micrometer Tracing
  分布式事务：Seata
  消息驱动：Spring Cloud Stream + RocketMQ/Kafka
  消费者驱动：OpenFeign（声明式 HTTP 客户端）
```

### 1.1 技术选型推荐

| 组件 | 推荐 | 备选 |
|------|------|------|
| 注册+配置 | Nacos（一站式） | Consul |
| 网关 | Spring Cloud Gateway | Kong |
| 熔断 | Sentinel（阿里生态） | Resilience4j |
| 分布式事务 | Seata（AT 模式） | 本地消息表 |
| 链路追踪 | Sleuth + Zipkin | SkyWalking |
| 消息 | RocketMQ | Kafka |

---

## 二、Nacos（注册+配置中心）

### 2.1 核心能力

```
Nacos = 服务注册发现 + 配置管理（一个组件解决两个问题）

服务注册：
  Provider 启动 → 注册到 Nacos（IP/端口/元数据）
  Consumer 启动 → 从 Nacos 拉取服务列表
  Provider 变更 → Nacos 长轮询推送 → Consumer 实时感知

配置管理：
  配置变更 → Nacos 推送 → 客户端 @RefreshScope 自动刷新
  多环境：data-id + group + namespace 隔离
```

### 2.2 配置示例

```yaml
# application.yml
spring:
  cloud:
    nacos:
      discovery:
        server-addr: nacos-server:8848
        namespace: dev
        group: DEFAULT_GROUP
      config:
        server-addr: nacos-server:8848
        file-extension: yaml
        group: DEFAULT_GROUP
        shared-configs:
          - data-id: common.yaml
            group: DEFAULT_GROUP
            refresh: true
```

### 2.3 集群部署

```
Nacos 集群（3 节点起步）：
  1. 部署 3 个 Nacos 实例
  2. 配置 cluster.conf（节点 IP 列表）
  3. 前置 Nginx 做负载均衡
  4. 客户端配置 Nginx 地址

数据一致性：
  Distro 协议（AP）：临时实例（服务注册）
  Raft 协议（CP）：持久实例（配置管理）
```

---

## 三、Sentinel（限流熔断）

### 3.1 核心概念

```
Sentinel = 流量控制 + 熔断降级 + 系统负载保护

流控规则：
  QPS 模式：限制每秒请求数
  线程数模式：限制并发线程数
  关联模式：当关联资源达到阈值时限流

熔断规则：
  慢调用比例：RT > 阈值的比例超过阈值 → 熔断
  异常比例：异常比例超过阈值 → 熔断
  异常数：异常数超过阈值 → 熔断
```

### 3.2 集成示例

```java
// 限流
@SentinelResource(value = "queryUser", blockHandler = "queryUserBlock")
public User queryUser(Long id) {
    return userService.getById(id);
}

public User queryUserBlock(Long id, BlockException ex) {
    return new User("默认用户");  // 降级返回
}

// 熔断降级
@SentinelResource(value = "callRemote", fallback = "callRemoteFallback")
public String callRemote() {
    return remoteService.call();
}

public String callRemoteFallback(Throwable ex) {
    return "降级响应";  // 异常降级
}
```

### 3.3 Dashboard 配置

```
Sentinel Dashboard（实时监控+规则配置）：
  访问：http://dashboard:8080
  功能：实时监控 / 流控规则 / 熔断规则 / 系统规则 / 热点规则
  持久化：规则推送到 Nacos/ZK（重启不丢失）
```

---

## 四、Seata（分布式事务）

### 4.1 四种模式

| 模式 | 原理 | 侵入性 | 性能 | 适用 |
|------|------|--------|------|------|
| AT | 自动生成回滚 SQL | 无 | 高 | 通用（默认推荐） |
| TCC | 手动实现 Try/Confirm/Cancel | 高 | 最高 | 高性能场景 |
| SAGA | 长事务编排（正向+补偿） | 中 | 中 | 长事务 |
| XA | 数据库两阶段提交 | 无 | 低 | 强一致 |

### 4.2 AT 模式集成

```java
// 1. 添加注解
@GlobalTransactional  // 分布式事务入口
public void createOrder(OrderDTO dto) {
    // 2. 调用库存服务（远程）
    stockService.deduct(dto.getSkuId(), dto.getCount());
    // 3. 创建订单（本地）
    orderMapper.insert(dto);
    // Seata 自动管理回滚
}

// 4. 库存服务
@Transactional
public void deduct(Long skuId, int count) {
    // Seata 自动生成 before image / after image
    stockMapper.deduct(skuId, count);
}
```

### 4.3 AT 模式原理

```
一阶段（自动）：
  1. 解析 SQL，记录 before image
  2. 执行业务 SQL
  3. 记录 after image
  4. 生成 undo log
  5. 提交本地事务（数据已提交）
  6. 通知 TC（事务协调器）

二阶段-提交：
  TC 通知所有分支提交 → 删除 undo log（异步，不阻塞）

二阶段-回滚：
  TC 通知所有分支回滚 → 根据 undo log 生成反向 SQL 执行
```

---

## 五、Spring Cloud Gateway（网关）

### 5.1 核心架构

```
请求 → Gateway（WebFlux 响应式）
  → RoutePredicateHandlerMapping（匹配路由）
  → FilteringWebHandler（执行过滤器链）
  → ProxyWebFilter（转发到后端服务）

路由配置：
  predicates: 匹配条件（Path/Header/Method/Query）
  filters: 处理逻辑（鉴权/限流/重写/灰度）
  uri: 后端服务地址（lb://service-name）
```

### 5.2 鉴权过滤器

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
}
```

---

## 六、链路追踪

### 6.1 Sleuth + Zipkin

```
Sleuth = 自动生成 TraceId/SpanId（贯穿整个调用链）
Zipkin = 可视化调用链（延迟/错误/依赖关系）

集成：
  1. 引入 spring-cloud-starter-sleuth + spring-cloud-sleuth-zipkin
  2. 配置 zipkin.base-url
  3. 自动注入 TraceId/SpanId 到日志
  4. 日志格式：[app-name, trace-id, span-id, export]
```

### 6.2 日志关联

```java
// 日志自动带 TraceId
log.info("查询用户 {}", userId);
// 输出：[user-service, abc123, def456, true] 查询用户 123

// 手动传递上下文
Span span = tracer.nextSpan().name("custom-operation").start();
try (Tracer.SpanInScope ws = tracer.withSpan(span)) {
    // 业务逻辑
} finally {
    span.end();
}
```

---

## 七、完整架构示例

```
                    ┌─────────────┐
                    │   Nginx LB  │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │   Gateway   │  ← 限流/鉴权/路由
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         ┌────┴────┐ ┌────┴────┐ ┌────┴────┐
         │ 订单服务 │ │ 库存服务 │ │ 用户服务 │
         └────┬────┘ └────┬────┘ └────┬────┘
              │            │            │
              └────────────┼────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         ┌────┴────┐ ┌────┴────┐ ┌────┴────┐
         │  Nacos  │ │ Sentinel│ │  Seata  │
         │注册+配置│ │限流熔断  │ │分布式事务│
         └─────────┘ └─────────┘ └─────────┘
```

---

## 八、与其他板块的关系

- Spring Cloud Gateway 见「[Spring Cloud Gateway](../基础知识/中间件/SpringCloudGateway.md)」；
- Nacos 源码见「[源码系列/Nacos](../源码系列/Nacos.md)」；
- Sentinel 源码见「[源码系列/Sentinel](../源码系列/sentinel.md)」；
- Seata 详细见「[分布式事务 Seata](../基础知识/中间件/分布式事务Seata.md)」；
- 微服务治理见「[架构/微服务治理全链路](../架构/微服务治理全链路.md)」。

> 一句话：**Spring Cloud Alibaba = Nacos（注册+配置）+ Sentinel（限流熔断）+ Seata（分布式事务）+ Gateway（网关）——微服务全家桶，先跑通一个完整 demo，再逐个深入**。
