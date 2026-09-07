# mmap与零拷贝技术

> 对应 Kerrisk《The Linux Programming Interface》第 49 章与 xiaolincoder/hello-http 关于零拷贝的文章。

## 一、背景与挑战
服务器把文件发往 socket，传统 `read`+`write` 经历"磁盘→页缓存→用户缓冲→socket 缓冲→网卡"四次拷贝与两次上下文切换。零拷贝旨在消除用户态中转拷贝。

## 二、核心原理
`mmap`+`write`：文件映射后 `write(sock, p, n)` 由内核直接把页缓存页送入 socket，省一次用户拷贝。`sendfile` 更彻底：内核内从文件 fd 直接到 socket fd，零用户态参与；`splice` 用管道缓冲在内核搬运。

## 三、形式化与数学基础
传统路径拷贝次数 $C=4$，上下文切换 $S=2$（read+write）。mmap+write：$C=3$（仍一次内核内复制页缓存到 skb）。sendfile：$C=2$（DMA  gather 时 $C=1$ 仅设备间）。复制量：
$$Copy_{total} = \sum copies \cdot page\_size$$

## 四、代码实现
```c
// sendfile：文件到 socket 零用户态拷贝
off_t off = 0;
sendfile(sockfd, filefd, &off, file_size);
// 对比 mmap 方案：read 进用户缓冲那一次被省去
```

## 五、与其他技术对比
sendfile 最简洁但要求源是文件；splice 灵活支持管道；mmap+write 可读改写但多一次拷贝。相较用户态缓冲，零拷贝降 CPU 与延迟。

## 六、常见误区
误以为零拷贝零复制：仍可能有内核内一次复制或 DMA gather。误以为 mmap 就等于零拷贝：还需配合 write/sendfile。误以为对小文件收益大：小文件开销在系统调用而非拷贝。

## 七、与开源书/权威来源对应
Kerrisk 第 44/49 章 sendfile/splice；xiaolincoder 文章以图讲解四次拷贝如何缩减。

## 八、面试题
问：传统 read+write 几次拷贝？答：四次（磁盘→页缓存、页缓存→用户、用户→socket、socket→网卡）。问：sendfile 优势？

## 九、演进与趋势
`MSG_ZEROCOPY` 标志让 socket 发送避免最后内核复制；io_uring 提供异步零拷贝收发。

## 十、小结
mmap/sendfile/splice 逐层削减拷贝与切换，是网络文件服务高吞吐的关键优化。
