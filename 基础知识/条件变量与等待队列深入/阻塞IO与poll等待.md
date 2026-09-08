# 阻塞IO与poll等待

> 对应 Linux 内核 Documentation 与 RFC 793。

## 一、背景与挑战
进程读写设备时数据可能尚未就绪，需要阻塞等待；同时一个进程常要同时关注多个文件描述符，需要非阻塞地轮询哪些就绪。poll/select/epoll 建立在此之上。

## 二、核心原理
阻塞读在 wait_queue 上等待「数据可读」条件；poll 把当前等待队列项挂到多个文件的等待队列，并在条件变化时唤醒，返回就绪事件掩码。epoll 用内核红黑树与就绪链表避免每次全量扫描。

## 三、形式化与数学基础
对文件 $f$ 定义就绪谓词 $R_f \in \{\text{read},\text{write},\text{except}\}$。poll 返回：

$$ M = \bigcup_{f} \{ e \mid R_f(e) = \text{true} \} $$

epoll 维护就绪集合 $Ready$，事件到达时：

$$ Ready \gets Ready \cup \{f\} $$

免去用户态重复遍历所有 fd。

## 四、代码实现
用户态 poll 与内核 poll 钩子：

```c
struct pollfd pfd = { .fd = fd, .events = POLLIN };
poll(&pfd, 1, -1);           // 阻塞直到可读

// 内核驱动 poll 实现
static __poll_t my_poll(struct file *f, poll_table *wait) {
    __poll_t mask = 0;
    poll_wait(f, &dev->wq, wait);   // 挂入等待队列
    if (data_ready(dev)) mask |= EPOLLIN;
    return mask;
}
```

## 五、与其他技术对比
select/poll 每次需复制与扫描所有 fd，O(n)；epoll 用内核态就绪表达 O(1) 通知；阻塞 IO 简单但一次只能等一个 fd，需用多路复用突破。

## 六、常见误区
认为 poll 会消费数据，它只查询状态；认为 epoll 一定优于 poll，少量 fd 时差距不大；忽略边沿与水平触发（ET/LT）语义差异。

## 七、与开源书/权威来源对应
Linux 内核 Documentation/filesystems/polling.rst；RFC 793 描述 TCP 接收缓冲与就绪；OSTEP 的 IO 章节；CS-Notes 有用户态总结。

## 八、面试题
poll_wait 作用；epoll 为何高效；LT 与 ET 区别；阻塞与非阻塞读差异。

## 九、演进与趋势
io_uring 以提交/完成队列进一步降低系统调用与拷贝开销；epoll 仍是最广泛的多路复用机制。

## 十、小结
阻塞 IO 在等待队列上睡眠，poll 体系把多文件等待队列聚合并返回就绪掩码，epoll 以内核就绪表把复杂度从 O(n) 降到 O(1)，是高并发网络的基础。
