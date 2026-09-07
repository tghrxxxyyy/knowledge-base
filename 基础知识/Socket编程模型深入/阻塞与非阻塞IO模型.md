# 阻塞与非阻塞IO模型

> 对应《UNIX Network Programming》(Stevens) 与 POSIX socket API；参考 xiaolincoder/hello-http。

## 一、背景与挑战
默认 socket 为阻塞模式，read/recv 在无数据时会挂起线程。高并发下每连接一线程成本极高，需要非阻塞与多路复用。

## 二、核心原理
- 阻塞：调用未就绪则线程睡眠，直到数据到达。
- 非阻塞：调用立即返回 EAGAIN/EWOULDBLOCK，需轮询或事件驱动重试。
设置非阻塞用 fcntl O_NONBLOCK 或 socket 的 MSG_DONTWAIT。

## 三、形式化与数学基础
线程占用模型：
  阻塞：threads = connections（O(N) 内存）
  非阻塞+多路：threads = min(connections, cores)
吞吐量受就绪事件分发开销约束。

## 四、代码实现
// 设置非阻塞
int flags = fcntl(fd, F_GETFL, 0);
fcntl(fd, F_SETFL, flags | O_NONBLOCK);
// 事件循环读取
ssize_t n;
while ((n = recv(fd, buf, sizeof buf, 0)) > 0) {
    handle(buf, n);
}
if (n < 0 && errno == EAGAIN) {
    wait_for_readable(fd);  // 交给多路复用
}

## 五、与其他技术对比
阻塞简单但扩展性差；非阻塞需自行管理状态机，常与 epoll 配合。

## 六、常见误区
1. 非阻塞自动高效——若忙轮询反而更费 CPU。
2. 忽略部分读写（short read/write）需循环处理。

## 七、与开源书/权威来源对应
- Stevens《UNIX Network Programming》
- POSIX.1-2017 socket 规范
- xiaolincoder/hello-http

## 八、面试题
阻塞与非阻塞区别？EAGAIN 含义？为何需循环读写？

## 九、演进与趋势
io_uring 提供真正异步接口，减少 epoll 系统调用开销。

## 十、小结
非阻塞是大规模并发的前提，但需配合事件循环与状态机使用。
