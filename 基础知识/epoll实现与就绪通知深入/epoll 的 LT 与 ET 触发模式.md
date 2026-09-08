# epoll 的 LT 与 ET 触发模式

> 对应 xiaolincoder/hello-http 的 epoll 触发模式章节与 man epoll(7) 中关于 LT/ET 的说明。

## 一、背景与挑战
epoll 提供两种通知模式：水平触发（Level-Triggered, LT，默认）与边缘触发（Edge-Triggered, ET）。两者的语义差异直接决定应用程序应以何种方式读写套接字，选错模式会导致事件丢失或忙等。

## 二、核心原理
LT 模式下，只要 fd 处于可读/可写状态，每次 epoll_wait 都会持续报告该事件，允许程序分多次处理。ET 模式下，仅在 fd 状态「由不可读变为可读」的那一次边沿通知，之后若未一次消费完数据，不会再被通知，因此必须配合非阻塞 fd 循环读写直到 EAGAIN。

## 三、形式化与数学基础
令缓冲区内未读字节数为 B(t)。LT 触发条件为 B(t) > 0 时每个 epoll_wait 周期都产生通知；ET 触发条件为仅在 delta B 从 0 跃迁到正值的时刻产生一次通知，即仅在 d(指示(B>0))/dt 的上升沿触发。

## 四、代码实现
```c
ev.events = EPOLLIN | EPOLLET;   /* 边缘触发必须结合非阻塞 */
ev.data.fd = cfd;
epoll_ctl(epfd, EPOLL_CTL_ADD, cfd, &ev);
/* ET 读取循环 */
while ((n = read(cfd, buf, sizeof buf)) > 0) { /* 处理 */ }
if (n < 0 && errno == EAGAIN) { /* 本轮读完，等待下次边沿 */ }
```

## 五、与其他技术对比
LT 行为类似 poll/select 的语义，编程更不易出错但可能多发无效事件；ET 减少了重复通知、吞吐更高，但要求严谨的非阻塞循环读取。Windows 的 IOCP 通过完成端口实现「操作完成即通知」，与 ET 的「状态变化即通知」语义不同。

## 六、常见误区
误区一：ET 比 LT 快就一定该用 ET——若读取逻辑不完整会丢事件。误区二：ET 模式可以用阻塞 fd——一旦缓冲耗尽会阻塞整个事件循环。误区三：EPOLLOUT 在 ET 下只通知一次——需在无数据可写时再注册，避免忙等。

## 七、与开源书/权威来源对应
man epoll(7) 明确指出 ET 必须配合非阻塞文件描述符与循环读写；xiaolincoder/hello-http 用流程图对比两种模式的事件产生时机；Kleppmann《DDIA》在事件循环章节讨论「边沿 vs 水平」这一更普遍的计算概念。

## 八、面试题
ET 为什么必须非阻塞？LT 模式下如果不处理事件会怎样？EPOLLOUT 在 LT 与 ET 下行为差异？什么场景适合 ET？如何避免 ET 下的事件饥饿？

## 九、演进与趋势
结合 EPOLLONESHOT 可在处理完一次事件后自动暂时取消监听，需重新 EPOLL_CTL_MOD 才能再次触发，避免多线程下同一 fd 被多个线程同时处理。这是 ET 之外另一种控制并发访问的手段。

## 十、小结
LT 稳健易用、ET 高效但严苛；选择模式取决于应用对吞吐与正确性的权衡，ET 务必配合非阻塞 fd 与直到 EAGAIN 的读写循环。
