# TCP socket编程实战

> 对应 RFC 793 (TCP) 与 Stevens《UNIX Network Programming》ch3-4；参考 xiaolincoder/hello-http。

## 一、背景与挑战
可靠字节流通讯需要正确完成 连接->读写->关闭 生命周期，并处理 SIGPIPE、半关闭、粘包等问题。

## 二、核心原理
服务端：socket -> bind -> listen -> accept -> read/write -> close。
客户端：socket -> connect -> write/read。
关键选项：SO_REUSEADDR 避免 TIME_WAIT 占端口，TCP_NODELAY 禁用 Nagle。

## 三、形式化与数学基础
TCP 可靠保证：
  sequence + cumulative ACK + retransmission(timeout, RTO)
Nagle 算法：
  if (data < MSS && unacked) buffer   // 凑批
粘包：TCP 无消息边界，应用层需定长/分隔/长度前缀。

## 四、代码实现
// 简化回显服务端
int s = socket(AF_INET, SOCK_STREAM, 0);
int opt = 1; setsockopt(s, SOL_SOCKET, SO_REUSEADDR, &opt, 4);
bind(s, ...); listen(s, 128);
while (1) {
    int c = accept(s, NULL, NULL);
    char buf[1024]; int n;
    while ((n = read(c, buf, sizeof buf)) > 0)
        write(c, buf, n);   // 回显
    close(c);
}

## 五、与其他技术对比
UDP socket 无连接、无保证；TCP 适合需可靠有序的场景（HTTP、RPC）。

## 六、常见误区
1. 一次 read 等于一次 write——TCP 流无边界，需应用层分包。
2. 写对端已关闭的 socket 触发 SIGPIPE 崩溃，需忽略信号或用 MSG_NOSIGNAL。

## 七、与开源书/权威来源对应
- RFC 793 (TCP)
- Stevens《UNIX Network Programming》
- xiaolincoder/hello-http

## 八、面试题
TCP 粘包怎么解决？TIME_WAIT 作用？SIGPIPE 怎么处理？

## 九、演进与趋势
现代框架用连接池与异步 IO 隐藏 socket 细节，但底层仍遵循该模型。

## 十、小结
掌握 TCP socket 生命周期与陷阱，是网络编程的基本功。
