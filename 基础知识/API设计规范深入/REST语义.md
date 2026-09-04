# REST语义

> 对应 Fielding 博士论文 "Architectural Styles and the Design of Network-based Software Architectures"、Richardson 成熟度模型。

## 一、背景与挑战
HTTP API 常被当作远程过程调用（RPC）来用，资源与动词混乱，缓存、状态码等 Web 基础设施优势被浪费。

## 二、核心原理
REST 以"资源"为中心，用 URI 标识资源、HTTP 方法（GET/POST/PUT/PATCH/DELETE）表达动作、状态码表达结果、无状态请求。Richardson 成熟度模型分 0~3 级。

## 三、形式化 / 数学基础
资源集合 $R$，每个资源 $r\in R$ 有统一接口 $U=\{GET,POST,PUT,PATCH,DELETE\}$。幂等性：$\forall m\in\{GET,PUT,DELETE\}, safe(m)\Rightarrow idempotent(m)$；GET/HEAD 安全（$safe$）。

## 四、代码实现
```http
GET    /orders/123        # 获取
POST   /orders            # 创建
PUT    /orders/123        # 整体替换
PATCH  /orders/123        # 局部更新
DELETE /orders/123        # 删除
```

## 五、与其他技术对比
与 RPC/GraphQL 相比，REST 利用 HTTP 语义与缓存；GraphQL 解决过度/不足获取，但缓存与缓存键更复杂。

## 六、常见误区
误区：用 POST 做所有操作、把动词塞进 URL（如 /getOrder）。误区：滥用 200 包揽所有结果。

## 七、与开源书 / 权威来源对应
Fielding, R. 博士论文（2000）；Richardson, L. "RESTful Web APIs"；CS-Notes: https://github.com/CyC2018/CS-Notes

## 八、面试题
"REST 的无状态指什么？PUT 与 PATCH 区别？"

## 九、演进与趋势
HATEOAS（成熟度3）在实践中采用有限；OpenAPI + JSON:API 规范流行。

## 十、小结
以资源与 HTTP 语义建模，换取可缓存与可演进。
