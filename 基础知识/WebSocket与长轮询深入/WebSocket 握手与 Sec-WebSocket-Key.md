# WebSocket 握手与 Sec-WebSocket-Key

> 对应 RFC 6455 第 4 节握手规范与 xiaolincoder/hello-http 中 WebSocket 章节。

## 一、背景与挑战
HTTP 是请求-响应模型，服务器无法主动向浏览器推送。WebSocket 在 RFC 6455 中定义，借助一次 HTTP 升级握手，将连接从 HTTP 协议「升级」为全双工、长连接的 WebSocket 协议，从而支持服务端主动发送。

## 二、核心原理
客户端发起带 Upgrade: websocket 的 HTTP 请求，并随机生成 16 字节 Base64 编码的 Sec-WebSocket-Key。服务器将其与固定 GUID 「258EAFA5-E914-47DA-95CA-C5AB0DC85B11」拼接后做 SHA-1 再 Base64，作为 Sec-WebSocket-Accept 返回。该机制用于确认服务器确实理解 WebSocket，而非普通 HTTP 响应。

## 三、形式化与数学基础
accept = base64( sha1( key || "258EAFA5-E914-47DA-95CA-C5AB0DC85B11" ) )。其中 key 为客户端 16 字节随机值的 Base64（24 字符），拼接 GUID 后共 36+24 字节输入，SHA-1 输出 20 字节，Base64 后 28 字符。

## 四、代码实现
```python
import base64, hashlib, secrets
GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
key = base64.b64encode(secrets.token_bytes(16)).decode()
accept = base64.b64encode(
    hashlib.sha1((key + GUID).encode()).digest()
).decode()
```

## 五、与其他技术对比
与 HTTP 长轮询相比，WebSocket 握手后不再反复建立请求-响应；与 Server-Sent Events（SSE，基于 text/event-stream）相比，WebSocket 是双向的，而 SSE 仅服务端到客户端单向。

## 六、常见误区
误区一：Sec-WebSocket-Key 是加密密钥——它仅为握手校验，不参与数据加密。误区二：任意 HTTP 服务器都能升级——必须显式实现握手逻辑。误区三：Upgrade 后立即是 WebSocket 帧——仍要先完成握手响应。

## 七、与开源书/权威来源对应
RFC 6455 第 4.2.2 节严格规定 accept 计算；xiaolincoder/hello-http 给出抓包示例；Kleppmann《DDIA》在「基于事件的通信」中讨论推送机制。

## 八、面试题
Sec-WebSocket-Accept 如何计算？为什么需要 GUID？WebSocket 与 HTTP 的关系？握手失败会怎样？

## 九、演进与趋势
WebSocket 之上的子协议（如 STOMP、WAMP）丰富了语义；HTTP/3 中 WebSocket 通过 CONNECT 扩展在 QUIC 流上承载，相关规范仍在演进。

## 十、小结
WebSocket 握手是一次带 Upgrade 的 HTTP 交换，Sec-WebSocket-Key/Accept 用于协议确认；握手成功后连接升级为全双工通道。
