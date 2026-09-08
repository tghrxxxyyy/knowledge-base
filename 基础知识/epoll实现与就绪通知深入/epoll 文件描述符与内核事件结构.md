# epoll 文件描述符与内核事件结构

> 对应《Linux 内核设计与实现》eventpoll 相关结构与 man epoll_ctl(2) 的参数定义。

## 一、背景与挑战
epoll 实例本身由一个内核文件描述符表示，对其监听的每个 fd 对应一个内核对象。理解 struct eventpoll 与 struct epitem、struct epoll_event 的字段，是排查 epoll 行为异常与编写正确封装层的基础。

## 二、核心原理
struct eventpoll 持有一棵红黑树（rbr）管理所有被监控 epitem，以及一个就绪链表（rdllist）。struct epitem 内嵌 rb_node 与 list_head，并通过 ffd 记录被监控 fd。用户态的 struct epoll_event 仅含 events 位掩码与 data 联合体（可携带 fd、指针或 u32），内核据此回填就绪事件。

## 三、形式化与数学基础
红黑树高度为 O(log N)，故 epoll_ctl 的 ADD/DEL/MOD 单次操作复杂度均为 O(log N)。就绪链表为 O(1) 头插与遍历，epoll_wait 收割成本与就绪数 m 成线性。

## 四、代码实现
```c
typedef union epoll_data {
    void    *ptr;
    int      fd;
    uint32_t u32;
    uint64_t u64;
} epoll_data_t;

struct epoll_event {
    uint32_t     events;   /* EPOLLIN, EPOLLOUT, EPOLLERR ... */
    epoll_data_t data;
};
```

## 五、与其他技术对比
select 的 fd_set 是固定大小的位图（通常 1024），poll 的 pollfd 数组动态但每次全量拷贝；epoll 的事件结构常驻内核、按需回填，避免了反复传输。kqueue 的 struct kevent 类似，但还携带过滤器与标志位，表达力更强。

## 六、常见误区
误区一：data.fd 与注册 fd 必须相同——data 是用户自定义上下文，可存指针而非 fd。误区二：events 位掩码会保留——EPOLLERR/EPOLLHUP 总是上报，不需主动注册。误区三：epoll fd 可直接 read——epoll fd 不支持常规 read，只能通过 epoll_wait 取事件。

## 七、与开源书/权威来源对应
man epoll_ctl(2) 与 man epoll_wait(2) 定义了 events 与 data 字段；xiaolincoder/hello-http 给出内核 eventpoll 结构关系图；Kurose & Ross 在套接字编程章以 select 为基础，epoll 是其 Linux 演进。

## 八、面试题
epoll_event 的 data 联合体能存什么？EPOLLERR 为何不需要注册？红黑树在 epoll 中的作用？为什么 epoll_ctl 比每次 select 传参高效？

## 九、演进与趋势
较新内核在 eventpoll 中引入了更细粒度的锁（如 ovflist 处理溢出事件），并对 EPOLLEXCLUSIVE 提供支持，降低了多消费者场景下的竞争。

## 十、小结
epoll 实例由内核 fd 表示，红黑树管理注册项、就绪链表承载事件，用户态 epoll_event 仅描述关心的事件与回传上下文，三者分工明确。
