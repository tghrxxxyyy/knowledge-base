# Reactor与Proactor模式

> 对应 Douglas Schmidt《Reactor》模式论文与 Boost.Asio 文档；参考 xiaolincoder/hello-http。

## 一、背景与挑战
将"等待事件"与"处理事件"结构化，避免散落的回调与线程管理。Reactor 用于同步 IO，Proactor 用于异步 IO。

## 二、核心原理
- Reactor：事件多路器（epoll）通知"可读"，应用主动 read 再处理。
- Proactor：应用发起异步 read，内核完成拷贝后通知"已读完"，应用直接处理buffer。

## 三、形式化与数学基础
Reactor 时序：wait -> readable -> user_read -> process
Proactor 时序：aio_read -> [kernel copy] -> completion -> process
Proactor 减少一次用户态拷贝等待，但实现复杂度高（Windows IOCP 原生，Linux 需 io_uring 模拟）。

## 四、代码实现
// Reactor 单线程主循环（伪代码）
while (running) {
    events = demux.wait();
    for (e in events)
        handler[e.fd].on_readable();  // 内部再 read
}
// Proactor：注册完成回调
socket.async_read(buf, [](err, n){ process(buf, n); });

## 五、与其他技术对比
Reactor 在 Linux 生态主流（Netty、Redis）；Proactor 在 Windows IOCP 高效，Linux 借 io_uring 逼近。

## 六、常见误区
1. 认为 Reactor 比 Proactor 慢——取决于内核异步能力。
2. 单 Reactor 易成瓶颈，需 multi-reactor（主从分组）。

## 七、与开源书/权威来源对应
- Schmidt et al. POSA2 (Reactor)
- Boost.Asio 文档
- xiaolincoder/hello-http

## 八、面试题
Reactor 与 Proactor 区别？Netty 用哪种？为什么？

## 九、演进与趋势
io_uring 让 Linux 原生 Proactor 成为可能，统一异步模型。

## 十、小结
Reactor/Proactor 是事件驱动服务器的架构模板，理解二者选择决定性能与复杂度。
