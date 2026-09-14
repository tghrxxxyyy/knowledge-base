# Intel TSX指令集

> 对应 Intel SDM Vol.3「Transactional Synchronization Extensions」章节；Bryant & O'Hallaron《Computer Systems: A Programmer's Perspective》第12章；Herlihy & Shavit《The Art of Multiprocessor Programming》。

## 一、背景与挑战

互斥锁把临界区串行化，硬件难以在锁层面并行。Intel 自 Haswell 起在部分微架构引入 TSX（Transactional Synchronization Extensions），把「乐观并发」下沉到指令集：无冲突时多个线程可同时穿过同一临界区，冲突时回退重放。TSX 提供两条互补路径——RTM（Restricted Transactional Memory，显式事务指令）与 HLE（Hardware Lock Elision，对既有锁指令的消隐前缀）。挑战在于：事务随时可能因容量、冲突、特权事件中止，必须提供正确的串行回退路径；且 TSX 仅存在于部分型号，多代 CPU 默认关闭，使用前必须先做 `CPUID` 探测。

## 二、核心原理

RTM 以 `XBEGIN` 显式开启事务并携带失败回退地址，`XEND` 提交，`XABORT` 主动中止。硬件在事务内把读集记录在 L1 的读集追踪结构中，把写集以缓存行方式暂存于 L1，提交时原子生效，中止时整体丢弃。RTM 支持一层「闭嵌套」：内层事务失败回退到外层事务起点而非最外层，仅最外层 `XEND` 才真正提交。HLE 用 `XACQUIRE`/`XRELEASE` 前缀包住原有 `lock` 指令：若事务提交，锁变量从未被真正写入（消隐）；若中止，硬件按键值语义真正获取锁并继续执行，互斥不变量得以保持。导致中止的事件包括：写集超出 L1 缓存容量、与另一事务的读集/写集缓存行重叠、页错误与 TLB 缺失、中断与信号、`SYSENTER`/`SYSCALL`、`CPUID`、以及部分 MSR 访问。

## 三、形式化与数学基础

设事务读写集规模受缓存容量 $C$ 限制，事务 $T$ 的中止条件可写作：

$$ Abort(T) \iff |R_T| + |W_T| > C \;\lor\; conflict(T) \;\lor\; priv(T) $$

其中 $priv(T)$ 表示出现特权或不可事务化事件。嵌套深度 $d$ 满足 $d \le 1$（一代闭嵌套），更深嵌套被视为容量或特性中止。对 HLE，记锁 $L$ 状态 $S_L \in \{free, held\}$，两条路径都维持互斥不变量：

$$ commit \Rightarrow S_L = free, \qquad abort \Rightarrow S_L = held \text{（硬件真正获取）} $$

中止时硬件把架构状态回滚到 `XBEGIN` 快照，除 EAX 承载中止状态位图外，通用寄存器均恢复原值。经典的不可用性论证指出：纯事务内存若不提供任何非事务性回退原语，则无法实现通用的不可阻塞同步，因此 RTM 必须与真实锁共存。

## 四、代码实现

```c
/* RTM 版本：乐观执行 + 串行回退，保证前进性 */
static inline unsigned xbegin(void);   /* 真实实现见 immintrin.h 的 _xbegin */
#define _XBEGIN_STARTED (~0u)

void inc_shared(volatile long *shared, volatile int *lock) {
    unsigned st = xbegin();
    if (st == _XBEGIN_STARTED) {
        long v = *shared;               /* 读集 */
        *shared = v + 1;                /* 写集 */
        xend();                         /* 提交，原子生效 */
        return;
    }
    /* fallback：显式加锁，避免中止后活锁 */
    while (__atomic_exchange_n(lock, 1, __ATOMIC_ACQUIRE))
        _mm_pause();                    /* 减少总线争用与功耗 */
    *shared = *shared + 1;
    __atomic_store_n(lock, 0, __ATOMIC_RELEASE);
}
```

HLE 版本只在原临界区两端加上 `xacquire lock ...` 与 `xrelease lock ...`：不支持 TSX 的 CPU 把前缀当作 NOP，同一份二进制仍按普通锁正确执行，这正是 HLE 的向后兼容价值。工程上还可按 EAX 中止原因做退避：冲突类中止宜指数回退以避免反复对撞，容量类中止则应直接走锁路径，因为重试无法让写集变小。调试可用 `RTM_DEBUG` 观察中止原因，但生产代码不应依赖。

## 五、与其他技术对比

| 维度 | RTM | HLE | 细粒度互斥锁 | 无锁 CAS |
| --- | --- | --- | --- | --- |
| 编程方式 | 显式 XBEGIN/XEND | 原锁指令加前缀 | 显式锁 API | CAS 循环 |
| 回退控制 | 自行提供 slowpath | 硬件按键语义回退 | 阻塞等待 | ABA 需额外机制 |
| 兼容性 | 需 CPUID 分支 | 旧 CPU 退化为普通锁 | 全平台 | 全平台 |
| 容量限制 | 有（缓存写集） | 有 | 无 | 无 |
| 中止可见性 | EAX 返回原因位图 | 不可见 | 可见 | 可见 |
| 典型收益 | 锁竞争激烈时吞吐提升 | 遗留代码零改写加速 | 基线 | 高竞争下扩展性好 |

## 六、常见误区

1. 认为事务成功是常态：容量溢出与无关冲突都会中止，缺少 slowpath 会导致死循环或活锁。
2. 认为 HLE 等于无锁：消隐失败时仍真实持锁，临界区内不可放不可事务化操作（I/O、系统调用）。
3. 在事务内调用系统调用：`SYSCALL`/`SYSENTER` 等特权事件强制中止，必须移出事务。
4. 默认所有 Intel CPU 都支持 TSX：受 MSR `IA32_TSX_CTRL` 与微码约束，多款型号已禁用 RTM/HLE。
5. 依赖深层嵌套：硬件只支持有限层级，深层嵌套被当作容量或特性中止处理。
6. 对所有中止一视同仁地重试：容量类中止重试无益，应按原因位图区分策略。

## 七、与开源书·权威来源对应

- Intel SDM Vol.3「Transactional Synchronization Extensions」给出 `XBEGIN`/`XEND`/`XABORT` 的精确语义与 EAX 中止原因位图。
- Intel《TSX Best Practices》白皮书讨论回退策略、容量调优与嵌套规则。
- Bryant & O'Hallaron《CSAPP》第12章把 TSX 作为乐观并发的硬件实例，对照 pthread 互斥锁。
- Herlihy & Shavit《The Art of Multiprocessor Programming》提供 HTM 在事务内存谱系中的理论定位与不可阻塞性论证。
- 具体型号是否启用，以 Intel 官方勘误文档与最新 SDM 为准。

## 八、面试题

1. TSX 为何必须有回退路径？——事务随时可能因容量、冲突或特权事件中止，回退路径保证前进性与正确性。
2. HLE 如何做到二进制兼容旧 CPU？——前缀在旧 CPU 上被忽略，退化为普通 `lock`，语义不变。
3. 事务内为何不能调用系统调用？——切换地址空间与特权态破坏事务隔离，硬件只能中止。
4. 中止后寄存器恢复到什么状态？——恢复到 `XBEGIN` 快照，EAX 返回中止原因，其余通用寄存器回滚。
5. 闭嵌套下内层中止会发生什么？——回退到外层事务起点，仅最外层 `XEND` 才真正提交。

## 九、演进与趋势

受多起与 TSX 相关的勘误及侧信道问题影响，Intel 在后续多款型号通过微码与 `IA32_TSX_CTRL` 关闭 RTM/HLE，并引入 `RTM_ALWAYS_ABORT` 一类标志彻底停用。工业界因此把 HTM 视为机会性加速而非可依赖基石，更倾向可移植的 STM 或成熟无锁算法。ARM 以 TME（Transactional Memory Extension）探索同方向，具体支持情况以厂商最新文档为准。

另一条演进线索是把事务语义上移到语言与运行时：C++ 的事务内存提案与各语言的软件事务库，试图在不绑定具体微架构的前提下提供乐观并发原语。

它们同样面对「容量受限、必须回退」的现实约束，与 RTM 的工程取舍高度同构：收益来自低冲突场景，而正确性永远依赖非事务性的回退路径。

## 十、小结

TSX 用 RTM 的显式事务与 HLE 的锁消隐把乐观并发引入 x86，在锁竞争激烈时提升吞吐，并可用零改写方式加速遗留代码。但「中止必然发生、回退不可或缺」是其工程前提，加之广泛的微码禁用，HTM 更适合作为优化层，而非正确性依赖。
