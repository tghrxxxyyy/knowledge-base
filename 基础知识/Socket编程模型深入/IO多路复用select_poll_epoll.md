# IO多路复用select/poll/epoll

> 对应《UNIX Network Programming》ch6 与 Linux man epoll(7)；参考 xiaolincoder/hello-http。

## 一、背景与挑战
单线程需同时监视大量 socket 就绪状态。select/poll 每次遍历全量 fd，epoll 基于内核事件表，复杂度从 O(N) 降到 O(1) 关注活跃数。

## 二、核心原理
- select：位图 fd_set，上限 1024，每次拷贝全量到内核。
- poll：pollfd 数组，无硬上限但仍线性扫描。
- epoll：内核红黑树管理监听 fd，就绪事件放入就绪链表，ET/LT 两种触发。

## 三、形式化与数学基础
时间复杂度：
  select/poll: O(N) 每次调用扫描 N 个 fd
  epoll_wait: O(M) 仅返回 M 个就绪 fd
水平触发（LT）：未处理则持续通知；边缘触发（ET）：仅状态变化时通知一次。

## 四、代码实现
// epoll 水平触发事件循环
int ep = epoll_create1(0);
struct epoll_event ev = {.events = EPOLLIN, .data.fd = listen_fd};
epoll_ctl(ep, EPOLL_CTL_ADD, listen_fd, &ev);
struct epoll_event evs[1024];
while (1) {
    int n = epoll_wait(ep, evs, 1024, -1);
    for (int i = 0; i < n; i++)
        handle_event(evs[i].data.fd);
}

## 五、与其他技术对比
epoll 适合海量连接；select 可移植性好但性能差；BSD 用 kqueue 等价。

## 六、常见误区
1. ET 模式必须循环读到 EAGAIN，否则丢事件。
2. epoll 监听 fd 误用 ET 导致饥饿。

## 七、与开源书/权威来源对应
- Stevens《UNIX Network Programming》ch6
- Linux man epoll(7)
- xiaolincoder/hello-http

## 八、面试题
select/poll/epoll 区别？ET 与 LT？epoll 为何高效？

## 九、演进与趋势
io_uring 提供 submit/complete 队列，进一步统一异步 IO。

## 十、小结
epoll 是 Linux 高并发网络基石，理解 LT/ET 与就绪模型至关重要。
