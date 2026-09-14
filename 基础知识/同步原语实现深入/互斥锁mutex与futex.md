# 互斥锁mutex与futex

> 对应 Bryant & O'Hallaron《CSAPP》第 12 章；Kerrisk《The Linux Programming Interface》第 30、31 章。

## 一、背景与挑战

用户态线程既要互斥又要避免忙等。纯自旋浪费 CPU，纯内核锁每次操作都陷入昂贵。futex（fast userspace mutex，快速用户态互斥）把「无冲突走用户态、有冲突才陷入内核」结合，是 `pthread_mutex` 的基石。其精髓是：快路径零系统调用，慢路径才睡眠。

真正困难的部分在「丢失唤醒」与「惊群」两处：若解锁者先把状态改回 0、再唤醒等待者，中间窗口内新来的线程可能抢先拿锁，使被唤醒者重新睡下——看似无害却会造成不必要的系统调用与延迟；若唤醒时唤醒全部等待者，则大量线程争抢一把锁，产生惊群。正确实现必须让「改状态」与「决定是否唤醒」在同一个原子决策内完成。

## 二、核心原理

futex 是一个整数（与内核维护的等待队列关联）位于用户态。无冲突时 `mutex.lock` 用原子 CAS 直接改用户态值（0→1），零陷入；争用时 CAS 失败，调用 `FUTEX_WAIT` 陷入内核、把线程挂到该 futex 的等待队列睡眠；释放者把值改回并把等待者 `FUTEX_WAKE` 唤醒。从而「快路径免系统调用、慢路径睡眠不空转」，兼得性能与 CPU 效率。

关键语义细节：`FUTEX_WAIT` 会先在**内核态校验**用户态值是否仍等于期望值（上例为 1），若已被他人改动则立刻返回 `EAGAIN` 而不睡眠——这一「值校验 + 入队」是原子的，正是它消除了丢失唤醒。同理，解锁者若发现「无人等待」可完全跳过 `FUTEX_WAKE`（该调用本身也要陷入），这是 glibc 优化 fast path 的关键。

## 三、形式化与数学基础

快路径（无冲突）：

$$CAS(state,0,1)=true\implies 进入,\ 无\ syscall$$

慢路径：$CAS$ 失败 $\implies FUTEX\_WAIT(state,1)$ 睡眠，唤醒后重试。期望快路径成本 $\approx$ 一条原子指令，慢路径成本 $\approx$ 一次上下文切换。设冲突率 $c$，平均成本 $\approx (1-c)\cdot t_{atomic}+c\cdot t_{switch}$，无冲突时接近零系统调用。

| 状态 | 含义 | 是否陷内核 |
| --- | --- | --- |
| 0 | 未加锁 | 否 |
| 1 | 已加锁、无等待者 | 否（解锁时无需 wake） |
| 2 | 已加锁、有等待者 | 是（解锁需 wake） |

三态编码（glibc 采用）让解锁者能区分「有无等待者」，仅在状态为 2 时才调用 `FUTEX_WAKE`，进一步减少系统调用。

## 四、代码实现

```c
// glibc pthread_mutex 简化：无冲突用户态 CAS，有冲突陷入
int mutex_lock(mutex_t *m) {
    int zero = 0, one = 1;
    if (__atomic_compare_exchange(&m->state, &zero, &one, 0,
                                  __ATOMIC_ACQUIRE, __ATOMIC_RELAXED))
        return 0;                       // 快路径：用户态拿到锁
    // 慢路径：futex_wait
    return syscall(SYS_futex, &m->state, FUTEX_WAIT, 1, NULL, NULL, 0);
}
void mutex_unlock(mutex_t *m) {
    m->state = 0;
    syscall(SYS_futex, &m->state, FUTEX_WAKE, 1, NULL, NULL, 0);  // 唤醒一个
}
```

```c
// 三态版本：无等待者时解锁不陷入内核
int mutex_unlock_opt(mutex_t *m) {
    if (__atomic_exchange_n(&m->state, 0, __ATOMIC_RELEASE) == 1)
        return;                          // 状态 1：无人等待，直接返回
    syscall(SYS_futex, &m->state, FUTEX_WAKE, 1, NULL, NULL, 0);  // 状态 2：唤醒
}
```

## 五、与其他技术对比

| 原语 | 快路径 | 慢路径 | 可否睡眠 | 适用 |
| --- | --- | --- | --- | --- |
| futex/mutex | 用户态 CAS | 内核睡眠 | 是 | 通用用户态互斥 |
| 自旋锁 | 忙等 | 忙等 | 否 | 内核/短临界 |
| 信号量 | 用户态 CAS | 内核睡眠 | 是 | 计数/限流 |
| 读写锁 | 原子读计数 | 内核睡眠 | 是 | 读多写少 |

futex 快路径零陷入、慢路径睡眠；用户态 mutex 不可用于中断上下文。相较 Windows SRWLOCK 语义相近。

| futex 操作 | 用途 |
| --- | --- |
| `FUTEX_WAIT` | 睡眠直到值变化或被唤醒 |
| `FUTEX_WAKE` | 唤醒 1 个或全部等待者 |
| `FUTEX_LOCK_PI` | 优先级继承，防优先级反转 |
| `FUTEX_WAIT_BITSET` | 按位集唤醒，支持多路复用 |

## 六、常见误区

1. 误以为 mutex 总是睡眠——无冲突走用户态 CAS，不陷入内核。
2. 误以为 futex 是锁——它只是「等待/唤醒」原语，锁语义（谁持锁、递归否）在用户态实现。
3. 误以为默认递归加锁安全——默认 `PTHREAD_MUTEX_DEFAULT` 非递归，重入会死锁（或可配置为报错）。
4. 误以为 `FUTEX_WAIT` 一定睡到被唤醒——若值已不等于期望值，内核立即返回 `EAGAIN`，这是防丢失唤醒的关键。
5. 误以为解锁必须调用 `FUTEX_WAKE`——无等待者时跳过可省一次系统调用，三态编码即为此设计。
6. 误以为 futex 可跨进程随意使用——跨进程需共享内存映射且不用 `FUTEX_PRIVATE_FLAG`。

## 七、与开源书·权威来源对应

- CSAPP 12.5 线程与锁、互斥实现。
- Kerrisk 第 30/31 章 `pthread_mutex` 与 futex 系统调用语义。
- OSTEP 锁章讲「用户态 CAS + 内核等待」的两阶段锁。
- Drepper「Futexes Are Tricky」详解三态编码与丢失唤醒的规避。

## 八、面试题

1. 无冲突时 `pthread_mutex` 会陷入内核吗？答：不会，CAS 成功走用户态，零系统调用。
2. futex 为何快？答：快路径只是原子指令、无上下文切换；仅真正争用才陷入内核睡眠。
3. `FUTEX_WAKE` 唤醒谁？答：唤醒等待在该 futex 地址上的一个或多个线程（取决于 flag）。
4. futex 如何避免丢失唤醒？答：内核在原子地校验「值仍等于期望值」后才入队睡眠，已被改动则立即返回。
5. 三态编码为何能省系统调用？答：状态 2 才表示有等待者，解锁时先原子交换，只有状态 2 才需要 `FUTEX_WAKE`。
6. `PTHREAD_MUTEX_DEFAULT` 重入会怎样？答：非递归语义下重入属未定义行为，常见表现是自死锁。

## 九、演进与趋势

`FUTEX_PRIVATE` 标志优化同进程锁（跳过跨进程查找）；`FUTEX_WAIT_BITSET` 支持按位集优先级唤醒；robust mutex 处理持有者崩溃（标记锁为可恢复）；`FUTEX_LOCK_PI` 提供优先级继承防优先级反转。

用户态化的新趋势也在推进：Linux 的 `futex2` 重新设计了接口，引入 `futex_waitv`（一次等待多个 futex，适配「同地址多条件」场景）与更清晰的超时语义；语言运行时则把 futex 封装为更安全的原语（Rust `park/unpark`、Go runtime 的 semaphore、C++20 `atomic::wait`），让应用层无需直接触碰系统调用即可获得「零陷入快路径 + 睡眠慢路径」的性质。

## 十、小结

futex 以「用户态 CAS + 内核等待」兼得快路径与无忙等，是现代线程互斥的底层机制。理解「无冲突不陷入」是认识其高性能的关键。落地时记住三点：快路径依赖 ACQUIRE 语义、慢路径依赖内核「校验后入队」的原子性、解锁路径依赖三态编码判定是否需要唤醒——三者缺一即可能退化为「每次都陷入」或「丢失唤醒」。
