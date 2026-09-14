# 0-RTT风险

> 对应 RFC 8446 §8.2（0-RTT 数据与重放）；RFC 9001（QUIC 0-RTT）；RFC 8470（使用 Early Data 的建议）。

## 一、背景与挑战

TLS 1.3 的 0-RTT（early data）允许客户端在 ClientHello 中直接携带应用数据，服务器若接受则「首包即达」，省去一次 RTT。代价是：服务器在尚未完成完整握手、尚未发送自己的 Finished 之前，就已经处理这些数据，因此无法保证抗重放（replay）。攻击者可截获 early data 报文并在不同上下文重复提交，触发非幂等副作用（下单、改密码、转账），这是 0-RTT 相比 1-RTT 固有的安全折衷。

对读多写少的场景（如静态资源拉取）收益明显，对状态变更接口则风险极高，必须在应用层用幂等性兜底。理论上 0-RTT 把「延迟优化」与「安全保证」置于天平两端，二者不可兼得：要么接受重放风险换延迟，要么退回 1-RTT 换安全。因此是否启用 0-RTT 是明确的工程权衡，而非默认开启的安全特性。

在 HTTP 语义下，GET 通常被视为安全且幂等，是 0-RTT 的主要候选；而 POST/PUT/DELETE 改变服务端状态，绝不是 early data 的合适载荷。CDN 与浏览器也普遍只对可缓存响应对应的请求启用 0-RTT。

## 二、核心原理

0-RTT 数据用「此前会话的 PSK」派生的 early traffic 密钥加密。由于客户端在建立新连接时即发送，服务器只有在该 PSK 仍有效（未过期、未被撤销）时才接受。重放攻击成立的关键是：服务器没有全局去重，且 early data 触发了有副作用的操作。QUIC 与 TLS over TCP 都面临此问题，但 QUIC 可在传输层做额外约束（如连接 ID 关联），限制重放只能作用在同一连接上下文内，而 TCP 上重放则更难约束，跨连接的重放几乎无法被协议层阻止。

更本质地说，1-RTT 模式之所以安全，是因为服务器在发送 Finished 之前不会处理任何客户端要求改变状态的请求，而 Finished 本身携带了完整的握手认证；0-RTT 打破了这一顺序，把「处理」前移到了「认证」之前。这正是重放可被利用的结构性原因：服务器在尚未确认对端身份时就已行动。

从密钥角度看，early traffic 密钥由 PSK 确定派生出，同一 PSK 下每次 0-RTT 连接的早期密钥相同或高度相关，因此协议层无法区分「第一次」与「重放」——新鲜性（freshness）必须由协议之外的状态提供，例如服务端一次性 nonce 表或客户端序列号。

## 三、形式化与数学基础

重放威胁模型：攻击者记录 $(ClientHello_0, early\_data)$ 并在时间窗口 $W$（常为数天，受 PSK 有效期约束）内重复提交。若服务器对 early data 执行状态变更而无幂等/去重：

$$Replay\ succeeds \iff \exists\ duplicate\ submit \land \neg Idempotent(request)$$

约束（RFC 8446 §8.2）：early data 必须可由客户端标记为「0-RTT 允许」；服务器可用 early_data 扩展拒绝；QUIC 用 max_early_data 限制字节数，缩小单次重放的影响面。即使如此，单个字节窗口内的重放仍无法被协议层消除，只能靠应用层幂等性兜底。设重放次数 $N$，则期望触发副作用次数上界为 $N$，去重集合大小决定实际成功数。

若把去重表也纳入模型，则「成功重放数」的上界收缩为：

$$E[success] \le N \cdot \Pr[nonce \notin seen] \approx N \cdot e^{-N/|S|}$$

其中 $|S|$ 是去重集合容量。可见去重表越大、命中越快，成功重放越少；但表本身受内存与 TTL 限制，因此「缩短 PSK 有效期」与「扩大去重窗口」本质上是在同一笔预算上做分配。

## 四、代码实现

```go
// 服务端：仅对幂等的 early data 放行，非幂等退回 1-RTT
func handleEarlyData(req *Request) Response {
    if req.method == "GET" && isIdempotent(req.path) {
        return processEarlyData(req)   // 允许 0-RTT 处理
    }
    // 非幂等：拒绝 early data，要求走完整 1-RTT 握手后再处理
    return rejectEarlyData(requireFullHandshake=true)
}

// 客户端：仅把幂等请求放进 0-RTT，避免重放副作用
if req.method == "GET" && safe {
    sendEarlyData(req)
}
```

```go
// 应用层去重令牌：把一次性 nonce 绑进 early data，服务端缓存已见集合
if seen.Contains(req.earlyDataNonce) {
    return rejectEarlyData(dup=true)   // 重放命中，直接拒绝
}
seen.Add(req.earlyDataNonce)            // 仅处理首次

// 注意：去重必须在「处理之前」完成，且需在分布式边缘共享状态，
// 否则同一 early data 可分别命中不同节点而各执行一次
if !clusterDedup.Reserve(req.earlyDataNonce, pskTTL) {
    return rejectEarlyData(dup=true)
}
```

去重的顺序至关重要：若先产生副作用再登记 nonce，则「检查-使用」之间存在竞态窗口，并发重放仍可能穿透，必须用原子性的「预留」操作而非「先查后写」。

## 五、与其他技术对比

| 维度 | 0-RTT | 1-RTT | TCP Fast Open |
| --- | --- | --- | --- |
| 抗重放 | 无保证 | 有（Finished 后才处理） | 无（且缺乏加密绑定） |
| 首包延迟 | 0 RTT | 1 RTT | 0 RTT |
| 安全要求 | 仅幂等数据 | 任意 | 任意但明文风险 |
| 是否加密 | 是（PSK 派生） | 是 | 否（明文） |
| 服务端可控性 | 可拒绝 early_data | 无此问题 | 依赖内核开关 |

与 1-RTT 不同，0-RTT 的数据在服务器尚未验证客户端持有 PSK 对应的完整密钥材料前就被处理，因此服务器对 early data 的信任是「基于 PSK 未过期」而非「基于本次会话已认证」，这是重放风险的根因。TCP Fast Open 虽有 0-RTT 数据，但既无加密也无认证绑定，风险更高。

## 六、常见误区

误区一：0-RTT 与 1-RTT 一样安全。错，0-RTT 无抗重放保证。

误区二：HTTPS 下可随便用 0-RTT 发 POST。错，非幂等请求绝不可放入 early data。

误区三：重放只发生一次。错，攻击者可在窗口内海量重放。

误区四：early data 加密就等同于完整握手保护。错，加密仅保证机密性，不提供新鲜性与来源绑定。

## 七、与开源书·权威来源对应

- RFC 8446 §8.2 明确 0-RTT 不提供抗重放，并给出部署约束与单连接限制，明确要求应用层保证幂等。
- RFC 9001 §4.2 描述 QUIC 的 0-RTT 与 max_early_data 字节上限，以及连接迁移下的重放边界。
- RFC 8470 给出「Using Early Data on HTTP」的实践建议（明确幂等边界）。
- Kurose & Ross 第 8 章讨论减少连接建立延迟的取舍与安全含义。
- Stevens《TCP/IP Illustrated》卷 1 描述 TCP 建连与重传，可与 0-RTT 的延迟收益对照。

## 八、面试题

1. 0-RTT 最大的风险是什么？要点：无抗重放，可被中间人重放触发副作用。
2. 哪些请求适合 0-RTT？要点：幂等 GET（如静态资源），绝不能放非幂等写操作。
3. 服务器如何在不牺牲 0-RTT 前提下降低风险？要点：限制 early data 为幂等、设 max_early_data、维护去重令牌、缩短 PSK 有效期。
4. 为什么 QUIC 的 0-RTT 重放风险相对更可控？要点：连接 ID 与传输层状态可在一定范围内约束重放作用域，但根本的无全局新鲜性限制仍来自 TLS 层。
5. 去重为什么要「先预留再处理」？要点：避免检查与处理之间的竞态窗口，并发重放否则仍可穿透。
6. 为什么说 0-RTT 把「认证」放到了「处理」之后？要点：服务器在发送 Finished 前就处理 early data，此时尚未完成对客户端的完整认证，因此动作缺乏新鲜性保障。

## 九、演进与趋势

实践上服务端普遍用「去重令牌 + 严格幂等边界 + 缩短 early data 有效期」缓解；HTTP 层（RFC 8470）明确了 early data 的语义；QUIC 借助连接 ID 与传输层状态在某种程度上约束重放范围，但根本限制（无全局新鲜性）仍来自 TLS 层设计。浏览器与 CDN 通常只对可缓存 GET 启用 0-RTT，并配合边缘去重，避免重放穿透到源站。未来可能引入一次性 PSK 或短期 early-data 票据进一步收敛风险。

另一方向是把「幂等性」从人工约定转为可验证契约：在网关层对路由做声明式标注（哪些路径允许 early data），并由基础设施统一注入去重与限流，减少应用各自实现导致的不一致。其具体规范与实现请以 IETF 最新草案与所用网关文档为准。

## 十、小结

0-RTT 用「在完整握手前就处理数据」换来了首包零延迟，代价是抗重放机制的缺失。它只应承载幂等、无副作用的数据，任何非幂等操作都必须退回 1-RTT 以保证安全。部署 0-RTT 时，应用层幂等性与服务器去重是不可替代的最后一道防线，协议层无法替代应用层对副作用的控制；而在分布式部署中，去重必须跨节点一致，否则单机去重会留下放大路径。
