# HTTP 方法与幂等性语义

> 对应 RFC 9110《HTTP Semantics》第 9 节与 Kleppmann《Designing Data-Intensive Applications》关于幂等的讨论。

## 一、背景与挑战

HTTP 定义了一组方法（GET、HEAD、POST、PUT、DELETE、PATCH、OPTIONS、TRACE），其中「安全（safe）」与「幂等（idempotent）」是两条关键语义属性。它们不是风格偏好，而是分布式系统正确性的基础：客户端和中间代理据此决定能否重试、能否缓存、能否预取。

误用方法语义，会让一次网络抖动变成重复下单；也会让本可缓存的请求无法命中。因此理解「副作用一致」而非「响应一致」是核心。

## 二、核心原理

- **安全方法**：GET、HEAD、OPTIONS、TRACE 语义上不修改服务器资源状态（只读）。RFC 9110 明确：安全方法仅表示「预期不改变状态」，并不强制服务端实现无误。
- **幂等方法**：GET、HEAD、PUT、DELETE、OPTIONS、TRACE。语义是「同一请求执行一次与执行多次，对服务器状态产生的效果相同」。
- **非幂等**：POST、PATCH 通常不幂等（POST 追加资源、PATCH 做增量修改）。
- 关键区分：幂等约束的是**服务器状态的副作用**，不要求响应体或状态码逐字节一致。例如 DELETE 第二次返回 404 仍属幂等。

## 三、形式化与数学基础

设请求 $R$ 作用于服务器状态 $S$，其效果可表示为一个映射 $f_R: S \to S$。幂等要求：

$$f_R \circ f_R = f_R \quad\Longleftrightarrow\quad \forall S:\ f_R(f_R(S)) = f_R(S)$$

一般化到 $n$ 次重复：

$$f_R^{(n)}(S) = f_R(S), \quad \forall n \ge 1$$

安全方法更强，要求状态完全不变：

$$f_R(S) = S$$

可见「安全」蕴含「幂等」（恒等映射是幂等的），反之不成立。另外，幂等是「效果」层面的性质，与响应无关：

$$effect(R_1) = effect(R_2) \centernot\Rightarrow response(R_1) = response(R_2)$$

## 四、代码实现

幂等删除：无论资源是否已存在，最终状态一致。

```python
from flask import Flask, Response
app = Flask(__name__)
_storage = {}

@app.delete("/order/<order_id>")
def delete_order(order_id):
    # 已存在则删除；不存在则无操作
    _storage.pop(order_id, None)
    return Response(status=204)   # 两种情况下服务器状态都相同
```

用唯一键把 POST 变成幂等写：

```python
@app.post("/order")
def create_order():
    key = request.headers.get("Idempotency-Key")
    if key in _storage:                 # 同一业务操作重复到达
        return _storage[key], 200       # 直接返回首次结果，不重复创建
    order = create(request.json)
    _storage[key] = (order, 201)
    return _storage[key]
```

## 五、与其他技术对比

| 方法 | 安全（Safe） | 幂等（Idempotent） | 典型语义 |
| --- | --- | --- | --- |
| GET | 是 | 是 | 读取资源 |
| HEAD | 是 | 是 | 读取元信息 |
| OPTIONS | 是 | 是 | 查询能力 |
| PUT | 否 | 是 | 整体替换/创建 |
| DELETE | 否 | 是 | 删除 |
| POST | 否 | 否（可用幂等键改造） | 创建/提交 |
| PATCH | 否 | 否（取决于补丁） | 局部修改 |

RPC 风格常把所有操作映射为 POST，丢失方法语义；gRPC 在协议层不内建幂等，需业务自行保证。

## 六、常见误区

- 误区一：幂等等于响应相同。只要求副作用一致，响应码/体可以不同。
- 误区二：POST 永远不幂等。通过 Idempotency-Key 或唯一约束，可把创建变成幂等。
- 误区三：GET 绝对安全。实现 bug 或在 GET 中做副作用写入会违反规范，代理缓存与预取会放大问题。
- 误区四：PATCH 一定不幂等。若补丁是「设为某值」这种赋值语义，则可能幂等；「自增」这类增量语义则不幂等。

## 七、与开源书·权威来源对应

- RFC 9110《HTTP Semantics》第 9 节，定义方法的 safe 与 idempotent 属性。
- Fielding, R. (2000) 博士论文中 REST 的架构约束。
- Kleppmann, M.《Designing Data-Intensive Applications》，讨论重试安全与幂等。
- MDN 与 xiaolincoder/hello-http 的方法对照表可作为入门参考。

## 八、面试题

1. 哪些方法幂等？答：GET、HEAD、PUT、DELETE、OPTIONS、TRACE。
2. 幂等与安全的区别？答：安全要求状态不变，幂等只要求重复执行效果一致。
3. 如何把 POST 做成幂等？答：引入 Idempotency-Key 或业务唯一键，服务端去重。
4. 为什么 DELETE 是幂等？答：删除后再删除，最终状态都是「不存在」，效果相同。

## 九、演进与趋势

HTTP 语义在 RFC 9110 中统一整理，替代早期分散的 723x 系列。一些规范（如 JSON:API、Stripe/OpenAI 的 API）约定 `Idempotency-Key` 头来显式保证写操作幂等，逐渐成为业界标准实践。

## 十、小结

幂等性是 HTTP 方法语义的核心属性。抓住「副作用一致而非响应一致」这一判据，就能正确选择方法、设计可安全重试的接口，并理解「安全」只是「幂等」的特例。
