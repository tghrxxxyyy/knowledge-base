# 零拷贝sendfile与mmap

> 对应 Linux man sendfile(2)/splice(2) 与《UNIX Network Programming》零拷贝章；参考 xiaolincoder/hello-http。

## 一、背景与挑战
传统文件服务：磁盘 -> 内核页缓存 -> 用户缓冲 -> socket 缓冲 -> 网卡，数据多次拷贝与上下文切换。零拷贝消除用户态中转。

## 二、核心原理
- sendfile：内核内直接把页缓存数据送入 socket 缓冲，无需用户空间。
- mmap：文件映射进用户地址空间，read 变内存访问，但仍需一次拷贝到 socket。
- splice：基于管道在内核态连接两 fd。

## 三、形式化与数学基础
传统路径拷贝次数：4 次（disk->pagecache->user->socket->nic），上下文切换 4 次。
sendfile 路径：2 次（pagecache->socket->nic），切换 2 次。
  CPU_save ≈ (copies_trad - copies_zc) * data_size

## 四、代码实现
// 零拷贝发送文件
off_t off = 0;
ssize_t n = sendfile(out_fd, in_fd, &off, file_size);
if (n < 0) perror("sendfile");
// 等价 splice 管道
int p[2]; pipe(p);
splice(in_fd, &off, p[1], NULL, len, 0);
splice(p[0], NULL, out_fd, NULL, len, 0);

## 五、与其他技术对比
mmap 适合随机访问但仍有拷贝；sendfile 最适合静态文件直传；splice 更通用。

## 六、常见误区
1. 认为 mmap 是零拷贝——仅省一次用户态拷贝，仍非完全零拷贝。
2. 忽略 sendfile 对部分文件系统/设备的限制。

## 七、与开源书/权威来源对应
- Linux man sendfile(2), splice(2)
- Stevens《UNIX Network Programming》
- xiaolincoder/hello-http

## 八、面试题
零拷贝减少了什么？sendfile 与 mmap 区别？

## 九、演进与趋势
io_uring 的 SPLICE/固定缓冲进一步降低开销。

## 十、小结
零拷贝通过内核内转发显著减少拷贝与切换，是文件/代理服务性能关键。
