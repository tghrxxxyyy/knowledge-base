# COW基本原理与fork

> 对应 Bryant & O'Hallaron《Computer Systems: A Programmer's Perspective》第 8、9 章，与 Bovet & Cesati《Understanding the Linux Kernel》第 9 章。

## 一、背景与挑战

`fork` 要求子进程拥有父进程地址空间的**独立副本**。若「独立」只能靠「立刻全量复制」实现，那么即使子进程紧接着 `exec`（丢掉整个地址空间），那几百 MiB 的复制也白白浪费——在 shell 这类「fork 立刻 exec」的路径上，复制开销会完全主导命令启动延迟。

更根本的是，复制在语义上就是多余的：fork 之后父子往往只读共享大部分页（代码段、只读数据、未被修改的堆页），真正被写过的页极少。写时复制（COW）把「复制」推迟到「第一次写」：fork 时只复制页表并把物理页设为共享只读，谁先写谁触发缺页，内核才为它复制一页。语义保持独立，复制量则从「整个地址空间」降到「实际被写的页」。

## 二、核心原理

`fork` 的实现要点：

1. 父进程的 `mm_struct`、`vm_area_struct` 被复制（或按 `CLONE_VM` 共享），页表逐级复制；
2. 所有**可写**的私有 PTE 清掉写位并标记为 COW，真正只读的映射（代码段）保持原样；
3. 每个被共享的物理页 `refcount` 加一；
4. 任一方写该页触发 `#PF`，错误码指出「写访问只读页」，内核据此判定：
   - 是 COW 页且 `refcount > 1`：分配新帧、复制内容、把写者 PTE 改回可写、原页计数减一；
   - 是 COW 页且 `refcount == 1`：只剩一个使用者，直接把 PTE 改成可写（exclusive COW 优化）；
   - 不是 COW 页（真只读映射）：投递 `SIGSEGV`。

`exec` 路径更简单：它丢弃整个旧地址空间，只需递减 `refcount` 并释放页表，**零数据复制**。

## 三、形式化与数学基础

设地址空间 $S$ 字节、页大小 $P$、页数 $A = S/P$，$W$ 为 fork 到 exec 之间被写的页数：

$$T_{eager} = c_{copy}\cdot A + c_{pt}\cdot A + c_{exec}$$

$$T_{COW} = c_{pt}\cdot A + c_{fault}\cdot W + c_{exec},\qquad c_{pt} \ll c_{copy}$$

shell 场景 $W \approx 0$，故 $T_{COW} \ll T_{eager}$；反之若 fork 后长期不 exec 且持续写，$W \to A$，COW 退化到接近 eager，并额外付出 $W$ 次缺页。单页复制条件为 $copy(i) \iff write(i) \land refcount(i) > 1$。fork 后物理内存占用**瞬时不变**（只多了页表结构），这是「fork 不会让内存立刻翻倍」的形式化表述。

## 四、代码实现

```c
#include <unistd.h>
#include <sys/wait.h>

int main(void) {
    int shared = 0;                 /* 私有可写页，fork 后标记 COW */
    pid_t pid = fork();
    if (pid == 0) {
        shared = 42;                /* 子进程写：触发 #PF，复制一页 */
        execl("/bin/ls", "ls", "-l", (char *)NULL);
        _exit(127);                 /* exec 失败 */
    }
    wait(NULL);
    return shared;                  /* 父进程仍是 0，说明副本独立 */
}
```

```c
/* 观测 COW 的实际成本：minor fault 计数即复制页数的度量 */
#include <sys/resource.h>
struct rusage ru;
getrusage(RUSAGE_SELF, &ru);
/* ru.ru_minflt 包含 COW 复制产生的缺页次数 */
```

`vfork` 走另一条路：子进程借用父进程地址空间，并保证在 `exec`/`_exit` 前不返回，因此连页表都不复制；代价是语义受限（不得修改数据、不得从函数返回）。

## 五、与其他技术对比

| 维度 | fork + COW | fork + eager copy | vfork | clone(CLONE_VM) |
| --- | --- | --- | --- | --- |
| 复制量 | 页表 + 实际写入页 | 全地址空间 | 0（借用） | 0（共享） |
| 父子独立性 | 是 | 是 | 否 | 否 |
| 是否可写 | 可写（触发复制） | 可写 | 不可写（未定义） | 可写（互相可见） |
| 缺页开销 | 有（每首写页一次） | 无 | 无 | 无 |
| 主要用途 | 通用进程创建 | 历史实现 | 快速 exec | 线程 |
| 语义安全性 | 高 | 高 | 低 | 取决于使用 |

## 六、常见误区

- **「fork 后内存立刻翻倍」**：COW 下物理页共享，占用不变直到有写入。
- **「COW 完全免费」**：页表复制是 $O(A)$ 的，每次首写都要一次缺页加一页复制；大页还会放大单次复制量。
- **「子进程写会影响父进程」**：不会。写入触发复制，父子各持独立副本。
- **「页表复制与地址空间大小无关」**：页表规模正比于页数，是 $O(A)$，这正是大内存进程 fork 仍有可观开销的原因。
- **「用 mmap 就能规避所有 fork 成本」**：`madvise(MADV_WIPEONFORK)` 只适用于「子进程不该看到父进程数据」的场景，且仍需页表操作。

## 七、与开源书·权威来源对应

- **Bryant & O'Hallaron《CSAPP》**：第 8 章异常控制流与 fork，第 9 章虚拟内存与缺页处理。
- **Bovet & Cesati《Understanding the Linux Kernel》**：第 9 章 `copy_page_range`、`do_wp_page`、反向映射与页引用计数。
- **Love《Linux Kernel Development》**：进程创建、`copy_process` 与 COW 标记的实现。
- **Tanenbaum《Modern Operating Systems》**：进程创建与地址空间管理章节。
- **Arpaci-Dusseau《Operating Systems: Three Easy Pieces》**：进程 API 与地址空间，以及 `man 2 fork`/`man 2 vfork` 的语义（以官方最新手册为准）。

## 八、面试题

**Q1：fork 后父子同时写一个全局变量会互相影响吗？**
要点：不会，写触发 COW 各自拿到独立副本；子进程改完后父进程仍看到旧值。

**Q2：为什么 fork+exec 高效？**
要点：exec 丢弃整个地址空间，fork 阶段只需复制页表，数据零复制，避免了一次完全无用的全量拷贝。

**Q3：COW 的成本体现在哪里？**
要点：页表复制的 $O(A)$ 开销与每次首写的缺页加复制；不 exec 且大量写时总成本接近 eager copy。

**Q4：`refcount == 1` 时为什么还要走缺页？**
要点：PTE 仍是只读，必须先经缺页处理打开写权限；但此时无需复制物理页。

**Q5：`vfork` 与 `fork` 的本质差别？**
要点：`vfork` 借用父进程地址空间且不复制页表，要求子进程立即 exec 或 `_exit`；`fork` 靠 COW 兼顾语义与性能，更安全。

## 九、演进与趋势

- **`clone` 与命名空间**：通过标志位精细控制页表、文件表、信号处理的共享范围，是线程与容器的基础。
- **`posix_spawn`**：用 `CLONE_VM | CLONE_VFORK` 组合在库层面完成「创建并 exec」，避开中间写入。
- **userfaultfd**：把缺页处理搬到用户态，可在此实现自定义 COW（检查点、迁移时的页去重）。
- **透明大页下的 COW**：需先拆分大页再复制单页，否则一次写会复制 2 MiB 而非 4 KiB。
- **安全维度**：`MADV_WIPEONFORK`、fork 后零化敏感页，用于防止子进程继承密钥等数据。

## 十、小结

COW 让 fork 同时满足语义（独立地址空间）与性能（延迟复制）：fork 只复制页表并标记共享只读页，真正复制发生在首次写入。它把 Unix「fork + exec」模型变得廉价可行，也让「fork 后内存不翻倍」成为工程常识；理解页表成本、缺页成本与大页退化，才能判断何时改用 `vfork`/`posix_spawn`/`clone`。
