# WebSocket 与 HTTP2 多路复用差异

> 对应 RFC 6455 与 RFC 7540（HTTP/2）多路复用定义，及 xiaolincoder/hello-http 对比。

## 一、背景与挑战
HTTP/2 通过单连接上的多路复用流解决了队头阻塞（应用层），WebSocket 提供单连接全双工消息。二者都「复用一条 TCP 连接」，但设计目标与语义不同，常被混淆。

## 二、核心原理
HTTP/2 把请求/响应切分为带流 ID 的帧，多条流在同一个 TCP 连接上交错传输，实现并发且避免建立多连接。WebSocket 则是握手升级后的单一全双工消息通道，不区分流，消息由应用层自行路由。

## 三、形式化与数学基础
HTTP/2 流并发度为可协商的 SETTINGS_MAX_CONCURRENT_STREAMS（N），单连接吞吐受单条 TCP 的拥塞窗口与队头阻塞（TCP 层）约束。WebSocket 通道数恒为 1，但双向对称；其复用体现在「一条连接替代多轮 HTTP 事务」。

## 四、代码实现
```http
/* HTTP/2: 同一连接上多个流 */
HEADERS (stream=1, GET /a)  +  HEADERS (stream=3, GET /b)
DATA (stream=1) ... DATA (stream=3) ...  /* 交错 */
/* WebSocket: 单通道双向帧 */
client -> server: text frame "hi"
server -> client: text frame "pong"
```

## 五、与其他技术对比
HTTP/2 多路复用仍受 TCP 层队头阻塞影响（一个丢包阻塞所有流）；HTTP/3 基于 QUIC 解决该问题。WebSocket 逻辑上单流，但可在应用层自建多路（如带消息 ID）。SSE 作为 HTTP/2 上的单向流也很常见。

## 六、常见误区
误区一：WebSocket 多路复用——它不在协议层多路。误区二：HTTP/2 完全无队头阻塞——仅解决 HTTP 层，TCP 层仍存在。误区三：二者互斥——可在 HTTP/2 连接上通过扩展承载 WebSocket。

## 七、与开源书/权威来源对应
RFC 7540 第 5 节定义流与多路复用；RFC 6455 定义 WebSocket 帧；xiaolincoder/hello-http 给出二者对比图示；Kurose & Ross 介绍 HTTP 演进。

## 八、面试题
HTTP/2 多路复用解决了什么？WebSocket 为何不算多路复用？TCP 队头阻塞对二者影响？何时用哪种？

## 九、演进与趋势
HTTP/3 用 QUIC 消除 TCP 队头阻塞；WebSocket over HTTP/3 通过 CONNECT 扩展继续可用，二者在传输层逐步融合。

## 十、小结
HTTP/2 多路复用是「多流交错」的并发模型，WebSocket 是「单通道全双工」模型，目标不同，理解差异有助于正确选型。
