# WebSocket 握手与 Sec-WebSocket-Key

> 对应 RFC 6455 第 4 节握手规范与 xiaolincoder/hello-http 中 WebSocket 章节。

## 一、背景与挑战
HTTP 是请求-响应模型：每次交互由客户端发起、服务端回应，服务端无法主动向浏览器推送。很多场景（聊天、行情、协同编辑）需要服务端主动下发，传统做法是轮询，浪费且延迟高。WebSocket（RFC 6455）借一次 HTTP「升级」握手，把连接从 HTTP 协议升级为全双工、长连接的 WebSocket 协议，实现双向实时通信。握手兼容现有 HTTP 基础设施（代理、负载均衡、Cookie）是关键设计目标。

使用 HTTP 升级而非新协议，意味着 WebSocket 能「寄生」在 80/443 端口与既有代理链路上，这是它得以广泛部署的原因——若另起端口或协议，企业防火墙往往会阻断。

这也是一个「渐进增强」的范例：旧服务器对带 Upgrade 的请求照常按 HTTP 处理（返回 200），而理解 WebSocket 的服务器才返回 101，从而实现平滑兼容。

## 二、核心原理
客户端发起带 `Upgrade: websocket` 与 `Connection: Upgrade` 的 HTTP GET，并随机生成 16 字节、Base64 编码的 `Sec-WebSocket-Key`。服务端收到后，将该 key 与固定 GUID `258EAFA5-E914-47DA-95CA-C5AB0DC85B11` 拼接，做 SHA-1 再 Base64，作为 `Sec-WebSocket-Accept` 返回。

客户端校验该值，确认对端「真的理解 WebSocket」而非普通 HTTP 服务器误回 200。握手完成（101 Switching Protocols）后，双方即按 WebSocket 帧协议通信，不再走 HTTP 语义。

需要明确：这套计算不是安全机制，而是「协议能力确认」。真正的加密与完整性由 wss（TLS）提供，与 accept 计算无关。

## 三、形式化与数学基础
accept 的计算为：

$$ \text{accept} = \text{base64}\big(\text{sha1}(\text{key} \,\|\, \text{GUID})\big) $$

其中 key 是客户端 16 字节随机值经 Base64（24 字符），GUID 固定 36 字符，二者拼接共 60 字节输入；SHA-1 输出 20 字节，Base64 后得 28 字符。

该运算单向、不可逆，仅用于「协议能力确认」，不参与后续任何加密。注意 GUID 出现在 RFC 6455 中，是全局约定的常量，任何实现都必须使用同一串——它本质上是个「魔法字符串」，用来防止缓存代理把普通 HTTP 响应误当升级响应。

## 四、代码实现
```python
import base64, hashlib, secrets

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

def make_key():
    # 客户端：生成 16 字节随机 nonce 并 Base64
    return base64.b64encode(secrets.token_bytes(16)).decode()

def compute_accept(key):
    # 服务端/客户端：拼接 GUID 后 SHA-1 再 Base64
    return base64.b64encode(
        hashlib.sha1((key + GUID).encode()).digest()
    ).decode()

# 服务端校验示例
# key = req.headers["Sec-WebSocket-Key"]
# expected = compute_accept(key)
# if req.headers.get("Sec-WebSocket-Accept") != expected:
#     return 400
```

浏览器会在握手时额外带 `Sec-WebSocket-Version: 13`（RFC 6455 规定的版本），若服务端不支持该版本应回 `426 Upgrade Required`。

服务端也可在此阶段校验 `Origin` 头做跨域限制，避免任意页面滥用服务端的 WebSocket 资源。

## 五、与其他技术对比

| 技术 | 方向 | 握手/建立 | 适用 |
| --- | --- | --- | --- |
| HTTP 轮询 | 客户端→服务端 | 每轮新建 | 低频 |
| SSE | 服务端→客户端 | 普通 GET | 单向推送 |
| WebSocket | 双向全双工 | Upgrade 握手 | 实时双向 |
| HTTP/2 请求流 | 双向（请求-响应） | 复用连接 | 并发请求 |
| QUIC 流 | 双向 | 0/1-RTT 握手 | 现代传输 |

WebSocket 握手后不再反复建立请求-响应；与 SSE（text/event-stream，单向）相比，WebSocket 是双向的；与长轮询相比，它长期占用一条连接、无每次重建开销。三者可组合：用 WebSocket 做双向、SSE 做单向流。

## 六、常见误区
- 误区一：Sec-WebSocket-Key 是加密密钥。它仅为握手校验，不参与数据加密，WebSocket 本身不加密（加密靠 ws→wss，即 TLS）。
- 误区二：任意 HTTP 服务器都能升级。必须显式实现握手逻辑与帧解析，否则会误回 200 被客户端拒绝。
- 误区三：Upgrade 后立即发帧。仍要先完成 101 响应，之后才是帧。
- 误区四：wss 与 https 无关。wss 即 WebSocket over TLS，等价于 https 之于 http。
- 误区五：GUID 可自定义。RFC 固定为 `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`，改动会导致任何标准客户端拒绝。
- 误区六：密钥需要保密。client key 是明文放在头部的随机数，其作用只是「每次唯一」，不是秘密。
- 误区七：握手可以省略版本校验。服务端应校验 `Sec-WebSocket-Version`，不支持时回 426。

## 七、与开源书·权威来源对应
RFC 6455 第 4.2.2 节严格规定 accept 计算；xiaolincoder/hello-http 给出抓包与代码；Kleppmann《DDIA》在「基于事件的通信」讨论推送机制；MDN 的 WebSocket 文档给出浏览器 API 与握手细节。

浏览器与主流服务端（如 `websockets`、Nginx、`socket.io`）均严格实现该握手，保证互操作；具体行为以官方最新文档为准。

## 八、面试题
- 问：Sec-WebSocket-Accept 如何计算？答：key 拼 GUID 做 SHA-1 再 Base64。
- 问：为何需要 GUID？答：防止服务端误把普通 HTTP 响应当 WebSocket 升级，确认协议能力。
- 问：WebSocket 与 HTTP 的关系？答：握手用 HTTP，之后升级为独立帧协议，共享端口（80/443）。
- 问：握手失败会怎样？答：客户端拒绝建立，回落或报错。
- 问：为何握手基于 HTTP 而非新协议？答：复用 80/443 与代理链路，规避防火墙限制。
- 问：Sec-WebSocket-Key 需要保密吗？答：不需要，它是明文随机数，仅用于生成 accept。
- 问：服务端如何拒绝不支持的版本？答：返回 426 Upgrade Required。

## 九、演进与趋势
WebSocket 之上的子协议（STOMP、WAMP）丰富语义；HTTP/2 上 WebSocket 通过扩展复用连接；HTTP/3 中 WebSocket 借 CONNECT 扩展在 QUIC 流上承载，相关规范（如 RFC 9220 的 CONNECT）继续演进。

浏览器对 ws/wss 的安全约束也在持续强化，并逐步要求安全上下文（HTTPS 页面才能建 wss）。相关规范与实现以官方最新文档为准。

## 十、小结
WebSocket 握手是一次带 Upgrade 的 HTTP 交换，Sec-WebSocket-Key/Accept 用于协议确认而非加密；握手成功后连接升级为全双工通道，是实时双向通信的基础。理解其「借 HTTP 升级、用魔法 GUID 确认能力」的设计，是正确实现与排障 WebSocket 的第一步。
