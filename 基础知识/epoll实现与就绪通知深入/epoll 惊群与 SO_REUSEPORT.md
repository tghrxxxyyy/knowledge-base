# epoll 惊群与 SO_REUSEPORT

> 对应 W. Richard Stevens《UNIX Network Programming》第 1 卷套接字编程章节、Love《Linux Kernel Development》等待队列与唤醒机制、Bovet & Cesati《Understanding the Linux Kernel》，以及 man 7 socket 中 SO_REUSEPORT 的正式定义。

## 一、背景与挑战
多进程／多线程服务模型下，多个执行流同时阻塞在同一个监听套接字或同一个 epoll 实例上。一个事件到来会把全部等待者唤醒，但只有一个能真正取得资源，其余立刻失败或空转再睡——这就是惊群（thundering herd）。瞬时高并发时，惊群把一次有效唤醒放大成 P 次上下文切换，形成「唤醒→争锁→失败→重睡」的抖动。

惊群实际分三个层次，混为一谈是最常见的分析错误：
1. accept 惊群：多进程阻塞在同一 listen fd 的 accept 上。
2. epoll 惊群：多进程／多线程阻塞在同一 epfd 的 epoll_wait 上。
3. 内核唤醒风暴：单次 wake_up_all 把等待队列整体唤醒。

## 二、核心原理
accept 侧的修补：早期内核在 listen socket 的等待队列上用 wake_up_all，导致全部等待者醒来，只有一个 accept 成功、其余收到 EAGAIN/ECONNABORTED。现代内核改为排他等待（WQ_FLAG_EXCLUSIVE），并保证 accept 在返回前已把连接从队列摘走，因此 accept 层的惊群基本消失。

epoll 侧为什么仍在：epoll_wait 的等待项本身也是排他等待，但事件源 fd 的等待队列上挂的是 ep_poll_callback 的等待项，而**同一个 fd 可以同时被多个 epoll 实例监控**，每个实例有各自的 epitem。fd 就绪时驱动 wake_up 该 fd 的等待队列，每个回调把各自的 epitem 挂入各自 ep->rdllist，并各自唤醒自己 ep->wq 上的等待者。于是「一个连接唤醒了多个 epoll_wait」。

两种缓解手段的层次完全不同：
- EPOLLEXCLUSIVE：在 epoll 层声明排他注册，内核只在等价的 epoll 等待者中唤醒一个，适用于「多个 epoll 实例监听同一 fd」。
- SO_REUSEPORT：在套接字层允许组内多个 socket 各自 bind 同一 (addr, port)，内核按哈希把新连接投递到某一个 socket 的 accept 队列，从源头做到「一个连接只属于一个进程」。

SO_REUSEPORT 的成立条件由内核强制校验：组内所有 socket 需同一协议族与类型、同一绑定地址与端口、均设置 SO_REUSEPORT，且有效 uid 相同（防止跨用户抢占端口）。

## 三、形式化与数学基础
设等待者数 $P$，一次事件只能有一个成功。无缓解时：

$$W = P,\quad \text{有效唤醒} = 1,\quad \text{浪费率} = \frac{P-1}{P}$$

若单次无效唤醒成本为 $c$（上下文切换、调度、争锁），单事件额外开销：

$$C_{herd} = (P-1)c$$

采用内核选择（EPOLLEXCLUSIVE 或 reuseport 哈希）后，期望唤醒次数 $E[W] \to 1$。reuseport 的选择可抽象为：

$$s = \arg\min_{i \in [0,n)} \Big( H_4(srcIP, srcPort, dstIP, dstPort) \oplus r_i \Big)$$

其中 $r_i$ 是各 socket 的随机因子，$\oplus$ 为哈希组合。同一四元组稳定落到同一 $s$，因此具备连接级亲缘性（connection affinity）。注意哈希对象是**连接**而非请求：长连接场景下每个连接独立抽样，当活跃连接数 $n$ 较小时，短期负载方差 $\sigma^2 \propto n$，肉眼可见不均衡。

## 四、代码实现
```c
/* 每个 worker 独立创建、bind、listen，共享同一端口 */
int make_listener(const char *addr, int port, int backlog) {
    int fd = socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK, 0);
    int one = 1;
    /* REUSEADDR 解决 TIME_WAIT 下的 bind 冲突 */
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
    /* REUSEPORT 才是内核级负载均衡的关键 */
    setsockopt(fd, SOL_SOCKET, SO_REUSEPORT, &one, sizeof one);
    struct sockaddr_in sa = {0};
    sa.sin_family = AF_INET;
    sa.sin_port = htons(port);
    inet_pton(AF_INET, addr, &sa.sin_addr);
    if (bind(fd, (struct sockaddr *)&sa, sizeof sa) < 0) return -1;
    if (listen(fd, backlog) < 0) return -1;
    return fd;   /* 各 worker 用各自的 fd 建 epoll 实例 */
}
```

```c
/* 多 epoll 实例监听同一 fd 时，用排他注册把唤醒收敛到一个 */
struct epoll_event ev;
memset(&ev, 0, sizeof ev);
ev.events = EPOLLIN | EPOLLEXCLUSIVE;  /* 不可与 EPOLLONESHOT/EPOLLET 同用 */
ev.data.fd = listen_fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev);
```

```c
/* 用 BPF 替换 reuseport 默认哈希（挂在 reuseport 组上） */
/* sk_reuseport_md 提供四元组、数据与 socket 组上下文 */
return bpf_sk_select_reuseport(ctx, &reuseport_map, &hash_key, 0);
```

## 五、与其他技术对比

| 维度 | accept 多进程竞争 | 共享 epfd + EPOLLEXCLUSIVE | SO_REUSEPORT 多进程 | 单 reactor + 线程池 |
|---|---|---|---|---|
| 每连接内核唤醒数 | 1（现代内核） | 1 | 1 | 1 |
| 负载均衡位置 | 无，靠 accept 抢占 | 无 | 内核按四元组哈希 | 用户态分发 |
| 连接亲缘性 | 无 | 无 | 有，四元组稳定 | 依赖分发策略 |
| 进程能否独立监听 | 否，继承父 fd | 否 | 是 | 否 |
| 平滑重启 | 困难 | 一般 | 容易，逐个替换 | 一般 |
| 主要瓶颈 | 单核 accept 争锁 | 需共享 epfd | 内核版本与参数配置 | 分发队列 |

## 六、常见误区
误区一：认为现代内核已无 epoll 惊群。被消除的是 accept 层惊群；epoll 层是否惊群取决于注册是否排他，未用 EPOLLEXCLUSIVE 时依旧发生。
误区二：把 SO_REUSEPORT 当成 SO_REUSEADDR 的别名。前者是端口复用加内核分流，后者只放宽 TIME_WAIT 下的 bind 判定，二者语义无关。
误区三：认为开启 reuseport 后连接必然均匀。哈希基于连接四元组，长连接、客户端端口空间狭窄或 NAT 聚合都会造成偏斜。
误区四：把 EPOLLEXCLUSIVE 与 EPOLLET、EPOLLONESHOT 任意组合。内核拒绝这种组合并返回 EINVAL。
误区五：认为只要设了 SO_REUSEPORT，任意进程都能绑上同一端口。内核要求同族同型、同地址端口、同 uid，否则 bind 失败。

## 七、与开源书·权威来源对应
- Stevens《UNIX Network Programming》第 1 卷：listen/accept 语义、backlog 与连接队列，是理解 accept 竞争的基础。
- Love《Linux Kernel Development》与 Bovet & Cesati《Understanding the Linux Kernel》：等待队列、排他等待与 wake_up 系列，解释唤醒风暴的机制根因。
- man 7 socket、man 2 epoll_ctl：SO_REUSEPORT 的成立条件与 EPOLLEXCLUSIVE 的语义约束，细节以官方最新文档为准。
- Nginx 官方文档：accept_mutex 与 reuseport 指令的取舍，是最直接的工程落地参考。

## 八、面试题
1. 惊群在 accept 与 epoll 两层分别是什么？
   要点：accept 层靠排他等待消除；epoll 层因一个 fd 可挂多个 epitem 的回调而仍可能发生。
2. SO_REUSEPORT 与 SO_REUSEADDR 的区别？
   要点：前者多 socket 绑同端口并由内核选一路由，后者仅放宽 bind 冲突判定。
3. EPOLLEXCLUSIVE 解决什么，有什么限制？
   要点：多 epoll 实例监听同一 fd 时只唤醒一个；与 EPOLLET、EPOLLONESHOT 互斥。
4. reuseport 的负载为什么不保证均匀？
   要点：按连接四元组哈希，长连接与客户端端口复用导致偏斜，方差随活跃连接数变化。
5. 不改内核如何做连接级迁移或自定义分流？
   要点：挂 BPF reuseport 程序自定义选择，或应用层借 SO_REUSEPORT 组做逐个进程灰度替换。

## 九、演进与趋势
内核为 reuseport 增加了 BPF 挂载点，使「按连接数最少」「按线程负载」等策略可由用户程序定义，代价是把选择正确性责任交给用户态。
io_uring 用 SQ/CQ 队列取代事件循环的部分角色，可减少系统调用与唤醒次数，但它并不直接消除惊群，accept 分发仍需单独设计。
容器与 Kubernetes 场景常见「eBPF/XDP 做内核侧 L4 分流 + 用户态多 worker 绑定 reuseport」的组合形态。具体特性以官方最新文档为准。

## 十、小结
惊群的本质是「一个事件唤醒了多个无法同时成功的等待者」，代价为 $(P-1)c$ 的无谓调度与争锁。内核给出两把不同层次的工具：EPOLLEXCLUSIVE 在 epoll 层做排他唤醒，SO_REUSEPORT 在套接字层做哈希分流。工程选型看三点——是否共享监听 fd、是否需要连接亲缘性、是否需要平滑重启；同时接受 reuseport 哈希在长连接下不保证长期均匀这一事实。
