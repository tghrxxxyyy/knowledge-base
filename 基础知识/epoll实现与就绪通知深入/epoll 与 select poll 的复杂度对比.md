# epoll 与 select poll 的复杂度对比

> 对应 Stevens《UNIX Network Programming》第 1 卷多路复用章、Kurose & Ross《Computer Networking》套接字编程章，以及 man 2 select、man 2 poll、man 7 epoll 的接口约定。

## 一、背景与挑战
单线程如何同时管理数万连接，是高性能服务器的核心问题。select、poll 与 epoll 都提供「单线程监控多 fd」的能力，但随连接规模增长，三者性能曲线分道扬镳。真正要判断的是：在什么规模、什么就绪比例下该用哪种机制，而不是无条件选 epoll。

## 二、核心原理
select：用三个固定大小位图表达关注集合，每次调用把位图整体拷入内核，内核遍历到最大 fd，返回后调用方还需自行遍历定位就绪项。受 `FD_SETSIZE` 限制，且返回时位图被就地修改，必须重建。

poll：用 `struct pollfd` 数组取代位图，元素含 fd、期望事件与返回事件。摆脱固定上限，但仍每次全量拷贝加线性扫描，且用户态仍要遍历全部元素找就绪。

epoll：注册与等待分离。注册信息常驻内核，内核以红黑树管理监控集合，事件就绪时通过回调把 epitem 挂入就绪链表，`epoll_wait` 只摘取链表并把就绪项拷回用户态。

三者的根本差别是**谁来发现就绪**：select/poll 由 wait 调用方轮询发现，epoll 由事件源在内核回调时发现。这就是 $O(N)$ 与 $O(m)$ 的分水岭。

## 三、形式化与数学基础
设连接总数 $N$、本轮就绪数 $m$，单 fd 扫描成本 $c_s$、单描述符拷贝成本 $c_c$。

$$C_{sel} = \underbrace{N c_c}_{\text{全量拷贝}} + \underbrace{N c_s}_{\text{线性扫描}} = O(N)$$

$$C_{ep} = \underbrace{m c_c}_{\text{仅就绪项}} + O(m) + \underbrace{r \cdot O(\log N)}_{\text{ctl 摊销}}$$

当 $m \ll N$ 时：

$$\frac{C_{ep}}{C_{sel}} \approx \frac{m}{N} \to 0$$

两条重要的边界结论：
- 若 $m \to N$（几乎全部连接都活跃），则 $C_{ep} \approx C_{sel}$，epoll 优势消失，甚至因额外 ctl 与回调略吃亏。
- select 的上限由 `FD_SETSIZE` 决定（glibc 通常 1024），越界属未定义行为；poll 与 epoll 只受 `RLIMIT_NOFILE` 约束。

## 四、代码实现
```c
#include <sys/select.h>

/* select：每次调用都要重建集合并重算 maxfd，返回后还需全量遍历 */
int loop_select(int *fds, int nfds) {
    for (;;) {
        fd_set rfds;
        FD_ZERO(&rfds);
        int maxfd = -1;
        for (int i = 0; i < nfds; i++) {
            FD_SET(fds[i], &rfds);
            if (fds[i] > maxfd) maxfd = fds[i];
        }
        struct timeval tv = { .tv_sec = 1, .tv_usec = 0 };
        int n = select(maxfd + 1, &rfds, NULL, NULL, &tv);
        if (n < 0) { if (errno == EINTR) continue; return -1; }
        for (int i = 0; i < nfds; i++)          /* 全量遍历：O(N) */
            if (FD_ISSET(fds[i], &rfds)) handle(fds[i]);
    }
}
```

```c
#include <poll.h>
#include <sys/epoll.h>

/* poll：动态数组，仍需全量传参与全量扫描 */
int loop_poll(struct pollfd *pfds, nfds_t n) {
    for (;;) {
        int nready = poll(pfds, n, 1000);
        if (nready < 0) { if (errno == EINTR) continue; return -1; }
        for (nfds_t i = 0; i < n; i++)          /* 全量遍历：O(N) */
            if (pfds[i].revents) handle(pfds[i].fd);
    }
}

/* epoll：注册一次，之后只收割就绪项 */
int loop_epoll(int epfd) {
    struct epoll_event evs[512];
    for (;;) {
        int n = epoll_wait(epfd, evs, 512, 1000);
        if (n < 0) { if (errno == EINTR) continue; return -1; }
        for (int i = 0; i < n; i++) handle_one(&evs[i]);   /* O(m) */
    }
}
```

## 五、与其他技术对比

| 维度 | select | poll | epoll | kqueue / IOCP |
|---|---|---|---|---|
| 关注集合载体 | 三个位图 | pollfd 数组 | 内核红黑树 + 就绪链表 | knote 列表 / 完成端口 |
| fd 上限 | FD_SETSIZE，通常 1024 | 受 RLIMIT_NOFILE | 受 RLIMIT_NOFILE | 受系统限制 |
| 每次入参拷贝 | 全量位图 | 全量数组 | 无，仅出参就绪项 | 无 |
| 每轮内核扫描 | $O(N)$ | $O(N)$ | $O(m)$ | $O(m)$ |
| 返回后用户成本 | 遍历全部 fd | 遍历全部元素 | 只处理 n 个事件 | 只处理就绪项 |
| 语义模型 | 就绪通知 | 就绪通知 | 就绪通知 | 就绪 / 完成通知 |

## 六、常见误区
误区一：连接少也要用 epoll。几百连接且大量活跃时，select 或 poll 更简单，性能差异可忽略。
误区二：epoll 是零拷贝。就绪事件数组仍需从内核拷到用户态，只是拷贝量正比于 $m$ 而非 $N$。
误区三：epoll 没有 fd 上限。受 `RLIMIT_NOFILE` 约束，需调大 `ulimit -n` 并注意系统级上限。
误区四：select 的上限「改个宏就能解决」。`FD_SETSIZE` 与内核位图语义耦合，重新编译库仍不可靠。
误区五：poll 与 epoll 只是 API 风格差异。二者复杂度类别不同（$O(N)$ 对 $O(m)$），可扩展性有本质区别。

## 七、与开源书·权威来源对应
- Stevens《UNIX Network Programming》第 1 卷：select 与 poll 的完整用法、「每次重建集合」的惯用法与陷阱。
- Stevens《TCP/IP Illustrated》第 1 卷：阻塞 I/O、I/O 多路复用与信号驱动 I/O 的模型分层。
- Kurose & Ross《Computer Networking》：套接字编程章节用 select 讲解多路复用，说明其 $O(N)$ 本质。
- man 2 select、man 2 poll、man 7 epoll：上限、超时语义与触发模式，细节以官方最新文档为准。

## 八、面试题
1. select 的 fd_set 上限为什么是 1024？
   要点：`FD_SETSIZE` 是编译期常量，决定位图宽度并与内核拷贝方式绑定，改大不可靠。
2. epoll 为什么没有这个限制？
   要点：注册态存于内核红黑树，无需用户态定长位图，上限仅由 fd 资源限制决定。
3. 什么场景下 poll 优于 epoll？
   要点：连接数小、活跃比例高、代码追求简单或需要更广的平台可用性时。
4. 多路复用相比「一连接一线程」的优劣？
   要点：省线程栈与上下文切换，但单线程内需避免阻塞调用，编程复杂度上升且难利用多核。
5. 什么条件下 epoll 相对 select 没有优势？
   要点：当就绪比例 $m/N$ 接近 1，扫描与拷贝都不再是瓶颈时，两者差距收敛。

## 九、演进与趋势
io_uring 通过提交与完成队列把系统调用次数降至接近零，并用共享内存环取代事件数组拷贝，在极低延迟与高 IOPS 场景明显优于 epoll，代价是更复杂的编程模型与内核版本依赖。eBPF 与 XDP 在更早的路径做过滤与分流，与 epoll 互补而非替代。具体可用性与限制以官方最新文档为准。

## 十、小结
select 与 poll 是「每次全量拷贝加线性扫描」的轮询式多路复用，复杂度 $O(N)$；epoll 把注册与等待分离，靠内核就绪队列与回调把每轮开销降到 $O(m)$。选择依据不是「谁更新」，而是就绪比例 $m/N$、连接规模与平台可移植性。
