# 内存映射与mmap机制

> 对应 Arpaci-Dusseau《OSTEP》第 22 章（虚拟内存作为缓存与内存映射）、Bryant & O'Hallaron《Computer Systems: A Programmer's Perspective》第 9.8 节内存映射、Silberschatz《Operating System Concepts》虚拟内存章，以及 man 2 mmap 的接口定义。

## 一、背景与挑战
文件 I/O 若经 `read`/`write`，数据要在内核页缓存与用户缓冲区之间复制，大文件与随机访问场景下拷贝开销与系统调用次数都很可观。`mmap` 把文件的一个区间直接映射进进程地址空间，把「读文件」变成「访问内存」：首次访问触发缺页并由内核建立映射，之后不再有显式拷贝也不需要系统调用。它同时解决共享问题——多个进程映射同一区间时共享同一份物理页。

## 二、核心原理
映射建立：`mmap` 为该进程创建一个新的 VMA，记录起始地址、长度、保护位、映射类型与后端对象（文件与偏移，或匿名）。此刻物理页尚未分配。

按需分页：首次访问映射区间触发缺页，内核定位到对应文件偏移，在页缓存中查找或读入该页，然后把页表项指向该物理页。因此「映射建立」与「内存实际驻留」是两件事。

共享与私有：
- `MAP_SHARED`：页表项直接指向页缓存中的物理页，多进程映射同一区间共享同一物理页；写入反映到页缓存，最终由内核回写磁盘。
- `MAP_PRIVATE`：写时复制（COW）。读时仍共享页缓存页并标记只读；一旦写入触发写保护缺页，内核复制一份私有页并让页表项指向副本，原文件内容不受影响。

匿名映射：`MAP_ANONYMOUS` 不对应文件，页初始为零页，写入时分配真实页，是堆扩展与大块分配（`malloc` 对较大请求）的常见后端。

解除与同步：`munmap` 解除映射并释放 VMA，`msync` 把脏页同步回文件。映射的脏页是否与文件一致，是工程上最易出错之处。

两个关键边界行为：
- 映射长度按页向上取整，映射尾部可能包含文件之外的字节。
- 映射后文件被截断，被截断部分的页失效，访问触发 SIGBUS（而非 SIGSEGV），这是最典型的崩溃来源。

## 三、形式化与数学基础
映射关系与页粒度对应：

$$VA \in [base,\ base + len) \longmapsto \mathrm{file}[offset,\ offset + len)$$

$$VA_k = base + kP \longmapsto PFN_k = \mathrm{lookup\_or\_read}(\mathrm{file},\ offset + kP)$$

写时复制的触发条件与结果：页表项标记私有且只读，写入时产生写保护缺页，内核执行

$$\mathrm{PTE}_{new} = \mathrm{copy}(\mathrm{PTE}_{old}),\qquad \mathrm{writable}(\mathrm{PTE}_{new}) = 1$$

拷贝成本恰为一页，故 `MAP_PRIVATE` 的首写开销为 $O(P)$，之后无额外开销。

顺序遍历的缺页次数（$n$ 页区间中已驻留 $m$ 页）：

$$N_{fault} \approx \left\lceil \frac{len}{P} \right\rceil - m$$

共享带来的物理内存节省（$g$ 个进程映射同一区间共 $n$ 页），以及映射尾部的页内浪费：

$$\mathrm{Saving} = 1 - \frac{1}{g},\qquad \mathrm{waste} = \left\lceil \frac{S}{P} \right\rceil P - S$$

前者解释了动态库映射为何能显著降低多进程内存占用——代码页始终共享，只有被写入的数据页才复制。

## 四、代码实现
```c
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>

/* 只读扫描：无 read 循环、无用户缓冲区拷贝 */
static int scan_file(const char *path) {
    int fd = open(path, O_RDONLY);
    if (fd < 0) return -1;

    struct stat st;
    if (fstat(fd, &st) < 0) { close(fd); return -1; }
    if (st.st_size == 0) { close(fd); return 0; }

    size_t len = (size_t)st.st_size;
    char *p = mmap(NULL, len, PROT_READ, MAP_PRIVATE, fd, 0);
    if (p == MAP_FAILED) { close(fd); return -1; }
    close(fd);                       /* 映射建立后即可关闭 fd */

    unsigned long sum = 0;
    for (size_t i = 0; i < len; i++) sum += (unsigned char)p[i];

    if (munmap(p, len) < 0) return -1;
    return (int)(sum & 0x7fffffff);
}

/* 多进程共享：MAP_SHARED + MAP_ANONYMOUS，fork 后父子共享同一物理页 */
static void *open_shared(size_t len) {
    return mmap(NULL, len, PROT_READ | PROT_WRITE,
                MAP_SHARED | MAP_ANONYMOUS, -1, 0);
}
```

## 五、与其他技术对比

| 维度 | 文件 mmap | read/write | 共享内存（shm） | 直接 I/O |
|---|---|---|---|---|
| 数据拷贝次数 | 0（映射后访问页缓存） | 每页至少一次内核到用户拷贝 | 0 | 0（绕过页缓存） |
| 系统调用频率 | 建映射 1 次，之后 0 | 每个数据块 1 次 | 建段与 attach 各一次 | 每次 I/O 1 次 |
| 随机访问友好度 | 好，按页缺页调入 | 差，需 seek 配合 | 好 | 中 |
| 共享能力 | 天然，多进程共享同页 | 无 | 强，需显式 API | 无 |
| 缓存语义 | 依赖页缓存 | 依赖页缓存 | 由实现决定 | 绕过页缓存，需自行管理一致性 |
| 主要风险 | 文件截断致 SIGBUS、地址空间占用 | 拷贝与调用开销 | 同步与生命周期管理 | 对齐与缓存一致性要求高 |

## 六、常见误区
误区一：以为 `MAP_PRIVATE` 的修改会写回文件。私有映射走 COW，改动只在进程内可见，需回写必须用 `MAP_SHARED`。
误区二：忽略文件被截断导致的 SIGBUS。映射按长度建立，文件变小后超出部分的页失效，访问即崩溃。
误区三：忘记 `munmap` 导致地址空间泄漏。长期服务反复映射不解除，最终 `mmap` 失败（ENOMEM）。
误区四：认为 `mmap` 一定比 `read` 快。小文件顺序读取时缺页开销可能与拷贝开销相当；优势在随机访问、大文件与共享场景。

## 七、与开源书·权威来源对应
- Arpaci-Dusseau《OSTEP》第 22 章：虚拟内存作为缓存、按需分页与缺页处理，是理解 mmap 语义的基础。
- Bryant & O'Hallaron《CSAPP》第 9.8 节：内存映射、共享与 COW、映射在动态库加载与进程创建中的作用。
- Silberschatz《Operating System Concepts》：按需分页、写时复制与内存映射文件章节。
- man 2 mmap、man 2 msync、man 2 munmap：标志位语义、对齐要求与错误码，以官方最新文档为准。

## 八、面试题
1. mmap 为什么比 read/write 快？
   要点：省掉内核到用户的数据拷贝，建立映射后按页缺页调入，访问即读页缓存。
2. `MAP_SHARED` 与 `MAP_PRIVATE` 的区别？
   要点：共享映射指向页缓存，写入可见其他进程并可回写文件；私有映射走 COW，改动不回写。
3. SIGBUS 在 mmap 场景下从何而来？
   要点：映射之后文件被截断，或映射超出文件实际长度，对应页不再有效。
4. 映射的动态库为何能共享？
   要点：代码段只读，多进程映射同一区间共享同一物理页，只有被写入的数据页才因 COW 产生副本。

## 九、演进与趋势
`userfaultfd` 把缺页处理的部分控制权交给用户态，使快照、检查点与热迁移可以在不阻塞进程的前提下按页搬运。直接访问（DAX）让持久内存绕过页缓存直接映射，省掉一次内存拷贝，但要求对齐与应用层持久化语义配合。容器与虚拟机场景中，映射机制还承担镜像分层与内存去重的载体角色。相关能力与限制以内核与各平台官方最新文档为准。

## 十、小结
`mmap` 的本质是把文件或匿名内存以页为单位并入进程地址空间，用「缺页时按需建立映射」换取「零拷贝与自然共享」。它带来三项能力：省掉用户态拷贝、支持多进程共享同一物理页、让随机访问变成内存访问；相应也带来三类风险：私有映射不回写、文件截断触发 SIGBUS、地址空间泄漏。理解 COW 与共享的分界是正确使用它的关键。
