# QUIC与HTTP3

> 对应 RFC 9000（QUIC）；RFC 9114（HTTP/3）。

## 一、背景与挑战
HTTP/2 over TCP 仍有 TCP 层队头阻塞、握手慢（TCP+TLS 1.2 需 3 RTT）、连接迁移难（换 IP 即断）。QUIC 在 UDP 上自建可靠传输，HTTP/3 将其作为传输层。

## 二、核心原理
QUIC 在 UDP 上实现：可靠有序（每流独立）、加密内建（QUIC 包全程加密）、0/1-RTT 握手、连接由 64 位 Connection ID 标识（与 IP 解耦，支持迁移）。HTTP/3 用 QUIC 流承载 HTTP 帧（QPACK 取代 HPACK）。

## 三、形式化 / 数学基础
包号空间：QUIC 用 packet number（加密）与 stream offset 解耦，重传包用新 packet number，避免 TCP 重传二义性。
1-RTT 握手：$ClientHello\ +\ TLS\ ClientHello\ \rightarrow\ ServerHello\ +\ ...\ \rightarrow\ 1\ RTT$ 后应用数据可发。
0-RTT：复用此前会话密钥，首包即带应用数据（重放风险）。

## 四、代码实现
```go
// QUIC 建立：UDP socket 上跑 QUIC 握手
udp, _ := net.ListenUDP("udp", addr)
session, _ := quic.Listen(udp, tlsConfig, quicConfig)
stream, _ := session.OpenStreamSync(ctx) // 基于 stream 而非 TCP 连接
stream.Write(http3Request)
```

## 五、与其他技术对比
QUIC vs TCP+TLS：QUIC 解决 TCP HOL（每流独立）、握手更短、支持连接迁移。代价是 UDP 易被中间设备丢弃、拥塞控制需自建。

## 六、常见误区
误区一：QUIC 基于 TCP。错，基于 UDP。误区二：QUIC 没有队头阻塞。错，同流内仍有 HOL，跨流已解。误区三：0-RTT 绝对安全。错，有重放攻击风险。

## 七、与开源书 / 权威来源对应
- 图解网络：https://github.com/xiaolincoder/hello-http
- CS-Notes：https://github.com/CyC2018/CS-Notes
- RFC 9000（QUIC）、RFC 9114（HTTP/3）、Kurose & Ross 第 2 章。

## 八、面试题
1. QUIC 为什么能连接迁移？答：Connection ID 与 IP 解耦。2. HTTP/3 怎么解决 TCP HOL？

## 九、演进与趋势
QUIC 扩展（多路径 QUIC、拥塞控制 BBR 集成）持续演进；HTTP/3 部署率逐年上升。

## 十、小结
QUIC 在 UDP 上重建可靠加密传输，HTTP/3 借其消除 TCP HOL、加速握手、支持迁移，是 Web 传输的下一代。
