# TCP三次握手状态机与半连接队列

> 对应 RFC 793 (TCP) 与 Kurose & Ross《Computer Networking》第3章。

## 一、背景与挑战
TCP 是面向连接的协议，通信双方在传输数据前必须先建立一条逻辑连接。三次握手既要同步双方的初始序列号 ISN，又要交换窗口规模、选择性确认、时间戳等选项。服务端在收到 SYN 时即分配资源，若缺乏保护机制会面临 SYN Flood 等资源耗尽攻击。如何在可靠建连与抗拒绝服务之间取得平衡，是连接管理的核心挑战。

## 二、核心原理
客户端从 CLOSED 进入 SYN_SENT，发送 SYN 携带 ISN=c。服务端处于 LISTEN，收到后进入 SYN_RCVD，回送 SYN+ACK 携带 ISN=s 与确认号 c+1。客户端回 ACK 确认 s+1 后双方进入 ESTABLISHED。内核把连接分成两个队列：半连接队列（SYN Queue，存 SYN_RCVD 状态的 request_sock）与全连接队列（Accept Queue，存已完成握手、等待应用 accept 的 sock）。当全连接队列满时，新握手可能按 tcp_abort_on_overflow 被重置或丢弃。

## 三、形式化与数学基础
序列号空间为 32 位模 $2^{32}$ 的环，初始序列号应近似随机以避免旧报文混淆。握手序号关系为：
$$ ack_{server} = ISN_c + 1 $$
$$ ack_{client} = ISN_s + 1 $$
半连接队列长度受 `net.ipv4.tcp_max_syn_backlog` 限制，全连接队列上限为 $\min(\text{backlog}, \text{somaxconn})$。

## 四、代码实现
Linux 中握手由 `tcp_v4_conn_request` 与 `tcp_v4_syn_recv_sock` 处理：
```c
struct request_sock *req = inet_reqsk_alloc(&tcp_request_sock_ops, sk, false);
tcp_rsk(req)->rcv_isn = tcp_hdr(skb)->seq;
tcp_rsk(req)->snt_isn = isn = secure_tcp_timestamps_secret(...);
```
应用侧设置 backlog 的示意：
```python
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind(('0.0.0.0', 8080))
s.listen(128)  # backlog 提示全连接队列容量
```

## 五、与其他技术对比
与 UDP 无连接、即发即弃相比，TCP 握手带来一次额外 RTT 的延迟成本，但换来有序、可靠、带流控的字节流。QUIC（RFC 9000）将握手与加密协商合并，在 0-RTT 或 1-RTT 内完成，避免 TCP+TLS 的多轮交互。

## 六、常见误区
误区一是认为 backlog 等于并发连接数上限，实际它只限制已完成握手、尚未 accept 的排队数量。误区二是把 SYN_RCVD 连接数当作攻击证据，正常高并发短连接也会短暂堆积。误区三是以为 ISN 从 0 开始，现代实现使用随时间增长的随机化方案。

## 七、与开源书/权威来源对应
RFC 793 第3.4节定义三次握手状态迁移；Kurose & Ross 第3章用 FSM 图解释 SYN/SYN+ACK/ACK；xiaolincoder/hello-http 的「硬不硬你说了算」图解展示了半连接与全连接队列在 SYN Flood 下的行为。

## 八、面试题
问：为什么是三次而不是两次握手？答：两次无法让服务端确认客户端的接收能力，也无法防止已失效的历史 SYN 造成单方 ESTABLISHED 而浪费资源。问：全连接队列溢出时客户端现象？答：客户端可能收到 RST 或连接超时，取决于内核 `tcp_abort_on_overflow` 设置。

## 九、演进与趋势
随着 TFO（TCP Fast Open，RFC 7413）的引入，SYN 可携带数据并在某些场景减少一次 RTT；但 TFO 的安全考量使其在公网默认受限。Linux 还提供 SYN Cookie 在半连接队列压力时延迟分配 request_sock，以无状态方式抵御 SYN Flood。

## 十、小结
三次握手同步双方 ISN 并协商选项，内核以半连接与全连接两个队列管理握手中间态。理解队列上限、溢出策略与 SYN Cookie 机制，是排查连接建立失败与抗 SYN Flood 的基础。
