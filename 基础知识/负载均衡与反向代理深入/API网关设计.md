# API网关设计

> 对应 API Gateway 模式；云原生网关实践。

## 一、背景与挑战
微服务众多，客户端若直连每个服务会面临地址暴露、协议异构、认证重复、限流难统一等问题。API 网关作为统一入口聚合这些横切关注点。

## 二、核心原理
网关位于 L7，承担：路由（path→服务）、认证授权、限流熔断、协议转换（HTTP↔gRPC）、请求聚合、日志监控、WAF。核心是“路由表 + 插件链（middleware pipeline）”。

## 三、形式化 / 数学基础
路由匹配：按 $(method, host, path\ prefix, header)$ 最长前缀/优先级匹配得 $target\ service$。
限流令牌桶（见 SUB7）：速率 $r$、容量 $b$。
插件链：$req \xrightarrow{P_1}\xrightarrow{P_2}...\xrightarrow{P_k} upstream$。

## 四、代码实现
```yaml
# 网关路由示例（伪配置）
routes:
  - match: { path: /user/** }   -> service: user-svc:8080
    plugins: [jwt-auth, rate-limit(r=100/s), prometheus]
  - match: { path: /order/** }  -> service: order-svc:8080
    plugins: [oauth2, circuit-breaker]
```

## 五、与其他技术对比
网关是“策略与聚合层”；反向代理偏转发；服务网格 sidecar 把同类能力下沉到每个服务旁，网关仍是南北向入口。BFF（Backend For Frontend）是网关的按客户端特化形态。

## 六、常见误区
误区一：网关能解决一切。错，它也是瓶颈与单点，需高可用。误区二：网关做重业务逻辑。错，应只做横切，业务下沉服务。误区三：网关=ESB。错，ESB 偏企业集成、重编排，网关轻量。

## 七、与开源书 / 权威来源对应
- CS-Notes：https://github.com/CyC2018/CS-Notes
- 云原生网关（Envoy/Kong/APISIX）文档、Kurose & Ross 第 4 章。

## 八、面试题
1. 网关与反向代理区别？2. 网关为什么不能放重业务？

## 九、演进与趋势
与 Service Mesh 融合（网关 + sidecar 统一数据面）；WebAssembly 插件让网关逻辑可热插拔。

## 十、小结
API 网关统一承担路由、认证、限流、聚合等横切关注点，是微服务南北向流量中枢。
