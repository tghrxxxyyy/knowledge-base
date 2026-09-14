# QUIC与HTTP3

> 对应 RFC 9000（QUIC）；RFC 9114（HTTP/3）。

## 一、背景与挑战
HTTP/2 over TCP 仍有三处硬伤：其一，TCP 层队头阻塞——任一丢包触发整连接字节流重传，冻结所有复用流；其二，握手慢——TCP + TLS 1.2 需 3 个 RTT 才能发数据；其三，连接迁移难——四元组（源/目的 IP+端口）绑定连接，手机在 Wi-Fi 与蜂窝间切换、IP 变化即断连需重握。QUIC 在 UDP 之上自建可靠、加密、多路复用的传输层，HTTP/3 将其作为标准传输，从根上解决上述问题。

这三处问题并非孤立：队头阻塞与握手慢都源于 TCP 的「单一字节流 + 强耦合四元组」设计，而迁移难则源于连接与地址的硬绑定。QUIC 用「每流独立 + Connection ID 解耦」一次性改写这些假设。

值得注意的是，把加密搬到用户态也意味着内核不再能「看见」明文，因此 QUIC 需自行处理拥塞控制、丢包恢复与可观测性（如 Spin Bit）。这也是为什么 QUIC 栈常需 eBPF 或内核旁路来追平 TCP 的内核态性能。部署上还有 UDP 可达性风险：部分企业防火墙/NAT 会丢弃非常规 UDP 流量，需要回退到 TCP 的能力。

## 二、核心原理
QUIC 把原本由内核 TCP + TLS 承担的职责搬到用户态：在 UDP 数据报上实现**可靠有序（每流独立）**、**加密内建（所有包 payload 经 AEAD 加密，并做头部保护）**、**0/1-RTT 握手**、以及**连接迁移**（连接由 64 位 Connection ID 标识，与 IP 五元组解耦）。QUIC 包类型包括 Initial、0-RTT、Handshake、Retry、Short(1-RTT)。

每个 QUIC 流是独立的可靠有序信道，流间互不阻塞；HTTP/3 用 QUIC 流承载 HTTP 帧，并以 **QPACK**（而非 HPACK）压缩头部——因为 UDP 乱序到达破坏了 HPACK 动态表的「按序可达」假设。HTTP/3 的控制信息（如 SETTINGS、GOAWAY）走专用单向控制流，避免与应用数据争用。流的创建分双向（Bidirectional）与单向（Unidirectional），且流 ID 的奇偶 + 高位比特编码了发起方与方向。

## 三、形式化与数学基础
QUIC 用「包号空间（packet number space）」与「流偏移（stream offset）」解耦：重传使用**新的** packet number，避免 TCP 重传二义性（接收方无法区分初传与重传）。共有三个包号空间：Initial、Handshake、Application Data，各空间独立计数。1-RTT 握手流程：

$$ ClientHello(+TLS) \rightarrow ServerHello(+TLS) \rightarrow 1\ RTT\ 后即可发\ 1\text{-}RTT\ 数据 $$

0-RTT 复用 PSK，首包即带应用数据（重放风险）。连接迁移通过地址校验令牌保证：

$$ migrate(IP_{new}):\quad PATH\_CHALLENGE/RESPONSE\ \land\ NEW\_TOKEN\ 校验新路径可达 $$

拥塞控制与丢包恢复在 QUIC 层实现（如 Reno/CUBIC/BBR），每连接独立维护 cwnd 与 ssthresh。

## 四、代码实现
```go
// 伪代码：QUIC 建立与发送 HTTP/3 请求（基于 quic-go 风格 API）
udp, _ := net.ListenUDP("udp", localAddr)
session, _ := quic.Listen(udp, tlsConfig, quicConfig)  // 服务端
stream, _ := session.OpenStreamSync(ctx)               // 基于 stream，非 TCP 连接
stream.Write([]byte("GET / HTTP/3\r\n"))               // 经 QUIC 流发送

// 连接迁移：保持同一 Connection ID，仅换对端地址
session.MigrateTo(newNetAddr)                          // 发送 PATH_CHALLENGE 校验
```

```go
// 伪代码：地址验证（防放大攻击），服务端发令牌
func onNewPath(s Session, addr net.Addr) {
    token := issueToken(addr)              // NEW_TOKEN，绑定地址
    s.SendRetryToken(token)                // 客户端须回带以证明可达
}

// 伪代码：重传用新 packet number，消除 TCP 重传二义性
func send(frames []Frame, isRetransmit bool) {
    if isRetransmit {
        pnum = nextPktNum()                 // 重新编号，而非复用原编号
    }
    writePacket(pnum, encrypt(frames))
}
```

## 五、与其他技术对比
| 维度 | TCP + TLS | QUIC(HTTP/3) |
| --- | --- | --- |
| 队头阻塞 | 整连接（TCP 字节流） | 仅单流内 |
| 握手 RTT | 1–3 | 0–1 |
| 连接迁移 | 不支持（绑五元组） | 支持（Connection ID） |
| 加密层 | 内核 TLS 分离 | 包级内建 AEAD |
| 拥塞控制位置 | 内核 | 用户态 |
| 代价 | 成熟、内核加速 | UDP 易被中间盒丢弃、用户态 CPU 高 |

QUIC 解决 TCP HOL、握手更短、支持迁移；代价是 UDP 在部分网络被限流/丢弃，且加密与可靠逻辑在用户态，CPU 开销更高。实践中常做「QUIC 不可达则回退 H2/TCP」的优雅降级。

## 六、常见误区
- 误区：QUIC 基于 TCP。错，它基于 UDP，并在其上重建可靠传输。
- 误区：QUIC 完全没有队头阻塞。错，同一条流内仍是有序可靠，单流丢包仍阻塞该流；只是跨流已隔离。
- 误区：0-RTT 绝对安全。错，有重放攻击风险，仅限幂等数据。
- 误区：Connection ID 就是 IP。错，它是与地址解耦的不透明标识，正是迁移能力来源。
- 误区：QUIC 不需要拥塞控制。错，它必须在用户态自行实现，否则会压垮网络。
- 误区：QUIC 包全部加密无明文。错，Short 包的部分头部仍有明文以路由，但做了头部保护（Header Protection）。
- 误区：QUIC 一定能穿透所有防火墙。错，部分企业 NAT/防火墙会丢弃非常规 UDP 流量，需 TCP 回退。

## 七、与开源书·权威来源对应
- RFC 9000（QUIC: A UDP-Based Multiplexed and Secure Transport）传输机制全集。
- RFC 9114（HTTP/3）与 RFC 9204（QPACK）头部压缩。
- RFC 9001（QUIC-TLS）加密与 0-RTT 细节。
- Stevens《TCP/IP Illustrated》卷 1 关于 TCP 可靠性与队头阻塞的原始讨论。

## 八、面试题
1. QUIC 为什么能连接迁移？（Connection ID 与 IP 五元组解耦，换 IP 后凭同一 ID 续连。）
2. HTTP/3 怎么解决 TCP 层 HOL？（每流独立可靠，丢包只影响对应 QUIC 流。）
3. 为什么 HTTP/3 不用 HPACK 而用 QPACK？（UDP 乱序破坏 HPACK 动态表按序假设。）
4. QUIC 如何消除 TCP 重传二义性？（重传用新 packet number。）
5. QUIC 包为何需要头部保护？（防止中间盒基于明文头部做端口路由/干扰。）
6. QUIC 有几个包号空间？（Initial、Handshake、Application Data 三个。）

## 九、演进与趋势
多路径 QUIC（Multipath QUIC）在多条网络路径间分担流量，进一步降低单路径丢包影响；拥塞控制与 BBR 的 QUIC 集成持续演进；HTTP/3 部署率逐年上升，主流 CDN 默认开启。用户态协议栈（如 eBPF 加速 UDP 收发包）也在缓解 QUIC 的 CPU 开销；可观测性方面，「Spin Bit」用于被动测量 RTT 而不泄露明文，平衡运维可见性与隐私。连接迁移正与 Multipath 结合，实现「无缝切换 + 吞吐叠加」。

## 十、小结
QUIC 在 UDP 上重建可靠、加密、多路复用的传输层，HTTP/3 借其消除 TCP HOL、加速握手、支持连接迁移，是 Web 传输的下一代基石；其代价与收益需要在部署中按网络环境权衡，尤其是 UDP 可达性与用户态 CPU 成本，并做好回退到 HTTP/2/TCP 的降级路径。
