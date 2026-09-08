# 连接重置RST的产生与处理

> 对应 RFC 793 (TCP) 第3.4节复位、RFC 1122 相关要求。

## 一、背景与挑战
RST 段用于异常的即时连接终止，它不进入正常四次挥手，而是直接丢弃缓冲并通知应用。RST 常用于端口无监听、半打开连接探测、以及防御性拒绝。理解 RST 触发条件对排查「connection reset by peer」至关重要。

## 二、核心原理
当报文到达一个不存在的套接字（如目标端口无进程监听），内核回送 RST。半打开连接（一端已崩溃重启，另一端仍维持 ESTABLISHED）在收到对端数据时会因序列号不匹配而收到或发送 RST。应用可设置 `SO_LINGER` 且 `l_onoff=1, l_linger=0` 以发送 RST 而非 FIN 关闭。

## 三、形式化与数学基础
RST 判定常依赖序列号是否落在接收窗口内。对于处于 SYN_RCVD 的套接字，若收到 ACK 但确认号不合法：
$$ ack \neq (snt\_isn + 1) \Rightarrow \text{发送 RST} $$
半打开连接探测中，若收到的段 seq 不在期望窗口 $[rcv\_nxt, rcv\_nxt + rcv\_wnd)$ 内，则回 RST。

## 四、代码实现
Linux 在 `tcp_v4_do_rcv` 中检测到无对应 sock 时回 RST：
```c
if (sk->sk_state == TCP_CLOSE)
    return tcp_v4_send_reset(sk, skb);
```
应用强制 RST 关闭：
```python
s.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, struct.pack('ii', 1, 0))
s.close()
```

## 五、与其他技术对比
RST 是立即终止，FIN 是优雅半关闭；UDP 无 RST 概念，不可达端口直接丢弃并返回 ICMP 端口不可达。

## 六、常见误区
误区一是收到 RST 后还能继续收发数据，实际连接已废弃。误区二是认为 RST 一定代表对端崩溃，也可能是应用主动 abort 或防火墙注入。

## 七、与开源书/权威来源对应
RFC 793 定义复位段；RFC 1122 规定对不存在端口回 RST；xiaolincoder/hello-http 列举了常见 RST 触发场景。

## 八、面试题
问：为什么连接一方崩溃重启后，另一方发数据会收到 RST？答：崩溃方重启后无原连接状态，收到带数据的段序列号不匹配，按 RFC 793 回 RST 终止半打开连接。

## 九、演进与趋势
现代中间盒（防火墙、负载均衡）常主动注入 RST 以实现连接限速或策略拒绝，这使「connection reset」成因更趋复杂，需要结合抓包区分是端系统还是中间盒行为。

## 十、小结
RST 是 TCP 用于异常即时终止的机制，触发于无监听端口、半打开连接、显式 abort 与策略拒绝。定位 RST 需结合序列号、状态与抓包综合判断。
