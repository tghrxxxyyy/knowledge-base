# epoll 惊群与 SO_REUSEPORT

> 对应 Nginx 官方文档关于 accept 惊群的分析与《Linux 内核设计与实现》中唤醒机制描述。

## 一、背景与挑战
多进程/多线程同时阻塞在 epoll_wait 或 accept 上监听同一监听套接字时，一个连接到来可能唤醒所有等待者，仅一个成功、其余空转，这就是「惊群（thundering herd）」。它浪费 CPU 并增加延迟。

## 二、核心原理
传统上多个进程 accept 同一 listen socket，内核虽在较新版本中已对 accept 做互斥（仅唤醒一个），但 epoll_wait 监听同一 epfd 的多进程仍可能同时被唤醒。SO_REUSEPORT 允许多个进程各自 bind 同一端口，由内核在套接字层面做负载均衡，从根本上让每个连接只投递到一个进程的队列。

## 三、形式化与数学基础
设进程数为 P，每来 1 个连接，无缓解时唤醒次数为 P（惊群），实际有效处理为 1，浪费比例 (P-1)/P。使用 SO_REUSEPORT 后，内核哈希选择目标 socket，期望每连接唤醒 1 次，浪费趋近于 0。

## 四、代码实现
```c
int opt = 1;
setsockopt(lfd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof opt);
setsockopt(lfd, SOL_SOCKET, SO_REUSEPORT, &opt, sizeof opt);
bind(lfd, ...);
listen(lfd, BACKLOG);
/* 每个 worker 进程独立 bind 同一端口并 epoll_wait */
```

## 五、与其他技术对比
相比「单 accept 线程 + 分发」模型，SO_REUSEPORT 把负载均衡下放到内核，减少用户态锁竞争。EPOLLEXCLUSIVE 是另一种缓解：多个 epoll 实例监听同一 fd 时仅唤醒一个，适用于共享 epfd 场景。

## 六、常见误区
误区一：新版内核已无惊群——accept 层面基本解决，但 epoll_wait 共享监听仍可能发生。误区二：SO_REUSEPORT 只用于地址复用——它还能做内核级负载均衡。误区三：开启后连接必然均匀——哈希基于四元组，某些长连接场景下可能不均。

## 七、与开源书/权威来源对应
Nginx 文档说明其通过 accept_mutex 与 reuseport 解决惊群；xiaolincoder/hello-http 讨论多进程绑定同一端口；Kleppmann《DDIA》在「请求路由」章节提及负载均衡概念。

## 八、面试题
什么是惊群？SO_REUSEPORT 解决了什么？EPOLLEXCLUSIVE 的作用？多进程模型下如何避免空转？

## 九、演进与趋势
较新内核为 SO_REUSEPORT 增加了热迁移（如 BPF 选择）以缓解进程启停时的连接重分布抖动；eBPF 也允许自定义端口到 socket 的映射。

## 十、小结
惊群源于多等待者被同时唤醒；SO_REUSEPORT 与 EPOLLEXCLUSIVE 分别从套接字层和 epoll 层缓解，是构建多进程高并发服务的关键手段。
