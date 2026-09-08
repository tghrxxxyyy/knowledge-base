# 发送缓冲区与 SO_SNDBUF

> 对应 RFC 793 发送缓冲语义、Linux socket 选项 man 页与 xiaolincoder/hello-http 的 socket 缓冲说明。

## 一、背景与挑战
应用调用 write/send 并不等于数据已发到网络。内核为每个 TCP socket 维护发送缓冲区，write 实际是把数据拷入该缓冲区，由协议栈异步发送。理解其大小与背压机制，对吞吐与延迟调优至关重要。

## 二、核心原理
SO_SNDBUF 设定发送缓冲区上限（实际由内核按 2 倍分配以便容纳元数据）。当应用写入速率超过协议栈发送速率（受 cwnd、对端窗口、Nagle 等约束），缓冲区被填满，后续 write 阻塞（阻塞 socket）或返回 EAGAIN（非阻塞）。TCP 还会把「对端通告的接收窗口」与「拥塞窗口」取小，作为可发送量的硬约束。

## 三、形式化与数学基础
可发送未确认数据量 <= min(cwnd, rwnd)。发送缓冲占用 = 已写但未确认（含未发与在途）。write 阻塞条件：buffer_used + len > SO_SNDBUF·2（真实上限）。吞吐受 BDP = BtlBw·RTprop 约束，缓冲过小会限制「管道充盈」。

## 四、代码实现
```c
int sz = 1 << 20;  /* 1 MB */
setsockopt(fd, SOL_SOCKET, SO_SNDBUF, &sz, sizeof sz);
/* 非阻塞写：缓冲满则 EAGAIN，需 epoll 等待可写 */
n = send(fd, buf, len, MSG_NOSIGNAL);
```

## 五、与其他技术对比
SO_RCVBUF 对应接收侧；UDP 的发送缓冲仅作排队，无重传与窗口概念。零拷贝（sendfile/splice）可绕过部分应用缓冲区拷贝，但仍受内核 socket 缓冲与窗口约束。

## 六、常见误区
误区一：write 成功=数据已发——只是入缓冲。误区二：SO_SNDBUF 设多大都行——内核有上限（sysctl wmem_max）并会翻倍。误区三：缓冲越大越好——过大增加延迟与内存，且 BDP 之外的缓冲无益。

## 七、与开源书/权威来源对应
man socket(7) 的 SO_SNDBUF；RFC 793 的发送缓冲语义；xiaolincoder/hello-http 解释缓冲与窗口；Kurose & Ross 在 TCP 章讨论缓冲。

## 八、面试题
write 返回代表什么？为何会阻塞？SO_SNDBUF 为何翻倍？BDP 与缓冲关系？

## 九、演进与趋势
Linux 默认开启 TCP 缓冲 autotuning（tcp_rmem/tcp_wmem），按实际吞吐与 RTT 自动调整，减少手动 SO_SNDBUF 调优需求。

## 十、小结
发送缓冲区是应用与协议栈间的异步桥梁，其大小受 SO_SNDBUF、窗口与拥塞控制共同约束；理解背压与 BDP 是吞吐调优的前提。
