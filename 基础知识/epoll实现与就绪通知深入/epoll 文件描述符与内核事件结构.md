# epoll 文件描述符与内核事件结构

> 对应 man 2 epoll_ctl、man 2 epoll_wait 的参数定义，Love《Linux Kernel Development》文件描述符与 anon inode 机制，以及 Stevens《UNIX Network Programming》第 1 卷对 select/poll/kqueue 事件结构的对比。

## 一、背景与挑战
epoll 实例本身也是文件描述符，却既不能 read 也不能 write，只能通过 epoll_ctl 与 epoll_wait 操作。被监控的每个 fd 在内核里对应一个独立对象，用户态只看到一个 `struct epoll_event`。三层结构字段含义不同却名称相似，是排障与封装时最容易搞错的地方。

## 二、核心原理
三层结构：
1. `struct eventpoll`——实例本体，持红黑树 `rbr`、就绪链表 `rdllist`、等待队列 `wq` 与标志位。
2. `struct epitem`——一个监控项，内嵌 `rb_node`（挂 rbr）、`list_head rdllink`（挂 rdllist）、`epoll_filefd ffd`（被监控的 file* 与 fd 号）、`event`（用户注册副本）、`pwqlist`（指向自身等待项）。
3. `struct epoll_event`——跨边界的薄描述，只有 `events` 掩码与 `data` 联合体。

四个关键性质：
- epoll fd 由 `anon_inode_getfd` 创建，走匿名 inode 路径，没有磁盘对象，但完整参与 fd 生命周期管理（继承、dup、close 语义一致）。
- epitem 从专用 slab 缓存分配，避免高频 ctl 的分配抖动；`ffd` 同时保存 file* 与 fd 号，解决「fd 关闭后号码被复用」的身份辨析问题。
- 注册时的 `event` 被拷贝进 epitem 保存，这是「注册一次、后续不再传参」的物理依据。
- 一个 fd 被多个 epoll 实例监控会产生多个 epitem，各自完全独立。

## 三、形式化与数学基础
设注册集合大小为 $N$，红黑树高度 $h(N) = O(\log N)$，故

$$T_{ADD} = T_{DEL} = T_{MOD} = O(\log N)$$

就绪链表入队与摘除为常数时间，`epoll_wait` 的拷贝量只与就绪数 $m$ 及 maxevents 相关：

$$B_{epoll} = \min(m,\ maxevents) \times \mathrm{sizeof(struct\ epoll\_event)}$$

$$B_{select} = 3 \times \lceil N/8 \rceil\ \text{（位图）},\qquad T_{scan} = O(N)$$

两者之比在 $m \ll N$ 时约为 $m/N$，这就是高连接数下节省带宽与 CPU 的来源。位掩码语义上还满足恒上报性质：

$$ev_{reported} \supseteq \mathrm{EPOLLERR} \cup \mathrm{EPOLLHUP}$$

## 四、代码实现
```c
#include <sys/epoll.h>

/* 用户态事件结构：events 掩码 + data 联合体，共 12 字节（64 位下补齐 16） */
typedef union epoll_data {
    void    *ptr;
    int      fd;
    uint32_t u32;
    uint64_t u64;
} epoll_data_t;

struct epoll_event {
    uint32_t     events;   /* EPOLLIN / EPOLLOUT / EPOLLRDHUP / EPOLLET ... */
    epoll_data_t data;     /* 内核原样回填的上下文 */
};
```

```c
/* 推荐用 ptr 携带自有连接对象，规避 fd 号复用带来的身份歧义 */
struct conn { int fd; char rbuf[4096]; };

static int watch(int epfd, struct conn *c, uint32_t flags) {
    struct epoll_event ev;
    memset(&ev, 0, sizeof ev);
    ev.events = flags;
    ev.data.ptr = c;                          /* data 是上下文，不必是 fd */
    return epoll_ctl(epfd, EPOLL_CTL_ADD, c->fd, &ev);
}

static void unwatch(int epfd, int fd) {
    epoll_ctl(epfd, EPOLL_CTL_DEL, fd, NULL);  /* 显式摘除更安全 */
    close(fd);
}
```

## 五、与其他技术对比

| 维度 | epoll_event | select 的 fd_set | poll 的 pollfd | kqueue 的 kevent |
|---|---|---|---|---|
| 结构形态 | 掩码 + 联合体 | 固定大小位图 | 数组，三字段 | ident+filter+flags+udata |
| 是否常驻内核 | 是，注册时存副本 | 否，每次传入 | 否，每次传入 | 是 |
| fd 上限 | 受 RLIMIT_NOFILE | FD_SETSIZE（通常 1024） | 受 fd 上限 | 受 fd 上限 |
| 事件携带上下文 | data 联合体四视图 | 无 | 无 | udata 单一指针 |
| 表达力 | 位掩码，语义有限 | 仅读/写/异常 | 仅读/写/异常 | filter+flags 最灵活 |
| 特殊语义 | EPOLLERR/HUP 恒上报 | 异常集需单独维护 | revents 输出 | 过滤器状态机 |

## 六、常见误区
误区一：`data.fd` 必须等于注册的 fd。`data` 是用户自定义上下文，可存指针、u32 或 u64；实践中存连接对象指针可避免 fd 复用歧义。
误区二：EPOLLERR、EPOLLHUP 需要显式注册。内核任何情况下都会上报它们，注册掩码只决定 EPOLLIN/EPOLLOUT 的订阅。
误区三：epoll fd 可以用 read 读事件。它只接受 epoll_ctl 与 epoll_wait。
误区四：close(fd) 等于从 epoll 移除且万事大吉。内核会自动摘除，但应用缓存的指针仍可能悬空，显式 DEL 是更安全的习惯。
误区五：认为注册副本跨 ctl 保留。`EPOLL_CTL_MOD` 整体替换 `events`，未重新指明的位会丢失。

## 七、与开源书·权威来源对应
- man 2 epoll_ctl、man 2 epoll_wait、man 7 epoll：`events` 与 `data` 字段、EPOLLERR/EPOLLHUP 恒上报、EPOLLET/ONESHOT/EXCLUSIVE 语义，以官方最新文档为准。
- Love《Linux Kernel Development》：文件描述符、anon inode 与 fd 生命周期，解释 epoll 实例为何也是 fd。
- Stevens《UNIX Network Programming》第 1 卷：select/poll 的事件结构设计，作为对照基线。
- Bovet & Cesati《Understanding the Linux Kernel》：`file`、`file_operations` 与 `poll` 方法族，是理解 epitem 如何与目标 fd 关联的基础。

## 八、面试题
1. `epoll_event.data` 能存什么，为什么推荐存指针？
   要点：联合体支持 ptr/fd/u32/u64；存连接对象指针可规避 fd 号复用后的身份混淆。
2. 为什么 EPOLLERR 与 EPOLLHUP 不需要注册？
   要点：它们表达 fd 的状态异常而非订阅意愿，内核无条件上报，用户只需检查返回掩码。
3. 红黑树在 epoll 中的作用是什么，为何不用哈希表？
   要点：管理注册集合，保证最坏 $O(\log N)$、无重哈希抖动、天然有序便于遍历。
4. `epoll_ctl` 比每次 select 传参高效在哪？
   要点：注册信息一次拷贝并常驻内核，后续 wait 只回传就绪项，省掉全量拷贝与全量扫描。
5. 关闭被监控 fd 后不调 EPOLL_CTL_DEL 会怎样？
   要点：内核会自动摘除，但应用缓存的 fd 或指针可能悬空；显式 DEL 更安全。

## 九、演进与趋势
内核在 `eventpoll` 内引入更细粒度锁与溢出链表处理，并完善 EPOLLEXCLUSIVE 支持。`epoll_event` 的形态多年稳定，新能力多以新增 flags 呈现，因此封装层应把未知位视为可透传而非报错。上层趋势是 io_uring 用共享内存环取代事件数组拷贝，eBPF 则在事件路径上提供可编程钩子。具体位定义以官方最新文档为准。

## 十、小结
三层结构分工清晰：`eventpoll` 是实例载体，`epitem` 是注册项（红黑树节点、就绪链表节点与被监控 fd 身份），`epoll_event` 是跨边界的薄描述。理解「注册副本常驻内核」「ERR/HUP 恒上报」「data 是上下文而非 fd」这三点，就能避免绝大多数封装与排障错误。
