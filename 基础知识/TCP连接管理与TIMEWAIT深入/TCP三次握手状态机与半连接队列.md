# TCP三次握手状态机与半连接队列

> 对应 RFC 9293（原 RFC 793）第 3.4 节、Kurose & Ross《Computer Networking》第 3 章、Stevens《TCP/IP Illustrated》卷一第 18 章。

## 一、背景与挑战
TCP 是面向连接的协议，通信双方在传输数据前必须先建立一条逻辑连接。三次握手既要同步双方的初始序列号 ISN，又要交换窗口规模、选择性确认、时间戳等选项。服务端在收到 SYN 时即需分配资源，若缺乏保护机制会面临 SYN Flood 等资源耗尽攻击。

如何在「可靠建连」与「抗拒绝服务」之间取得平衡，是连接管理的核心挑战。内核把建立过程中的连接拆成两个队列分别管理：半连接队列与全连接队列，二者任一溢出都会改变建连行为，也是排查建连失败的关键抓手。

两个队列之所以必须分离，是因为它们承载的资源类型不同：半连接项只需保存「对方 ISN、我方 ISN、选项、重传计数」，用轻量的 `request_sock`；全连接项则必须是一个功能完整的 `sock`（含收发缓冲、拥塞控制状态、定时器），内存开销大得多。分离后，攻击者即使狂发 SYN，消耗也只是轻量结构，而全连接队列的容量可独立受应用控制。

## 二、核心原理
客户端从 CLOSED 进入 SYN_SENT，发送 SYN 携带 $ISN_c$。服务端处于 LISTEN，收到后进入 SYN_RCVD，回送 SYN+ACK 携带 $ISN_s$ 与确认号 $ISN_c+1$。客户端回 ACK 确认 $ISN_s+1$ 后双方进入 ESTABLISHED。

内核把握手中间态分为两层：半连接队列（SYN Queue，存放处于 SYN_RCVD 的 `request_sock`，尚未完成握手）与全连接队列（Accept Queue，存放已完成握手、等待应用层 `accept` 的 `sock`）。当全连接队列满时，新握手行为受 `tcp_abort_on_overflow` 控制：为 0 时服务端丢弃第三次 ACK 并等待客户端重传，为 1 时直接回 RST。

半连接队列的溢出行为也有所不同：当 `tcp_max_syn_backlog` 满时，内核默认对新的 SYN 做「丢弃」处理（但对已存在半连接项的重传 SYN 仍会回 SYN+ACK，以减少误伤正常重传的客户端）。若启用 SYN Cookie，则在队列满时切换到无状态模式，从根上避免队列成为硬上限。

三次握手的最后一个 ACK 也可能丢失：此时服务端停在 SYN_RCVD 并重传 SYN+ACK，而客户端已进入 ESTABLISHED 并开始发送数据。这些数据段携带 ACK（确认了服务端的 ISN+1），服务端收到后即可补完握手并转 ESTABLISHED——这解释了「为什么客户端显示连接已建立，服务端却认为还在握手」的短暂不一致。

## 三、形式化与数学基础
序列号空间为 32 位模 $2^{32}$ 的环，ISN 应近似随机以避免旧报文混淆。握手序号关系为：

$$ ack_{server} = ISN_c + 1 $$
$$ ack_{client} = ISN_s + 1 $$

半连接队列长度受 `net.ipv4.tcp_max_syn_backlog` 限制；全连接队列上限为二者最小值：

$$ Q_{accept} = \min(\text{listen(backlog)},\ \text{somaxconn}) $$

其中 `somaxconn` 由系统参数约束（以官方最新文档为准）。注意 backlog 只是「提示」，内核会取 min，故应用设 128 不一定真给 128。

半连接队列的实际上限比 `tcp_max_syn_backlog` 更复杂：在未启用 SYN Cookie 时，队列长度还受「`somaxconn` 与 `tcp_max_syn_backlog` 的较大者」影响（不同内核版本策略有别，以官方文档为准）。这意味着只调一个参数可能不起作用，排查时需同时确认两者。

SYN Flood 的资源模型：攻击者以速率 $\lambda$ 发送伪造源 IP 的 SYN，服务端每条半连接项存活 $T_{syn}$（重传策略决定的超时），则稳态占用约 $\lambda T_{syn}$。若超过队列上限即开始丢正常 SYN；启用 SYN Cookie 后占用降为 $O(1)$，因为不再为每条 SYN 保存状态。

## 四、代码实现
Linux 中握手由 `tcp_v4_conn_request` 与 `tcp_v4_syn_recv_sock` 处理，半连接项用 `request_sock` 表示：

```c
// 简化自 net/ipv4/tcp_ipv4.c
struct request_sock *req = inet_reqsk_alloc(&tcp_request_sock_ops, sk, false);
tcp_rsk(req)->rcv_isn = tcp_hdr(skb)->seq;          // 记录对端 ISN
tcp_rsk(req)->snt_isn = secure_tcp_seq(...);          // 生成随机 ISN
```

应用侧设置 backlog 的示意：

```c
int s = socket(AF_INET, SOCK_STREAM, 0);
bind(s, (struct sockaddr *)&addr, sizeof(addr));
listen(s, 128);   // backlog 仅提示全连接队列容量，实际取 min(128, somaxconn)
```

第三次 ACK 到来时 `tcp_v4_syn_recv_sock` 把 `request_sock` 提升为完整 `sock` 并入全连接队列。若此时全连接队列已满，则按 `tcp_abort_on_overflow` 决策：

```c
/* 简化：全连接队列溢出时的两种策略 */
if (sk_acceptq_is_full(sk)) {
    if (tcp_abort_on_overflow) {
        tcp_v4_send_reset(sk, skb);      /* 直接回 RST，客户端立刻报错 */
    } else {
        /* 丢弃第三次 ACK；客户端会重传 ACK，服务端待后续重传 SYN 重试 */
        goto drop;
    }
}
```

## 五、与其他技术对比
与 UDP 无连接、即发即弃相比，TCP 握手带来一次额外 RTT 的延迟成本，但换来有序、可靠、带流控的字节流。QUIC（RFC 9000）将握手与加密协商合并，在 0-RTT 或 1-RTT 内完成，避免 TCP+TLS 的多轮交互。

SCTP 采用四路握手并引入 cookie，对伪造源地址的洪泛更健壮。DCCP 等则面向不可靠但带握手的场景，取舍不同。对延迟敏感的短连接，握手 RTT 往往是主要开销来源。

| 协议 | 握手轮数 | 抗洪泛机制 | 状态分配时机 | 额外 RTT |
| --- | --- | --- | --- | --- |
| TCP | 三次（1 RTT） | SYN Cookie | 收到 SYN 后（可选延迟） | 1 |
| TCP + TFO | 可 0 RTT 数据 | Cookie 验证 | 需 cookie | 0~1 |
| SCTP | 四路 | Cookie（无状态） | 收到 COOKIE-ECHO 后 | 2 |
| QUIC | 1 RTT / 0 RTT | Retry 令牌 | 验证令牌后 | 0~1 |
| UDP | 无 | 不适用 | 不适用 | 0 |

## 六、常见误区
误区一：认为 backlog 等于并发连接数上限，实际它只限制「已完成握手、尚未 accept」的排队数量。误区二：把 SYN_RCVD 连接数当作攻击证据，正常高并发短连接也会短暂堆积。

误区三：以为 ISN 从 0 开始，现代实现使用随时间增长的随机化方案（RFC 6528）。误区四：以为应用没调用 accept 连接就建立不了——实际握手在第三次 ACK 后即完成，accept 只是从队列取走。误区五：以为全连接队列满就必然 RST，具体行为取决于 `tcp_abort_on_overflow`。

误区六：以为 `net.core.somaxconn` 是唯一约束。`listen()` 传入的 backlog 也会参与取 min，两者都要随业务调大。误区七：以为 SYN Cookie 无代价。它会使服务端无法在握手期间携带某些需要状态的选项（如窗口缩放），可能导致性能退化为默认窗口。

## 七、与开源书·权威来源对应
- RFC 9293 第 3.4 节：定义三次握手状态迁移。
- RFC 4987：SYN Flood 攻击与防御（含 SYN Cookie）的权威描述。
- Kurose & Ross 第 3 章：用 FSM 图解释 SYN/SYN+ACK/ACK。
- Stevens《TCP/IP Illustrated》卷一 18.3：详述半连接与全连接队列及溢出行为。
- 图解网络（xiaolincoder/hello-http）：图示 SYN Flood 下半/全连接队列的表现。

## 八、面试题
1. 为什么是三次而不是两次握手？答：两次无法让服务端确认客户端的接收能力，也无法防止已失效的历史 SYN 造成单方 ESTABLISHED 而浪费资源。
2. 全连接队列溢出时客户端现象？答：取决于 `tcp_abort_on_overflow`：为 0 时客户端可能超时重试，为 1 时收到 RST。
3. `tcp_max_syn_backlog` 与 `listen()` 的 backlog 各控制哪个队列？答：前者管半连接，后者管全连接。
4. 第三次 ACK 丢失会怎样？答：服务端仍在 SYN_RCVD，重传 SYN+ACK；客户端已 ESTABLISHED 并开始发数据，数据段携带 ACK 会补足握手。
5. 为什么半连接与全连接队列要分开？答：前者是轻量 `request_sock`、可容忍洪泛；后者是完整 `sock`、内存开销大且需应用控制容量。
6. SYN Cookie 有什么代价？答：服务端不保存状态，故无法在 SYN+ACK 中携带需要协商状态的选项，可能使窗口缩放等优化失效。

## 九、演进与趋势
TCP Fast Open（RFC 7413）允许 SYN 携带数据以减少一次 RTT，但安全考量使其在公网默认受限。SYN Cookie 在半连接队列压力时延迟分配 `request_sock`，以无状态方式抵御 SYN Flood：服务端把信息编码进 SYN+ACK 的序列号，待第三次 ACK 带回时校验。

现代内核默认按需启用 SYN Cookie，使半连接队列不再是内存耗尽的单点。多队列 listen（reuseport）把全连接队列分散到多核，缓解单锁竞争。此外，eBPF 与 XDP 使得在网卡驱动层就能完成 SYNFLOOD 过滤或 SYN Cookie 计算，进一步降低攻击对协议栈的冲击。

## 十、小结
三次握手同步双方 ISN 并协商选项，内核以半连接与全连接两个队列管理握手中间态。理解队列上限、溢出策略与 SYN Cookie 机制，是排查连接建立失败与抗 SYN Flood 的基础。牢记「backlog 只管排队数、不做握手」「两个队列独立溢出」这两点，可以快速定位绝大多数建连异常。
