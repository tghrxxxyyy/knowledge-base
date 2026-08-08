# 异步 Servlet 与服务端推送

> 释放容器线程、提升吞吐的"HTTP 异步"专题：Servlet 3.0 `AsyncContext` 与 SpringMVC `DeferredResult` 的底层原理，以及轮询 / 长轮询 / SSE / WebSocket 四种服务端推送方式的选择。与「[长连接](长连接.md)」互链：长连接解决"连接复用与全双工"，异步 Servlet 解决"请求线程不阻塞"，二者常组合使用（如 Netty 网关 + SSE 下行）。

## 一、为什么需要 HTTP 异步

### 1.1 传统 Servlet 模型的痛点

- Tomcat 每个请求占用一个工作线程，从 `doGet/doPost` 返回（或 `asyncContext.complete()`）才释放。
- 若接口内部要做**慢操作**（调第三方 RPC 平均 3s、查多路数据、等待推送事件），线程会被占住数秒。
- 高并发下线程池（默认 200）迅速耗尽 → 新请求排队 → 吞吐断崖：**"线程被慢请求占死"** 是性能事故的常见根因。

```text
传统模型： 请求 → 线程T1 → 慢操作(3s) → 返回   （T1 阻塞 3s，期间不能服务其他请求）
异步模型： 请求 → 线程T1 → 提交异步 → T1 立刻释放 → 业务线程慢慢做 → 完成后回到 T1' 写响应
```

### 1.2 异步的目标

| 目标 | 说明 |
|------|------|
| 释放容器线程 | 慢请求不长期占用 Tomcat 工作线程，线程池效率最大化 |
| 提升吞吐 | 同等线程池下可支撑更多并发请求 |
| 支撑推送类场景 | SSE/长轮询本质是"挂起请求等事件"，必须异步才能不占线程 |

> ⚠️ 异步不降低单请求延迟，只是**提高并发承载**；若业务本身无慢操作/推送需求，引入异步反而增加复杂度。

## 二、Servlet 3.0 AsyncContext 原理

### 2.1 核心 API

- `request.startAsync()`：开启异步模式，返回 `AsyncContext`，此时 Servlet 线程可以返回，请求**挂起**在连接上。
- `asyncContext.setTimeout(ms)`：超时保护（默认 30s，超时触发 `onTimeout`）。
- 业务线程完成后：
  - `asyncContext.dispatch("/xxx")`：把请求**再次派发**回容器（重新进入 Servlet 生命周期，可复用原有 request/response）。
  - `asyncContext.complete()`：直接完成响应，不再回容器。
- `request.isAsyncStarted()`：判断当前是否异步模式。
- `addListener(AsyncListener)`：监听 `onStartAsync / onComplete / onTimeout / onError`。

### 2.2 完整示例

```java
@WebServlet(urlPatterns = "/async/hello", asyncSupported = true)
public class AsyncHelloServlet extends HttpServlet {
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        AsyncContext ctx = req.startAsync();
        ctx.setTimeout(10_000);
        ctx.addListener(new AsyncListener() {
            public void onTimeout(AsyncEvent e) { /* 超时兜底：写 503 */ }
            public void onComplete(AsyncEvent e) {}
            public void onError(AsyncEvent e) {}
            public void onStartAsync(AsyncEvent e) {}
        });
        // 丢到业务线程池异步执行，Servlet 线程立即返回
        ExecutorService bizPool.execute(() -> {
            try {
                String result = slowRpc();
                resp.setStatus(200);
                resp.setCharacterEncoding("UTF-8");
                resp.getWriter().write(result);
            } catch (Exception e) {
                resp.setStatus(500);
            } finally {
                ctx.complete();   // 关键：必须 complete，否则连接挂死
            }
        });
    }
}
```

> ⚠️ 业务线程池要**独立于 Tomcat 线程池**规划容量：线程池太小反而成新瓶颈，且需有拒绝策略（满了直接返回 503，而不是无限排队）。

## 三、SpringMVC DeferredResult / Callable

### 3.1 与 AsyncContext 的关系

SpringMVC 在 `DispatcherServlet` 之上封装了 Servlet 3.0 异步：

- **`Callable<T>`**：容器线程返回 `Callable` 后，Spring 用**内置线程池**执行它，完成后自动写响应——最省心，但无法细粒度控制响应头/超时。
- **`DeferredResult<T>`**：与 Callable 类似（也是走 `startAsync`），但执行体由**业务自己提交**，更灵活：可跨线程完成、可设超时回调、可返回部分响应头。

> 两者底层都是 `AsyncContext`（`RequestFacade.startAsync`），所以"没多大区别"；区别在使用层面：`AsyncContext` 原生 API 可自定义响应码、控制分片，`DeferredResult` 把"提交-完成"包装成了简单的两个方法。

### 3.2 DeferredResult 示例

```java
@RequestMapping("/api/order/status")
public DeferredResult<OrderVO> queryOrderStatus(@RequestParam long orderId) {
    // 超时 5s；超时后返回兜底结果
    DeferredResult<OrderVO> deferred = new DeferredResult<>(5_000L, OrderVO.timeout());
    deferred.onTimeout(() -> log.warn("order status timeout: {}", orderId));
    // 业务线程（MQ 消费/监听器等）完成后 setResult，容器自动写响应
    asyncOrderStatusHolder.register(orderId, deferred);
    return deferred;
}
```

```java
// 另一处：事件到来时完成
DeferredResult<OrderVO> d = asyncOrderStatusHolder.take(orderId);
if (d != null) {
    d.setResult(buildOrderVO(orderId));   // 完成后：容器线程收到结果，写响应并 complete
}
```

### 3.3 关键源码路径（粗略）

```text
DispatcherServlet.doDispatch
  ├─ 判断 handler 返回类型：DeferredResult / Callable / 普通对象
  ├─ DeferredResult → WebAsyncManager.startDeferredResultProcessing()
  │    ├─ 开启 request.startAsync()（连接挂起）
  │    └─ 注册 ResultHandler 监听 setResult
  ├─ 容器线程返回（不写响应）
  ├─ 业务线程 setResult() → 触发 Servlet3AsyncWebUtil → dispatch 回 DispatcherServlet
  └─ DispatcherServlet 拿到返回值 → 正常走 HandlerAdapter 写出响应
```

> 流程图记忆：**"挂起 → 容器线程释放 → 业务线程完成 → dispatch 回写"** 四个动作。

## 四、四种服务端推送方式对比

| 方式 | 原理 | 实时性 | 连接数开销 | 适用 |
|------|------|--------|-----------|------|
| 普通轮询 | 客户端定时问"有新数据吗" | 差（间隔即延迟） | 每次请求新建/复用 HTTP | 低实时、低频（如任务状态） |
| 长轮询（Long Polling） | 请求挂起直到有数据才返回，客户端收到后立即再发 | 好 | 每个客户端 1 个挂起请求 | 兼容老浏览器、低频推送 |
| SSE（Server-Sent Events） | HTTP 单向流，服务端持续写 `data:` 行 | 好 | 每个客户端 1 条长连接 | 服务端→客户端单向推送（通知/行情） |
| WebSocket | 升级为全双工 TCP 长连接 | 最好 | 每个客户端 1 条长连接 + 协议开销 | 双向高频（IM/弹幕/协同） |

### 4.1 SSE 与长轮询示例

```text
// SSE 响应头与消息格式
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"type":"price","symbol":"AAPL","price":192.3}\n\n
data: {"type":"price","symbol":"AAPL","price":192.8}\n\n
```

```java
// SpringMVC 用 SseEmitter 封装 SSE（底层同样是 AsyncContext）
@RequestMapping("/api/price/stream")
public SseEmitter priceStream() {
    SseEmitter emitter = new SseEmitter(30_000L);       // 30s 心跳兜底
    priceDispatcher.subscribe(emitter);                  // 行情推送器持有引用
    emitter.onTimeout(() -> priceDispatcher.unsubscribe(emitter));
    emitter.onCompletion(() -> priceDispatcher.unsubscribe(emitter));
    return emitter;
}
// 行情到达：emitter.send(SseEmitter.event().name("price").data(obj));
```

> SSE 相比 WebSocket 优势：**走普通 HTTP、自动断线重连（EventSource 自带）、可被 Nginx 缓存/反代**；缺点：单向、单连接消息数受限（HTTP/1.1 下同域约 6 条连接）、中间代理可能缓冲。

## 五、踩坑与权衡

- **必须 complete/超时**：异步请求忘记 `complete()` 会永久挂住连接，最终耗尽连接数；一定配 `setTimeout` + `onTimeout` 兜底。
- **线程池要独立**：业务线程池满了要有拒绝策略（快速失败 503），否则积压放大延迟。
- **与长连接的关系**：长轮询/SSE 的挂起请求是"HTTP 异步"；IM 长连接是全双工 TCP。二者常混用：网关（Netty）承接长连接，业务层用异步 Servlet 把"等待推送事件"挂起来。
- **SpringMVC 异步注意事项**：过滤器需 `asyncSupported=true`（否则异步请求不会再经过 Filter）；`AsyncContext` 挂起期间 `request` 对象可被多个线程访问，注意线程安全。
- **容器适配**：Tomcat 对挂起请求会做超时回收（`asyncTimeout`），长轮询超时时间要设置合理（如 25s + 客户端立即重发），避免"服务端超时但客户端以为还挂着"。

## 六、与相关主题的关联

- 「[长连接](长连接.md)」：连接复用与全双工协议，与本文互补。
- 「[网络协议深挖](../基础知识/网络协议深挖.md)」：HTTP 长连接 keepalive、WebSocket 帧级细节。
- 「[通知中心与站内信设计](通知中心与站内信设计.md)」：推送场景的业务设计（在线/离线/已读）。
- 「[生产问题排查实战](生产问题排查实战：常见故障与处置步骤.md)」：线程池耗尽、连接挂死类事故排查。
