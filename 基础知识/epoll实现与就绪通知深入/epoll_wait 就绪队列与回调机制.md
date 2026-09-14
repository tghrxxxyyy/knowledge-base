# epoll_wait 就绪队列与回调机制

> 对应 Love《Linux System Programming》事件通知章、Stevens《UNIX Network Programming》第 1 卷多路复用章，以及 man 2 epoll_wait 对返回值、超时与 EINTR 的定义。

## 一、背景与挑战
select 与 poll 每次调用都要把全量 fd 集合从用户态拷进内核，再由内核线性扫描判定就绪，复杂度 $O(N)$。并发连接数上万时，重复拷贝与线性扫描成为主瓶颈。epoll 的目标是把「每次调用全量扫描」改造成「事件就绪时主动回调入队」，使开销只与就绪数相关。

## 二、核心原理
就绪队列 rdllist 与回调入队构成 epoll 的心脏：
1. 注册阶段：`epoll_ctl(ADD)` 把 epitem 挂入红黑树，同时在目标 fd 的等待队列上挂回调为 `ep_poll_callback` 的等待项。
2. 通知阶段：socket 可读写时驱动 `wake_up`，回调把 epitem 的 `rdllink` 链入 `rdllist` 并唤醒 `ep->wq`。
3. 收割阶段：`epoll_wait` 进入 `ep_poll`，链表非空直接收割；否则挂入 `wq` 并按毫秒粒度超时睡眠。

五个关键边界机制：
- **复核**：`ep_scan_ready_list` 摘链后对每个 epitem 调 `ep_item_poll` 重新查询就绪掩码，避免虚假就绪。
- **LT 与 ET 的收割差异**：LT 下若复核仍就绪则重新挂回 `rdllist`，下次还能拿到；ET 只上报一次，不重新挂回。
- **maxevents 截断**：返回数不超过 maxevents，多余项留在链表，下次继续收割，不丢事件。
- **超时语义**：负值永久阻塞，0 为非阻塞轮询立即返回，超时到期返回 0。
- **EINTR**：阻塞被信号打断返回 -1 并置 errno，事件循环应继续重启。

## 三、形式化与数学基础
设被监控 fd 总数 $N$、本轮就绪数 $m$，且通常 $m \ll N$：

$$T_{epoll\_wait} = O(m) + O(1),\qquad T_{select/poll} = O(N)$$

$$\frac{T_{epoll}}{T_{select}} = \Theta\!\left(\frac{m}{N}\right)$$

阻塞语义写成不动点式，直到链表非空或超时到期：

$$\text{block until}\quad \mathrm{rdllist} \neq \varnothing \ \lor\ t \ge \tau$$

定义就绪指示函数 $R_f(t) \in \{0,1\}$，就绪集合 $L(t) = \{f \mid R_f(t)=1\}$，则 ET 只关注边沿：

$$\Delta L = L(t) \setminus L(t^-)$$

这解释了 ET 下「没读完就不会再通知」——只要 $R_f$ 保持为 1，$\Delta L$ 即为空。唤醒方面，回调中的 `waitqueue_active(&ep->wq)` 判断把无等待者时的空转唤醒压到 0。

## 四、代码实现
```c
#include <sys/epoll.h>
#include <errno.h>
#include <unistd.h>

/* 标准事件循环：注册一次，之后只收割 */
int run_event_loop(int listen_fd) {
    int epfd = epoll_create1(EPOLL_CLOEXEC);
    if (epfd < 0) return -1;

    struct epoll_event ev, events[1024];
    memset(&ev, 0, sizeof ev);
    ev.events = EPOLLIN;                 /* 默认 LT，稳健 */
    ev.data.fd = listen_fd;
    if (epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev) < 0) return -1;

    for (;;) {
        int n = epoll_wait(epfd, events, 1024, -1);
        if (n < 0) {
            if (errno == EINTR) continue;          /* 被信号打断，重启 */
            return -1;
        }
        for (int i = 0; i < n; i++) {
            uint32_t e = events[i].events;
            if (e & (EPOLLERR | EPOLLHUP)) {       /* 异常与挂断恒上报 */
                close_conn(events[i].data.fd);
                continue;
            }
            if (e & EPOLLIN)  on_readable(epfd, events[i].data.fd);
            if (e & EPOLLOUT) on_writable(events[i].data.fd);
        }
    }
}
```

## 五、与其他技术对比

| 维度 | epoll_wait | select | poll | kqueue |
|---|---|---|---|---|
| 就绪检测方式 | 回调入队 + 收割 | 每次线性扫描 | 每次线性扫描 | 回调入队 + 收割 |
| 每轮复杂度 | $O(m)$ | $O(N)$ | $O(N)$ | $O(m)$ |
| 用户态拷贝 | 仅就绪项 | 全量位图 | 全量数组 | 仅就绪项 |
| 是否需重建入参 | 否 | 是 | 是 | 否 |
| 事件丢失风险 | ET 下读不干净会丢 | 低 | 低 | 需注意过滤器清除 |
| 超时精度 | 毫秒 | 微秒结构体 | 毫秒 | 纳秒 |

## 六、常见误区
误区一：epoll 一定比 select 快。优势只在 $m \ll N$ 时显著；连接少且几乎全就绪时，epoll 的三次系统调用反而更重。
误区二：`epoll_wait` 返回后 fd 一定可读。ET 下没读到 EAGAIN 就再无通知；LT 下其他线程也可能已把数据读走。
误区三：注册后无需维护。fd 关闭前若不 DEL，用户缓存的 `data.ptr` 仍可能悬空。
误区四：事件数等于 maxevents 就认为还有更多。它只表示本轮被截断，需结合业务状态判断。
误区五：把 EINTR 当致命错误。阻塞被信号打断是正常路径，应继续重启。

## 七、与开源书·权威来源对应
- Love《Linux System Programming》：系统调用级 I/O 与事件通知模型，含 EINTR 与超时的实践说明。
- Stevens《UNIX Network Programming》第 1 卷：select/poll 的用法与「每次重建集合」的方式，作为 epoll 的对照基线。
- man 2 epoll_wait、man 7 epoll：返回值、maxevents、timeout 与触发模式的规定，细节以官方最新文档为准。
- Love《Linux Kernel Development》：等待队列、`wake_up` 与超时调度，解释阻塞与唤醒的内核实现。

## 八、面试题
1. epoll 的水平触发与边缘触发区别是什么？
   要点：LT 每次 wait 都报告仍就绪的 fd；ET 只在上升沿报告一次，需非阻塞循环读到 EAGAIN。
2. 为什么 epoll 比 select 更适合高并发？
   要点：注册信息常驻内核避免全量拷贝；就绪由回调入队，wait 只做 $O(m)$ 收割。
3. 收割时为什么必须复核就绪状态？
   要点：入队到收割之间存在时间窗，事件可能已被消费，复核避免虚假就绪。
4. maxevents 小于本轮就绪数会丢事件吗？
   要点：不会，未返回的项留在 rdllist，下次 wait 继续收割。
5. `epoll_create` 返回的 fd 与普通 fd 有何异同？
   要点：同为 fd、生命周期与继承语义一致，但走匿名 inode，只能通过 epoll_ctl/epoll_wait 操作。

## 九、演进与趋势
Nginx、Redis、Node.js 的 libuv 等事件驱动框架均以 epoll 为 Linux 后端；内核侧通过 EPOLLEXCLUSIVE 缓解多进程 accept 惊群，并细化锁与溢出链表降低多核竞争。更远的演进是 io_uring：以提交／完成队列替代每轮 syscall，把「拷贝事件数组」这一步也省掉。是否取代 epoll 取决于内核版本与生态支持，以官方最新文档为准。

## 十、小结
epoll 的精髓是把就绪检测从「调用时轮询」改成「事件源回调入队」，把 wait 复杂度从 $O(N)$ 压到 $O(m)$。正确使用需掌握四件事：rdllist 与 `ep_poll_callback` 的入队路径、`ep_item_poll` 的复核语义、LT/ET 的重新挂回差异，以及 maxevents 截断与 EINTR 重启两个边界行为。
