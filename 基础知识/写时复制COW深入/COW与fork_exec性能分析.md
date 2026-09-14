# COW与fork_exec性能分析

> 对应 Bryant & O'Hallaron《CSAPP》第 8、9 章、Arpaci-Dusseau《Operating Systems: Three Easy Pieces》进程与地址空间章节，以及 `man 2 fork`/`man 2 vfork`/`man 3 posix_spawn` 的语义约定。

## 一、背景与挑战

shell 每执行一条命令都要 `fork` + `exec`。如果 `fork` 真的复制整个地址空间，一条 `ls` 的启动延迟将由内存带宽决定：300 MiB 的地址空间在 10 GB/s 有效带宽下就是约 30 ms，远超 `ls` 本身的工作量。现实中启动延迟在毫秒级甚至更低，原因正是写时复制。

但「COW 很快」需要量化：它把成本从「复制字节」转换为「复制页表 + 若干次缺页」，两者随进程大小的增长方式不同；在极端场景（不 exec、持续大量写）下 COW 反而会失去优势。性能分析要回答三个问题：fork 的固定成本是多少、它与地址空间大小的关系如何、什么条件下 COW 不再划算。

## 二、核心原理

**无 COW（eager copy）** 的成本结构是：逐页分配新帧 → 逐页复制内容（内存带宽受限）→ 构造子进程页表 → `exec` 立即丢弃全部内容，以上全是净浪费。

**有 COW** 的成本结构是：复制 `mm_struct`、`vm_area_struct` 等内核对象；逐级复制页表（层级 $h=4$ 或 $5$，只复制**存在**的条目）；对私有可写页清写位并加 `refcount`——这一步仍要遍历页表，是 $O(A)$ 的遍历；`exec` 时递减引用计数、释放页表、丢弃地址空间，**零数据复制**；若 fork 与 exec 之间有写入，每个首次写的页付一次缺页加一页复制。

可见 COW 把「$O(A)$ 的字节复制」换成「$O(A)$ 的页表遍历 + $O(W)$ 的缺页复制」。页表遍历的单位成本比字节复制低一个量级（每个 PTE 约 8 字节，而非每页 4 KiB），但它**仍然是 $O(A)$**——这是「大进程 fork 不慢」这句话的准确边界。

## 三、形式化与数学基础

设地址空间 $A$ 页、页大小 $P$、fork 与 exec 之间被写的页数 $W \le A$：

$$Cost_{eager} = c_{copy}\cdot A + c_{pt}\cdot A$$

$$Cost_{COW} = c_{pt}\cdot A + c_{fault}\cdot W$$

令 $\rho = c_{copy}/c_{fault}$（复制一页与处理一次缺页的成本比），则

$$\frac{Cost_{eager}}{Cost_{COW}} \approx \frac{\rho\cdot A}{A + \rho\cdot W}$$

- $W \approx 0$（典型 shell）：$Cost_{COW} \approx c_{pt}A$，收益约为 $\rho$ 倍；
- $W \to A$（fork 后大量写、不 exec）：$Cost_{COW} \to c_{pt}A + c_{fault}A$，与 eager 同阶。

另一个常被忽略的量是**页表自身的内存占用**：PTE 为 8 字节，$A$ 页需要 $8A$ 字节页表，而 eager 的字节复制是 $4096A$ 字节，比值约 $1/512$——这就是数量级上「快几百倍」的来源。

## 四、代码实现

```c
#include <stdio.h>
#include <time.h>
#include <sys/wait.h>
#include <sys/resource.h>
#include <unistd.h>

int main(void) {
    const int N = 2000;
    struct timespec t0, t1;
    struct rusage ru0, ru1;
    getrusage(RUSAGE_CHILDREN, &ru0);
    clock_gettime(CLOCK_MONOTONIC, &t0);
    for (int i = 0; i < N; i++) {
        pid_t pid = fork();
        if (pid == 0) { execl("/bin/true", "true", (char *)NULL); _exit(127); }
        waitpid(pid, NULL, 0);
    }
    clock_gettime(CLOCK_MONOTONIC, &t1);
    getrusage(RUSAGE_CHILDREN, &ru1);
    double ns = (t1.tv_sec - t0.tv_sec) * 1e9 + (t1.tv_nsec - t0.tv_nsec);
    printf("每次 fork+exec 平均 %.1f us\n", ns / N / 1000.0);
    printf("子进程 minor faults 合计 %ld\n",
           ru1.ru_minflt - ru0.ru_minflt);   /* COW 复制主要体现于此 */
    return 0;
}
```

`ru_minflt`（不需要磁盘 IO 的缺页）正是 COW 复制的直接计数器，是判断「COW 究竟复制了多少页」最实用的观测手段。对照组可去掉 `exec` 并让父子各写满地址空间，此时会观察到大量 minor fault 与接近 eager 的耗时。

## 五、与其他技术对比

| 维度 | fork + COW | fork + eager copy | vfork | posix_spawn |
| --- | --- | --- | --- | --- |
| 页表复制 | 是（$O(A)$） | 是 | 否 | 可避免 |
| 数据复制 | 仅被写页 | 全部地址空间 | 无 | 无 |
| 中间写是否安全 | 安全（触发 COW） | 安全 | 未定义（破坏父进程） | 不适用 |
| 子进程运行时机 | 立即返回 | 立即返回 | 父进程被挂起 | 由实现决定 |
| 可移植性 | POSIX | POSIX | POSIX（已被弃用趋势） | POSIX |
| 典型用途 | 通用 | 历史实现 | 快速 exec | 库级进程创建 |

## 六、常见误区

- **「fork 很慢」**：COW 下页表遍历与物理页共享都很快，瓶颈通常在 `exec` 的装载、动态链接与程序初始化。
- **「大进程 fork 一定慢」**：慢的是页表项数与 VMA 数量的遍历，而非物理内存的字节复制；VMA 极多时遍历开销会显著上升。
- **「COW 没有代价」**：页表复制、TLB 失效、缺页处理都要钱，只是量级比字节复制低。
- **「fork 后不 exec 也没问题」**：不 exec 且大量写时，COW 优势被逐页缺页抵消，父子各占一份内存，总内存上升最快。
- **「`vfork` 总是更快」**：它省掉页表复制，但语义危险（不得修改内存、不得返回），现代实现上是 `clone` 的特殊组合。
- **「fork 只有内存开销」**：超大进程 fork 期间持有 mm 相关锁，多线程程序的其它线程可能被阻塞，造成尾延迟抖动。

## 七、与开源书·权威来源对应

- **Bryant & O'Hallaron《CSAPP》**：第 8 章 fork/exec 与进程控制，第 9 章虚拟内存、缺页与页表结构。
- **Arpaci-Dusseau《Operating Systems: Three Easy Pieces》**：进程 API 与地址空间章节，讨论从拷贝式 fork 到 COW 的演进。
- **Tanenbaum《Modern Operating Systems》**：进程创建与地址空间管理，忙等待与切换成本的对照。
- **Love《Linux Kernel Development》**：`copy_process`、`copy_mm` 与 `copy_page_range` 的实现路径。
- **POSIX 手册**：`fork`、`vfork`、`posix_spawn` 的语义与可移植性约定，以官方最新手册为准。
- **Linux 内核文档**：`Documentation/admin-guide/mm/` 中 THP、`madvise` 与 `MADV_WIPEONFORK` 的行为定义。

## 八、面试题

**Q1：为什么 fork 后通常要 exec？不 exec 会怎样？**
要点：exec 丢弃地址空间，让 COW 的复制永不发生；不 exec 则父子各自写入，逐页触发 COW，复制量与内存占用都接近全量复制。

**Q2：COW 下 fork 的复杂度是什么？**
要点：$O(A)$ 的页表遍历与 PTE 复制（每页约 8 字节），而非 $O(4096A)$ 的字节复制；另有 $O(W)$ 的缺页成本。

**Q3：`posix_spawn` 的优化点在哪？**
要点：用 `clone(CLONE_VM | CLONE_VFORK)` 等组合直接创建并切换到目标程序，避开 fork 后的中间写入，接近零复制创建。

**Q4：如何观测 COW 实际复制了多少页？**
要点：看 `getrusage` 的 `ru_minflt`，每次 COW 复制对应一次 minor fault。

**Q5：大内存多线程进程 fork 有什么风险？**
要点：页表遍历期间持有 mm 锁可能阻塞其它线程；VMA 极多时遍历开销上升；子进程只保留调用线程，继承的锁状态可能不一致。

## 九、演进与趋势

- **`clone` 组合优化**：`posix_spawn` 与 `vfork` 借助 `CLONE_VM`/`CLONE_VFORK` 规避页表复制。
- **减少 fork 需求**：`io_uring` 与更高层的进程池/线程池，把进程创建从热路径移除。
- **大页与 fork**：THP 让同样内存下 PTE 更少、页表遍历更快，但单次 COW 复制粒度变大，是双向取舍。
- **安全与隔离**：`MADV_WIPEONFORK` 保证敏感页不跨 fork 泄漏；容器运行时更多使用 `clone3` 精确控制共享范围。
- **可观测性**：`/proc/<pid>/stat` 的 `min_flt` 与 `perf` 的 page-fault 事件让 COW 成本可被持续度量。

## 十、小结

COW 把 fork 的成本从「复制整个地址空间」压到「复制页表 + 复制实际被写的页」：页表每项仅 8 字节，字节复制被完全避免，二者相差两个数量级，这是 shell 能毫秒级启动命令的根本原因。它的边界同样清晰——$O(A)$ 的页表遍历依然存在，fork 后大量写入会让缺页成本累积到与全量复制同阶。工程上应让 fork 后尽快 exec，或用 `posix_spawn`/`clone` 绕过中间态。
