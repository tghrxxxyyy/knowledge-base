# epoll 与 select poll 的复杂度对比

> 对应 Kurose & Ross《Computer Networking》套接字编程章节与 xiaolincoder/hello-http 关于 I/O 多路复用的对比。

## 一、背景与挑战
在高并发服务器中，单线程如何同时管理数万连接是关键问题。select/poll 与 epoll 都提供「单线程监控多 fd」的能力，但随连接规模增长，三者性能曲线差异巨大。

## 二、核心原理
select 用三个固定位图监控读/写/异常，poll 用动态 pollfd 数组，二者每次调用都把全量集合拷贝进内核并线性扫描判定就绪，复杂度 O(N)。epoll 通过 epoll_ctl 注册后，内核以红黑树维护注册项，就绪时回调入队，epoll_wait 仅扫描就绪链表 O(m)。

## 三、形式化与数学基础
设连接总数 N、就绪数 m。select/poll 每轮 CPU 成本 C_sel = O(N)·(拷贝 + 扫描)；epoll 每轮 C_ep = O(m) + O(log N)·(注册变更频率)。当 N 大且 m/N 很小，C_ep << C_sel。

## 四、代码实现
```c
/* select 每次都要重建集合 */
fd_set read_fds;
FD_ZERO(&read_fds);
for (int fd : fds) FD_SET(fd, &read_fds);
int n = select(max_fd+1, &read_fds, NULL, NULL, &tv);
/* epoll 注册一次，之后只收割 */
int n = epoll_wait(epfd, evs, MAX, -1);
```

## 五、与其他技术对比
epoll 仅在 Linux 可用；BSD 对应 kqueue，Windows 对应 IOCP。跨平台库（libevent、libuv）对这些后端做抽象。相比基于多线程「一连接一线程」模型，多路复用显著降低了上下文切换与内存开销。

## 六、常见误区
误区一：连接少时也要用 epoll——几百连接下 select 更简单且够用。误区二：epoll 零拷贝——事件数组仍需从内核拷贝到用户态。误区三：fd 上限——select 受 FD_SETSIZE 限制，epoll 仅受系统文件描述符上限约束。

## 七、与开源书/权威来源对应
Kurose & Ross 用「select 返回后遍历所有 fd」示例说明其 O(N) 本质；xiaolincoder/hello-http 给出三者时间复杂度与实测对比；CyC2018/CS-Notes 整理过常见面试题对比表。

## 八、面试题
select 的 fd_set 上限为何是 1024？epoll 为什么没有这个限制？什么场景下 poll 优于 epoll？多路复用相比多线程模型的优劣？

## 九、演进与趋势
io_uring 通过提交/完成队列（SQ/CQ）进一步减少系统调用与拷贝；eBPF 可被用来在内核侧做更灵活的 socket 过滤，未来可能改变多路复用的实现形态。

## 十、小结
select/poll 是 O(N) 的轮询式多路复用，epoll 借助内核就绪队列实现 O(m) 收割，是高并发 Linux 服务的首选，但需结合平台与规模权衡。
