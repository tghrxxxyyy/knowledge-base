# epoll_wait 就绪队列与回调机制

> 对应 xiaolincoder/hello-http 中 epoll 章节与 Robert Love《Linux System Programming》关于事件通知的描述。

## 一、背景与挑战
select 与 poll 每次调用都要把全量文件描述符集合从用户态拷贝进内核，并由内核线性扫描所有 fd 判定就绪，时间复杂度为 O(n)。当并发连接数达到数万时，这种重复拷贝与线性扫描成为瓶颈。epoll 的核心目标是把「每次调用都全量扫描」改造为「事件就绪时主动回调通知」，使开销只与就绪 fd 数量相关。

## 二、核心原理
epoll 实例在内核中维护一个双向链表（就绪队列 rdllist），保存当前已就绪的 epitem。当 socket 收到数据、设备驱动检测到可读写时，通过回调 ep_poll_callback 把对应 epitem 加入 rdllist。epoll_wait 只需检查该链表，把就绪项拷贝到用户传入的 events 数组并返回，无需遍历全部被监控 fd。

## 三、形式化与数学基础
设被监控 fd 总数为 N，就绪 fd 数为 m（m << N）。epoll_wait 的时间复杂度近似为 O(m + k)，其中 k 为内核到用户态的拷贝成本；而 select/poll 为 O(N)。就绪通知的累积等待时间满足 epoll_wait 阻塞直到 rdllist 非空或超时到期。

## 四、代码实现
```c
int epfd = epoll_create1(0);
struct epoll_event ev, events[1024];
ev.events = EPOLLIN;
ev.data.fd = listen_fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev);
int n = epoll_wait(epfd, events, 1024, -1);
for (int i = 0; i < n; i++) {
    handle(events[i].data.fd);
}
```

## 五、与其他技术对比
poll 使用 pollfd 数组、select 使用位图，二者都在每次调用时全量传递并线性扫描；epoll 通过 epoll_ctl 一次性注册，后续调用只收割就绪事件。kqueue（BSD）采用类似「事件发生即入队」的就绪列表思想，但 API 与过滤器模型不同。

## 六、常见误区
误区一：epoll 一定比 select 快——仅在连接数大且就绪少时优势明显，少量活跃连接下差异不大。误区二：epoll_wait 返回后 fd 仍一定可读——在 ET 模式下若未一次读完，后续不会再次通知。误区三：注册后无需维护——fd 关闭前必须 EPOLL_CTL_DEL，否则悬空指针。

## 七、与开源书/权威来源对应
xiaolincoder/hello-http 用图示说明 epoll 的「红黑树 + 就绪链表」结构；Kleppmann《DDIA》在「批处理与流」相关讨论中对比了轮询与事件驱动；Kurose & Ross《Computer Networking》在应用层套接字编程章节介绍 select/poll 的多路复用思想。

## 八、面试题
epoll 的水平触发与边缘触发区别是什么？为什么 epoll 比 select 更适合高并发？ET 模式下读数据要注意什么？epoll 如何避免惊群？epoll_create 返回的 fd 与普通 fd 有何不同？

## 九、演进与趋势
现代网络框架（如 Nginx、Redis、Node.js libuv）普遍以 epoll 为默认事件后端。内核引入了 EPOLLEXCLUSIVE 标志缓解多进程 accept 惊群；io_uring 作为更通用的异步 I/O 接口，正在某些场景替代 epoll 的事件循环模型。

## 十、小结
epoll 通过就绪队列回调机制将就绪检测从 O(N) 降为 O(m)，是高并发网络服务的基石；理解 rdllist、ep_poll_callback 以及 LT/ET 差异是正确高效使用它的前提。
