# 0-RTT握手

> 对应 RFC 9001（QUIC-TLS）；RFC 8446（TLS 1.3 0-RTT）。

## 一、背景与挑战
传统 TLS 1.2 完整握手需 2 个 RTT 才能发送应用数据；即便会话恢复（Session Resumption），基于会话 ID 或会话票据也常需 1 RTT 等待服务器确认。在移动网络、跨洋链路或高频重连场景（如短连接 API、QUIC 迁移后重连）下，每次新连接都付出握手 RTT 代价，显著抬升首字节时间（TTFB）。「首包即数据」成为必需，0-RTT 由此而生。

TLS 1.3 把握手压缩到 1-RTT，并新增 0-RTT 模式：客户端在首个包即携带 early data，把可恢复连接的首字节延迟进一步压到 0。理解 0-RTT 必须先理解其前置——服务端在「上次连接」通过 NewSessionTicket 消息把恢复密钥（PSK）交给客户端，客户端妥善保存后才能在下次连接复用。票据自身还携带有效期与 `max_early_data_size` 等策略。

0-RTT 的收益在弱网最明显：一次跨洋 RTT 常达 200–300ms，削去它直接改善转化与体验。但代价是重放风险，二者必须一起权衡，不能只看延迟。把 early data 用于写操作是常见事故来源。

## 二、核心原理
0-RTT 复用此前会话协商出的 **PSK（预共享密钥）**：客户端在第一个外发包中就携带「早期数据（early data）」，无需等服务端握手确认。TLS 1.3 与 QUIC 均支持该能力。前提是客户端缓存了上次连接中服务端下发的 NewSessionTicket 所蕴含的恢复密钥（resumption_master_secret 派生的 PSK），且服务端仍记得该 PSK（未过期、未被轮换掉）。

TLS 1.3 中，ClientHello 带 `pre_shared_key` 与 `early_data` 扩展；服务端若在 EncryptedExtensions 中回示接受 early_data，则应用数据可用 0-RTT 密钥解密。QUIC 则在 INITIAL 包之后直接发送 0-RTT 包，使用由 TLS 导出的 0-RTT 密钥，且受放大攻击限制（0-RTT 阶段服务端响应不得超过客户端收包的三倍）。

客户端侧的 early data 与握手后 1-RTT 数据使用**不同**密钥（不同 DeriveSecret 标签），因此 0-RTT 数据即便被接受，也不与后续流量混淆；但若被重放，服务端无从区分「原始」与「重放」，只能靠策略约束。

## 三、形式化与数学基础
TLS 1.3 的 0-RTT 密钥派生（HKDF 链）：

$$ 0RTT\_secret = HKDF\_ExpandLabel(resumption\_master\_secret,\ \text{「early data」},\ \cdot) $$
$$ client\_early\_traffic\_secret = DeriveSecret(0RTT\_secret,\ \text{「c e traffic」}) $$

客户端用 `client_early_traffic_secret` 加密 early data，服务端用同一 PSK 派生相同密钥解密。QUIC 下 early data 字节数受 `max_early_data`（字节）约束；TLS 用 `max_early_data_size`。重放窗口由票据 Age 与一次性使用策略控制——0-RTT 数据天然可被网络窃听者重放，这是其根本弱点：

$$ replayable = (capture(first\_packet) \land resend) \Rightarrow same\ early\_data\ accepted $$

若把 PSK 约束为单次消费（一旦用于 0-RTT 即作废），则重放成功率降至近 0，但代价是后续恢复退化到 1-RTT；这是典型的安全/体验权衡。

## 四、代码实现
```go
// 伪代码：TLS 1.3 客户端带 0-RTT 会话恢复（Go tls）
cfg := &tls.Config{
    CipherSuites:  []uint16{tls.TLS_AES_128_GCM_SHA256},
    SessionTicket: savedTicket,          // 上次 NewSessionTicket 缓存
}
conn, _ := tls.Dial("tcp", addr, cfg)
// 首包即 early data（0-RTT），在握手完成前写入
conn.Write([]byte("GET /index.html HTTP/3\r\n"))
// 注意：须确认服务端在 EncryptedExtensions 接受 early_data，否则这些数据被忽略
```

```go
// 伪代码：服务端决定是否接受 early data（按幂等性 + 重放窗口）
func allowEarlyData(req []byte, ticket *Ticket) bool {
    if !isIdempotent(req) { return false }   // 非幂等绝不接受 0-RTT
    if replayCache.Seen(ticket.ID) { return false } // 一次性消费 PSK
    return ticket.Age() < maxAge             // 票据未过期
}
```

```go
// 伪代码：客户端确认 early data 被接受，否则以 1-RTT 重发
func sendEarly(conn *Conn, data []byte) {
    conn.Write(data)                       // 先按 0-RTT 发出
    if !conn.earlyDataAccepted() {         // 握手后检查 EncryptedExtensions
        conn.Write(data)                   // 未被接受，握手完成后以 1-RTT 重发
    }
}
```

## 五、与其他技术对比
| 维度 | 1-RTT 恢复 | 0-RTT | TCP Fast Open |
| --- | --- | --- | --- |
| 首包带数据 | 否（等确认） | 是 | 是 |
| 抗重放 | 强 | 弱 | 弱 |
| 加密绑定 | 有（TLS 密钥） | 有（PSK 派生） | 无（明文 TFO cookie） |
| 中间盒兼容 | 好 | 好 | 差（被中间件丢弃） |
| 适用请求 | 任意 | 仅幂等 | 任意（但不安全） |

1-RTT 恢复仍需等服务器一轮确认；0-RTT 跳过等待但牺牲抗重放。TCP Fast Open 也尝试 0-RTT 带数据，但因无加密绑定与中间件问题受限，远不如 TLS 0-RTT 普及。工程上常见做法是「0-RTT 仅用于缓存友好的 GET，写操作一律 1-RTT」。

## 六、常见误区
- 误区：0-RTT 完全安全。错，早期数据可被重放，绝不能用于非幂等请求（下单/支付/状态变更）。
- 误区：0-RTT 不需要任何前置条件。错，必须此前成功完成过一次握手并安全保存会话票据/PSK。
- 误区：0-RTT 与 1-RTT 用同一密钥。错，二者由不同标签派生（early vs 1-RTT traffic secret）。
- 误区：服务端一定会接受 early data。错，服务端可基于策略（资源幂等性、重放窗口）拒绝，回退到 1-RTT。
- 误区：0-RTT 数据一定被处理。错，若服务端拒绝 early_data，客户端须在握手完成后重新以 1-RTT 发送。
- 误区：QUIC 0-RTT 不受放大限制。错，QUIC 在 0-RTT 阶段限制服务端响应不超过客户端收包的三倍，防放大攻击。

## 七、与开源书·权威来源对应
- RFC 8446（TLS 1.3）第 4.2.10 节 `early_data` 与 0-RTT 安全考量。
- RFC 9001（Using TLS to Secure QUIC）描述 QUIC 0-RTT 包与密钥、放大限制。
- Kurose & Ross《Computer Networking》第 2 章关于 RTT 与握手成本。
- Rescorla《TLS 1.3》设计文档对 0-RTT 重放风险的论述。

## 八、面试题
1. 0-RTT 为什么有重放风险？如何缓解？（早期数据密钥仅由客户端侧 PSK 派生，无服务端随机数；用一次性 PSK、限制幂等、票据时效窗口 + 重放缓存缓解。）
2. 哪些请求不适合 0-RTT？（非幂等：下单、支付、改密。）
3. 0-RTT 与 1-RTT 在密钥派生上的区别？（不同 DeriveSecret 标签。）
4. QUIC 与 TLS 1.3 的 0-RTT 有何异同？（都基于 TLS early data，QUIC 在 UDP 包层承载并受放大攻击限制。）
5. NewSessionTicket 在 0-RTT 中的角色？（交付 PSK，是 0-RTT 的前置条件。）

## 九、演进与趋势
QUIC/TLS 持续细化 0-RTT 重放防护：服务端采用「单次消费 PSK」或短期重放去重窗口；CDN 边缘常把 0-RTT 仅用于缓存友好的 GET。未来「可重放的 0-RTT」与「抗重放的 1-RTT」分层使用将成为默认工程实践；Token 绑定与证书装订（OCSP Stapling）进一步降低恢复成本。客户端也趋向「仅对明确幂等接口启用 0-RTT」，把安全边界前移到应用层策略，而非依赖协议默认值。

## 十、小结
0-RTT 复用 PSK 在首包携带早期数据，削去握手 RTT 显著降低 TTFB，但必须以「仅限幂等、限制窗口、服务端去重」的抗重放约束为前提，是性能与安全的显式权衡。部署时应默认关闭非幂等接口的 0-RTT，并用监控观测重放拒绝率。
