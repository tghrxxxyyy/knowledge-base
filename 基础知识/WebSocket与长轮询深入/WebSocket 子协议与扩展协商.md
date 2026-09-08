# WebSocket 子协议与扩展协商

> 对应 RFC 6455 第 1.9/9 节子协议与扩展协商与 xiaolincoder/hello-http 的协商说明。

## 一、背景与挑战
WebSocket 只提供消息传输管道，不规定消息语义。为了让客户端与服务端就「消息格式」达成一致（如 JSON-RPC、STOMP），需要在握手阶段协商子协议；扩展则用于如压缩等可选能力。

## 二、核心原理
客户端在握手请求中通过 Sec-WebSocket-Protocol 提供候选子协议列表，服务端从中选一个回应在同一头部。扩展通过 Sec-WebSocket-Extensions 协商（如 permessage-deflate 压缩）。若未匹配，服务端可返回 400 或省略该头部，连接仍建立但无约定子协议。

## 三、形式化与数学基础
协商是集合交集运算：服务端从客户端集合 S_c 中选一个 s ∈ S_c 返回，若 S_c ∩ S_s = ∅ 则协商失败。扩展则可带参数键值对，形成带参能力声明。

## 四、代码实现
```http
GET /chat HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Protocol: chat, superchat
Sec-WebSocket-Version: 13
```
```http
HTTP/1.1 101 Switching Protocols
Sec-WebSocket-Protocol: chat
```

## 五、与其他技术对比
HTTP 的内容协商（Accept/Content-Type）用于媒体类型，WebSocket 子协议用于应用层消息格式，二者层级不同。gRPC 用 HTTP/2 的 Content-Type 标识 proto 服务，思路类似但机制不同。

## 六、常见误区
误区一：子协议影响传输——它只约定应用语义，不改变帧格式。误区二：可协商多个子协议——服务器只能选一个。误区三：扩展必选——扩展是可选的，未协商则不使用。

## 七、与开源书/权威来源对应
RFC 6455 第 1.9 与第 9 节定义子协议与扩展；xiaolincoder/hello-http 给出双子协议示例；Kleppmann《DDIA》讨论接口/协议版本兼容。

## 八、面试题
子协议与扩展的区别？协商失败会怎样？为什么子协议只能选一个？permessage-deflate 是什么？

## 九、演进与趋势
基于 WebSocket 的子协议生态（WAMP、Socket.IO 自有协议）持续演进；压缩扩展 permessage-deflate 已成为主流以减小文本消息体积。

## 十、小结
子协议与扩展在握手阶段完成能力协商，子协议约定消息语义、扩展增强传输能力，二者让 WebSocket 成为可扩展的应用传输层。
