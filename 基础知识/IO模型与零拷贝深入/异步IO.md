# 异步IO

> 对应 Linux `io_uring`/`libaio` 与 POSIX AIO，及 CSAPP 系统级 IO。

## 一、背景与挑战
多路复用只是“就绪通知”，真正的读写仍需线程执行。异步 IO 让内核在后台完成整个 IO，线程提交请求后即可离开，完成时再被通知。

## 二、核心原理
- 提交 IO 请求（SQE）到内核，立即返回。
- 内核完成数据搬移后把结果放入完成队列（CQE）。
- 应用轮询/等待 CQE，无需自己执行 `read`/`write`。

## 三、形式化 / 数学基础
异步模型：线程数可固定为 CPU 核数，IO 并发度 $D$ 与线程数 $T$ 解耦。吞吐上限由设备带宽决定，而非线程切换。延迟 = 提交 + 设备 + 完成通知。

## 四、代码实现
io_uring 提交读（示意）：

```c
struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
io_uring_prep_read(sqe, fd, buf, sz, 0);
io_uring_submit(&ring);
struct io_uring_cqe *cqe;
io_uring_wait_cqe(&ring, &cqe);   /* 完成时返回 */
io_uring_cqe_seen(&ring, cqe);
```

## 五、与其他技术对比
阻塞 IO 一连接一线程；多路复用就绪通知但仍同步读；异步 IO 连“读”也委托内核，最适合高并发且 CPU 与 IO 重叠。libaio 仅支持 O_DIRECT 文件，io_uring 通用。

## 六、常见误区
- 认为 epoll 是异步：它是同步就绪通知。
- 忽略 AIO 缓冲对齐要求（O_DIRECT 下）。
- 把完成通知当立即成功：需查 CQE 的 res。

## 七、与开源书 / 权威来源对应
- CSAPP 中文笔记：https://github.com/Hansimov/csapp
- 参考 Love《Linux Kernel Development》。

## 八、面试题
1. 异步 IO 与多路复用的本质区别？
2. io_uring 的 SQE/CQE 是什么？
3. 为何异步适合高并发？

## 九、演进与趋势
io_uring 生态快速成熟，支持网络、文件、轮询模式，被视为 Linux IO 的未来统一接口。

## 十、小结
异步 IO 把“提交请求—内核完成—通知结果”全权交给内核，使线程数与 IO 并发解耦，最大化 CPU 与设备重叠。
