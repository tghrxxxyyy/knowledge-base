# 发送缓冲区与 SO_SNDBUF

> 对应 RFC 793 发送缓冲语义、Linux socket 选项 man 页与 xiaolincoder/hello-http 的 socket 缓冲说明。

## 一、背景与挑战

应用调用 write/send 并不等于数据已发到网络。内核为每个 TCP socket 维护发送缓冲区，write 实际是把数据拷入该缓冲区，由协议栈异步发送。理解其大小与背压机制，对吞吐与延迟调优至关重要——缓冲过小会限制「管道充盈」，过大则增加延迟、内存与重传代价。

从语义上讲，write 成功仅表示数据已进入内核发送缓冲，真正的「发送到网络」由协议栈在窗口与拥塞控制允许时异步完成。这种异步桥梁让应用写与网卡发送解耦，是高吞吐的基础；但也意味着背压信号（EAGAIN/阻塞）才是应用感知网络拥塞的唯一渠道，忽略它会导致缓冲无界增长与 OOM 风险。

## 二、核心原理

SO_SNDBUF 设定发送缓冲区上限（实际由内核按 2 倍分配以便容纳元数据）。当应用写入速率超过协议栈发送速率（受 cwnd、对端窗口、Nagle 等约束），缓冲区被填满，后续 write 阻塞（阻塞 socket）或返回 EAGAIN（非阻塞，需 epoll 等待可写）。TCP 还会把「对端通告的接收窗口」与「拥塞窗口」取小，作为可发送量的硬约束。

现代高效路径还引入了零拷贝与异步 I/O：sendfile/splice 让文件数据不经用户态直接进内核 socket 缓冲；io_uring 以提交-完成队列消除系统调用开销，并在缓冲可写时主动通知，避免 epoll 的惊群。但这些优化仍受 SO_SNDBUF 与窗口约束，不能无限制提速。

关键要点：

- write 成功仅表示数据进入内核发送缓冲，并非已发到网络。
- 缓冲满时阻塞 socket 会阻塞、非阻塞返回 EAGAIN，需 epoll 等待可写。
- 可发送未确认量受 $\min(\text{cwnd}, \text{rwnd})$ 约束，不止受缓冲大小限制。
- SO_SNDBUF 设值会被内核翻倍，且受 sysctl wmem_max 上限约束。
- 非阻塞写须正确处理 EAGAIN（等待 EPOLLOUT），而非丢弃数据。
- 零拷贝/异步 I/O 仍受 SO_SNDBUF 与对端窗口约束，不能无限制提速。

## 三、形式化与数学基础

可发送未确认数据量受双窗口约束：

$$
\text{flight} \le \min(\text{cwnd}, \text{rwnd})
$$

发送缓冲占用 = 已写但未确认（含未发与在途）。write 阻塞条件：

$$
\text{buffer\_used} + \text{len} > 2 \cdot \text{SO\_SNDBUF}
$$

吞吐受带宽-延迟积约束 $BDP = BtlBw \cdot RTprop$。若窗口/缓冲 < BDP，管道无法填满，吞吐被流控限制：

$$
\text{throughput} \le \frac{\min(\text{cwnd, rwnd, buffer})}{RTT}
$$

## 四、代码实现

```c
int sz = 1 << 20;  /* 1 MB */
/* 需在 connect/listen 前设置，否则被 autotuning 覆盖上限 */
setsockopt(fd, SOL_SOCKET, SO_SNDBUF, &sz, sizeof sz);

/* 非阻塞写：缓冲满则 EAGAIN，需 epoll 等待可写 */
n = send(fd, buf, len, MSG_NOSIGNAL);
if (n < 0 && errno == EAGAIN) {
    epoll_ctl(ep, EPOLL_CTL_ADD, fd, &ev_writable);  // 等待 EPOLLOUT
}
```

## 五、与其他技术对比

| 缓冲 | 作用 | 有重传/窗口 | 调优手段 |
|------|------|-------------|----------|
| SO_SNDBUF (TCP) | 发送侧排队+重传 | 是 | setsockopt / autotuning |
| SO_RCVBUF (TCP) | 接收侧 + 窗口源 | 是 | setsockopt / autotuning |
| UDP 发送缓冲 | 仅排队 | 否 | SO_SNDBUF |
| 零拷贝(sendfile) | 绕应用拷贝 | 仍受缓冲窗口 | 内核直传 |

## 六、常见误区

误区一：write 成功=数据已发——只是入缓冲，网络可能尚未发出，更未到达对端。

误区二：SO_SNDBUF 设多大都行——内核有上限（sysctl wmem_max）并会翻倍，超设无效。

误区三：缓冲越大越好——过大增加延迟、内存与重传成本，且 BDP 之外的缓冲无益。

误区四：连接后设置 SO_SNDBUF 有效——应在监听/连接前设置以突破默认上限。

误区五：EAGAIN 是错误——它是背压信号，应当等待可写而非丢弃数据。

## 七、与开源书·权威来源对应

man socket(7) 的 SO_SNDBUF；RFC 793 的发送缓冲语义；xiaolincoder/hello-http 解释缓冲与窗口；Kurose & Ross 在 TCP 章讨论缓冲与 BDP；Linux ip-sysctl 的 wmem_max/wmem_default 给出内核上限。

排障时常用 `ss -tem` 观察 send-q（未发/在途占用）与 rcv-q，send-q 持续高位即背压或接收方窗口不足；`netstat -s` 的 TCP retransmit、timeout 计数可佐证缓冲不足。把缓冲监控纳入可观测体系，才能在容量变化前发现瓶颈。

## 八、面试题

write 返回代表什么？为何会阻塞？SO_SNDBUF 为何翻倍？BDP 与缓冲关系？非阻塞写 EAGAIN 怎么处理？零拷贝受哪些约束？

## 九、演进与趋势

Linux 默认开启 TCP 缓冲 autotuning（tcp_rmem/tcp_wmem），按实际吞吐与 RTT 自动调整，减少手动 SO_SNDBUF 调优需求；BBR 拥塞控制更易把缓冲设到合适 BDP，弱化对超大固定缓冲的依赖。io_uring 等异步接口让应用以事件驱动方式精确响应可写事件，进一步降低缓冲管理复杂度。

## 十、小结

发送缓冲区是应用与协议栈间的异步桥梁，其大小受 SO_SNDBUF、窗口与拥塞控制共同约束；理解背压与 BDP 是吞吐调优的前提，盲目增大并无收益，正确响应 EAGAIN 才能既高吞吐又稳定。
