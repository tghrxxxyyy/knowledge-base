# REST语义

> 对应 Fielding 博士论文《Architectural Styles and the Design of Network-based Software Architectures》与 Richardson 成熟度模型。

## 一、背景与挑战

HTTP API 常被当作远程过程调用（RPC）来用：用 POST 包揽一切、把动词塞进 URL（如 `/getOrder`）、滥用 200 包揽所有结果。这浪费了 Web 基础设施（缓存、状态码、代理）的优势，也使接口难以演进与统一。REST 的语义化建模正是为解决这一混乱。

从治理视角，REST 语义还带来「可预测性」：新成员能凭约定猜出接口形状，网关能按方法做统一鉴权与限流，缓存能按 GET 安全缓存。失去语义，这些能力全部失效，API 退化为一堆不可推理的端点。

## 二、核心原理

REST 以「资源」为中心：用 URI 标识资源、HTTP 方法（GET/POST/PUT/PATCH/DELETE）表达动作、状态码表达结果、请求无状态（每次自带完整上下文）。Richardson 成熟度模型分 0~3 级：0 仅用 HTTP 作隧道；1 引入资源；2 正确使用动词与状态码；3 引入 HATEOAS（超媒体驱动）。语义化建模让缓存、重试、网关策略天然生效。

从落地视角，无状态要求服务端不在请求间保存客户端会话状态，会话信息（如 token）应由客户端携带，这使水平扩展与故障转移更简单，是 REST 可伸缩性的根基。

关键要点：

- REST 以资源为中心，用 URI 标识资源、方法表达动作。
- Richardson 成熟度 0~3：隧道→资源→动词/状态码→HATEOAS。
- 无状态要求每次请求自带完整上下文，利于水平扩展。
- GET 安全、PUT/DELETE 幂等、POST 非幂等需幂等键保护。
- 滥用 200 包揽结果会丧失缓存与重试语义。
- 资源是业务概念而非数据库表，不应 1:1 映射。

## 三、形式化与数学基础

资源集合 $R$，每个资源 $r\in R$ 有统一接口 $U=\{GET,POST,PUT,PATCH,DELETE\}$。安全与幂等性质：

$$
\forall m \in \{GET, HEAD, OPTIONS\}:\ \text{safe}(m) = \text{true}
$$
$$
\forall m \in \{GET, PUT, DELETE\}:\ \text{idempotent}(m) = \text{true}
$$

其中幂等定义为 $f(f(x)) = f(x)$。POST 既非安全也非幂等，故不可无保护重试；PUT 幂等要求「多次全量替换结果相同」，PATCH 则未必。

## 四、代码实现

```http
GET    /orders/123        # 获取（安全、幂等）
POST   /orders            # 创建（非幂等）
PUT    /orders/123        # 整体替换（幂等）
PATCH  /orders/123        # 局部更新（非安全，通常非幂等）
DELETE /orders/123        # 删除（幂等）
```
```python
# 按方法路由到语义处理
handlers = {
    "GET": get_order, "POST": create_order,
    "PUT": replace_order, "PATCH": update_order,
    "DELETE": delete_order,
}
```

## 五、与其他技术对比

| 风格 | 资源中心 | 利用 HTTP 语义 | 缓存 | 过度/不足获取 |
|------|----------|----------------|------|----------------|
| RPC | 否 | 否 | 难 | — |
| REST | 是 | 是 | 易 | 有 |
| GraphQL | 否（图查询） | 部分 | 难 | 可控 |
| gRPC | 否 | 否（HTTP/2） | 否 | 无 |

## 六、常见误区

误区一：用 POST 做所有操作、把动词塞进 URL——违背资源建模，丧失缓存与安全语义。

误区二：滥用 200 包揽所有结果——应让 4xx/5xx 表意图，否则监控与重试全乱。

误区三：把 REST 当数据库直映射——资源是业务概念而非表，强行 1:1 会暴露内部模型。

误区四：认为 HATEOAS 必须——成熟度 3 在实践中采用有限，按需即可，不必强求。

误区五：忽视幂等性——对 PUT/DELETE 的客户端重试是安全的，对 POST 重试需幂等键保护。

补充误区：

- 误区六：REST 必须无状态存储——指请求间不存客户端状态，服务端可存资源。
- 误区七：PATCH 一定幂等——取决于语义，多数实现非幂等需幂等键保护。
- 误区八：状态码只给 200/500——细粒度 4xx/5xx 是 REST 语义的一部分。
- 误区九：HATEOAS 是必须——成熟度 3 实践中采用有限，按需即可。

## 七、与开源书·权威来源对应

Fielding, R. 博士论文（2000）定义 REST 架构约束；Richardson, L.《Restful Web APIs》提出成熟度模型；JSON:API 规范统一资源互操作；CS-Notes 汇总 REST 与 RPC 取舍；HTTP/1.1 规范定义方法与状态码语义。OpenAPI 以资源为中心描述端点，与 REST 语义天然契合。

## 八、面试题

REST 的无状态指什么？PUT 与 PATCH 区别？为何 GET 必须安全？REST 相比 RPC 的优势？HATEOAS 是什么？为何 POST 重试需幂等键？

## 九、演进与趋势

HATEOAS（成熟度 3）采用有限；OpenAPI + JSON:API 成为事实标准；GraphQL 解决过度/不足获取但牺牲缓存简单性；gRPC 在内部服务间流行。REST 仍是面向外部的稳健默认，并与 OAuth2/OpenID 等标准组合成现代 API 安全基座，向「资源 + 统一语义 + 契约」演进。

## 十、小结

以资源与 HTTP 语义建模，换取可缓存、可演进与基础设施友好；理解安全/幂等性是正确设计 REST 接口的前提，无状态则是其水平可伸缩的根基。
