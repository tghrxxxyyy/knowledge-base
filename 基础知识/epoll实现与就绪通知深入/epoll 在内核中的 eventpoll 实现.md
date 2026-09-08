# epoll 在内核中的 eventpoll 实现

> 对应 Linux 内核源码 fs/eventpoll.c 与 xiaolincoder/hello-http 对 eventpoll 结构的解析。

## 一、背景与挑战
理解 epoll 不能只停留在 API，还需深入内核：注册、就绪回调、等待队列如何协作。这关系到为什么 epoll 能在大连接下保持高效，以及某些边界行为（如 EPOLLONESHOT、EPOLLEXCLUSIVE）的来由。

## 二、核心原理
epoll_create 创建一个匿名 inode 文件与 struct eventpoll，后者含 rbr（红黑树根）与 rdllist（就绪链表）以及等待队列 wq。epoll_ctl(ADD) 分配 epitem 并挂入红黑树，同时把 epitem 的等待项挂到目标 fd 的等待队列；当 fd 就绪，驱动调用 ep_poll_callback 将其链入 rdllist。epoll_wait 若链表空则把当前进程挂入 wq 睡眠，唤醒后收集事件。

## 三、形式化与数学基础
回调注册成本：每次 ADD 为 O(log N)。事件通知延迟：从设备中断产生到 rdllist 入队为 O(1) 回调；epoll_wait 唤醒后遍历 m 个就绪项，整体 O(m)。红黑树保证最坏 O(log N) 的注册管理。

## 四、代码实现
```c
/* 内核伪代码：就绪回调 */
static int ep_poll_callback(wait_queue_entry_t *wait, unsigned mode, int sync, void *key) {
    struct epitem *epi = ep_item_from_wait(wait);
    struct eventpoll *ep = epi->ep;
    if (!ep_is_linked(&epi->rdllink))
        list_add_tail(&epi->rdllink, &ep->rdllist);
    wake_up(&ep->wq);
    return 1;
}
```

## 五、与其他技术对比
kqueue 在内核中采用 knote 链表与过滤器链，思路相近但将「过滤器类型」与「事件」解耦。Windows IOCP 是完成驱动模型，与 epoll 的「就绪通知」模型相反，语义上属于异步而非多路复用。

## 六、常见误区
误区一：epoll 完全无锁——就绪链表与红黑树在多核下仍有锁（ep->mtx、ep->lock）。误区二：回调立即唤醒——若 epoll_wait 未等待，事件只是入队，下次调用才返回。误区三：epitem 与 fd 一对一——一个 fd 可被多个 epoll 实例监控，对应多个 epitem。

## 七、与开源书/权威来源对应
Linux 内核 fs/eventpoll.c 是权威实现；xiaolincoder/hello-http 用图展示 rbr 与 rdllist；《Linux 内核设计与实现》解释等待队列与回调机制。

## 八、面试题
ep_poll_callback 做什么？rdllist 与 rbr 的区别？为什么说 epoll 是回调驱动？EPOLLONESHOT 在内核如何实现？

## 九、演进与趋势
内核持续细化 eventpoll 的锁粒度（如 ovflist 处理并发溢出），并在新版本中增加对 EPOLLEXCLUSIVE 的完整支持，减少多消费者竞争。

## 十、小结
epoll 的高效来自「红黑树管理注册 + 就绪链表 + 回调入队」的内核数据结构组合，ep_poll_callback 是连接设备驱动与用户收割的桥梁。
