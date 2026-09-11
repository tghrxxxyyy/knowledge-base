# mmap与零拷贝技术

> 对应 Kerrisk《The Linux Programming Interface》关于 sendfile/splice 的章节（第 44/49 章附近）与 Linux 内核页缓存机制。

## 一、背景与挑战

服务器把文件内容发往 socket 是极常见的操作。传统 `read` + `write` 路径会经历「磁盘 → 页缓存 → 用户缓冲 → socket 缓冲 → 网卡」多次数据搬运，并伴随两次用户态/内核态切换。数据量越大、并发越高，这些拷贝与切换占用的 CPU 与内存带宽就越多。

零拷贝（zero-copy）的目标不是「真的零次复制」，而是**消除用户态中转的那一次拷贝**、减少系统调用与上下文切换。理解每种方案省掉了哪一次拷贝，才能正确选型。

## 二、核心原理

由弱到强的三种方案：

1. **mmap + write**：把文件映射进用户地址空间，再用 `write(fd, p, n)` 发送。内核可直接从页缓存把数据送入 socket，省掉「页缓存 → 用户缓冲」的拷贝。但仍有「页缓存 → socket 缓冲」的内核内复制。
2. **sendfile**：`sendfile(out_fd, in_fd, offset, count)` 在内核内把文件 fd 的数据直接送到 socket fd，全程无用户态参与，进一步省去映射与切换。要求输入是文件、输出是 socket（或支持的目标）。
3. **splice**：借助管道缓冲在两个 fd 之间搬运，灵活性更高，可用于任意可 splice 的 fd 对。

在支持 DMA gather 的网卡上，sendfile 甚至可让网卡直接从页缓存 gather 数据，把内核内复制也省掉。

## 三、形式化与数学基础

传统路径的拷贝次数与切换次数：

$$ C_{trad} = 4, \qquad S_{trad} = 2 \quad (\text{read} + \text{write}) $$

mmap + write：

$$ C_{mmap} = 3, \qquad S_{mmap} = 2 $$

sendfile（无 DMA gather）：

$$ C_{sendfile} = 2, \qquad S_{sendfile} = 1 $$

sendfile + DMA gather：

$$ C_{gather} = 1 \quad (\text{仅设备间传输}) $$

数据搬运总量：

$$ \text{Copy}_{total} = \sum_{\text{copies}} \text{bytes} $$

拷贝次数每减少一次，就相当于为大文件传输省下一遍全量内存带宽，这在吞吐受限的服务上收益显著。

## 四、代码实现

```c
#include <sys/sendfile.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>

long send_file_to_socket(int sockfd, const char *path) {
    int filefd = open(path, O_RDONLY);
    if (filefd < 0) return -1;

    struct stat st;
    if (fstat(filefd, &st) != 0) { close(filefd); return -1; }

    off_t off = 0;
    long sent = 0;
    /* 文件 -> socket，零用户态拷贝 */
    while (sent < st.st_size) {
        ssize_t n = sendfile(sockfd, filefd, &off, (size_t)(st.st_size - sent));
        if (n <= 0) break;
        sent += n;
    }

    close(filefd);
    return sent;
}

/* 对比 mmap 方案：省去的是 read 进用户缓冲的那一次拷贝
 * void *p = mmap(NULL, n, PROT_READ, MAP_PRIVATE, fd, 0);
 * write(sockfd, p, n);   // 内核内页缓存 -> socket 缓冲 仍存在
 */
```

注意 `sendfile` 的 `count` 上限与返回语义，循环发送大文件是常见做法。

## 五、与其他技术对比

| 方案 | 数据拷贝次数 | 上下文切换 | 是否需用户态缓冲 | 适用场景 |
| --- | --- | --- | --- | --- |
| `read` + `write` | 4 | 2 | 是 | 通用、需处理数据 |
| `mmap` + `write` | 3 | 2 | 否（映射替代） | 需读改写大文件 |
| `sendfile` | 2（gather 时 1） | 1 | 否 | 文件 → socket |
| `splice` | 2 | 1 | 否（管道中转） | 任意 fd 对 |
| `MSG_ZEROCOPY` | 视实现减少 | 1+ | 否 | socket 发送优化 |

## 六、常见误区

- 认为零拷贝就是零复制：仍可能存在内核内复制或 DMA gather。
- 认为 mmap 就等于零拷贝：还需配合 `write`/`sendfile`，且有一次内核内复制。
- 认为对小文件收益大：小文件开销主要在系统调用，拷贝节省有限。
- 认为 sendfile 通用：它要求输入为文件、输出为 socket 类目标。
- 忽略大数据传输需循环发送：单次调用有长度上限，需按返回值续传。

## 七、与开源书·权威来源对应

Kerrisk《The Linux Programming Interface》讨论了 `sendfile` 与 `splice` 的语义与限制；Linux 内核页缓存与 DMA 机制文档解释了底层搬运路径。具体调用上限与行为以官方最新文档为准。

## 八、面试题

- 问：传统 `read` + `write` 几次拷贝？答：四次（磁盘→页缓存、页缓存→用户、用户→socket、socket→网卡）。
- 问：sendfile 的优势？答：内核内直接文件到 socket，省掉用户拷贝与一次切换。
- 问：mmap + write 省了哪一次？答：页缓存到用户缓冲的那一次拷贝。
- 问：DMA gather 如何进一步优化？答：网卡直接从页缓存读取，省去内核内复制。

## 九、演进与趋势

`MSG_ZEROCOPY` 让 socket 发送避免最后一次内核复制；`io_uring` 提供异步、批量的零拷贝收发；RDMA 在数据中心把网络传输也纳入零拷贝路径。具体支持以官方最新文档为准。

## 十、小结

mmap、sendfile、splice 逐层削减拷贝与上下文切换，是网络文件服务高吞吐的关键优化。选型口诀：**要读改写用 mmap，纯文件下发用 sendfile，任意 fd 对用 splice**。
