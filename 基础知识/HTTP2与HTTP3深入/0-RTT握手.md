# 0-RTT握手

> 对应 RFC 9001（QUIC-TLS）；RFC 8446（TLS 1.3 0-RTT）。

## 一、背景与挑战
传统 TLS 1.2 全握手需 2 RTT 才发数据；即使会话恢复也常 1 RTT。移动/弱网场景每次新连接都付 RTT 代价，亟需“首包即数据”。

## 二、核心原理
0-RTT 复用此前会话的 PSK（预共享密钥）：客户端在第一个包就携带早期数据（early data）。TLS 1.3 与 QUIC 均支持。前提是客户端缓存了服务端的 NewSessionTicket 中的 resumption secret。

## 三、形式化 / 数学基础
TLS 1.3 0-RTT：$ClientHello(0\text{-}RTT\ key)\ +\ early\_data\ \rightarrow\ Server\ 用 PSK\ 派生\ 0\text{-}RTT\ key\ 解密$。
QUIC 0-RTT：在 INITIAL 包后直接发 0-RTT 包，使用导出的 0-RTT 密钥。
限制：early_data 受 `max_early_data_size` 约束（QUIC 用 `max_early_data` 字节数）。

## 四、代码实现
```go
// TLS 1.3 客户端：带 0-RTT 恢复
cfg := &tls.Config{
    CipherSuites:   []uint16{tls.TLS_AES_128_GCM_SHA256},
    SessionTicket:  savedTicket, // 上次 NewSessionTicket
}
conn := tls.Client(netConn, cfg)
conn.Write([]byte("GET / HTTP/3\r\n")) // 首包即 early data（0-RTT）
```

## 五、与其他技术对比
1-RTT 恢复仍需等服务器确认；0-RTT 跳过等待但牺牲抗重放。TCP Fast Open 也尝试 0-RTT 带数据，但因无加密绑定与中间件问题受限。

## 六、常见误区
误区一：0-RTT 完全安全。错，早期数据可被重放，绝不能用于非幂等请求。误区二：0-RTT 不需任何前置条件。错，需此前成功握手并保存会话票据。误区三：0-RTT 与 1-RTT 密钥相同。错，派生不同。

## 七、与开源书 / 权威来源对应
- 图解网络：https://github.com/xiaolincoder/hello-http
- RFC 8446（TLS 1.3）、RFC 9001（QUIC-TLS）、Kurose & Ross 第 2 章。

## 八、面试题
1. 0-RTT 为什么有重放风险？2. 哪些请求不适合 0-RTT？答：非幂等（下单/支付）。

## 九、演进与趋势
QUIC/TLS 持续细化 0-RTT 重放防护（如限制 early data 范围、服务端去重）。

## 十、小结
0-RTT 复用 PSK 在首包携带早期数据削去握手 RTT，但须以抗重放约束为前提。
