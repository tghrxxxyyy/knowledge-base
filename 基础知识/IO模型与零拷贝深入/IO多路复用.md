# IO多路复用

> 对应 CSAPP 第 10 章与 Linux `select`/`poll`/`epoll`。

## 一、背景与挑战
单线程需同时监视大量 fd 的就绪事件，避免每连接一线程。多路复用用一个系统调用等待“任意一个 fd 就绪”。

## 二、核心原理
- `select`/`poll`：每次传入全量 fd 集合，内核遍历，O(n)。
- `epoll`：内核维护兴趣表，`epoll_wait` 只返回就绪项，O(1) 就绪处理、O(n) 注册规模。
- 水平触发（LT）与边缘触发（ET）决定何时再次通知。

## 三、形式化 / 数学基础
`select` 复杂度 $O(n)$ 每次调用；`epoll` 就绪通知 $O(k)$（$k$ 为就绪数）。ET 要求一次性读尽直到 `EAGAIN`，否则可能丢事件；LT 可重复通知直至处理完。

## 四、代码实现
epoll 事件循环（ET 模式示意）：

```c
int ep = epoll_create1(0);
epoll_ctl(ep, EPOLL_CTL_ADD, fd, &(struct epoll_event){.events=EPOLLIN|EPOLLET});
struct epoll_event evs[64];
int n = epoll_wait(ep, evs, 64, -1);
for (int i = 0; i < n; i++)
    while (read(evs[i].data.fd, buf, sz) > 0) process(buf); /* 读尽 */
```

## 五、与其他技术对比
`select` 受 fd 数 1024 限制且每次全量拷贝；`poll` 去限制但仍 O(n)；`epoll` 适合海量长连接。Windows IOCP 为完成端口（异步）模型。

## 六、常见误区
- 在 ET 模式下未循环读尽导致事件“丢失”。
- 把 epoll 当异步：它是“就绪通知”，仍需自己读。
- 在 epoll 里做耗时阻塞操作拖垮整个循环。

## 七、与开源书 / 权威来源对应
- CSAPP 中文笔记：https://github.com/Hansimov/csapp
- CS-Notes：https://github.com/CyC2018/CS-Notes

## 八、面试题
1. select/poll/epoll 的时间复杂度差异？
2. LT 与 ET 的区别？
3. 为什么 epoll 适合海量连接？

## 九、演进与趋势
io_uring 以共享环形缓冲提供真正的异步提交完成，逐步在某些场景取代 epoll + 多线程模型。

## 十、小结
IO 多路复用用一个调用等待多 fd 就绪：select/poll O(n)，epoll O(就绪数)；ET 高效但须读尽，是单线程高并发核心。
