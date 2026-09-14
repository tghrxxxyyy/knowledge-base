# 自旋锁spinlock实现

> 对应 Love《Linux Kernel Development》第 10 章自旋锁；Bryant & O'Hallaron《CSAPP》第 12 章。

## 一、背景与挑战

内核临界区往往极短且不可睡眠（中断上下文、持有自旋锁时抢占被关）。若用互斥锁睡眠，切换代价高且睡眠本身可能死锁。自旋锁让抢锁失败的 CPU 忙等（自旋）而非阻塞，适合「短临界区 + 不能睡眠」场景，但空转浪费 CPU，长临界区下严重低效。在 NUMA 多插槽机器上，自旋还会引发跨插槽缓存一致性流量，进一步放大开销，因此需要更精细的排队锁。

判断「短」的标准不是代码行数，而是「临界区执行时间 vs 一次上下文切换 + 一次睡眠/唤醒的总代价」。后者在典型 Linux 上通常在微秒量级，因此自旋锁的临界区通常以「几十到几百纳秒」为界，一旦可能包含 I/O、分配、遍历大结构，就应改用可睡眠的锁。

## 二、核心原理

基于原子 CAS/Exchange：抢到 `locked==0` 则置 1 进入临界区，否则循环读 `locked` 自旋。x86 用 `LOCK BTS`/`XCHG`（隐含 LOCK）；现代加 `PAUSE` 降低自旋功耗、提示超线程让出执行资源并防止内存序违规引发的活锁。为防止同核重入死锁，内核自旋锁通常关抢占（有时关中断/底半部）。单核上自旋锁常退化为「仅禁抢占」。排队自旋锁（qspinlock/MCS）让每个等待者自旋在自己的本地节点上，避免所有等待者自旋同一缓存行造成的「缓存行颠簸（cache line bouncing）」。

朴素自旋锁还有一个隐蔽问题：连续 `test_and_set` 会在共享缓存行上产生持续的独占请求，导致持有者刷新该行的延迟被拉长（把「写者饥饿」变成「持有者受害」）。因此工程实现几乎都是「先普通读自旋探测，再原子抢」的两段式，把总线/一致性流量降下来。

此外，自旋锁的获取与释放必须成对携带内存序：获取用 acquire 语义（后续访问不得上移），释放用 release 语义（先前访问不得下移）。缺少 release 会让临界区内写入对下一个持有者不可见，缺少 acquire 会让临界区外读取被提前，二者都是难以复现的静默错误。

## 三、形式化与数学基础

获取条件：

$$acquire \iff CAS(locked,0,1)=true$$

临界区长度 $L$ 与自旋开销权衡：总等待时间约 $N_{contend}\cdot L$。适用准则：

$$L_{crit}\ll context\_switch\_cost$$

否则应改睡眠锁（mutex/futex）。即自旋只在「临界区远短于一次上下文切换」时划算。MCS 锁把「全局自旋」改为「本地节点自旋」：每个 CPU 自旋在 `next` 指针域，释放者把 `next` 置为下一等待者，从而把缓存行写流量从「广播」降为「点对点」。

若把一致性流量也计入成本，可建模为：

$$C_{spin} \approx t_{acquire}\cdot N + t_{bounce}\cdot N^{2}$$

其中第二项来自 $N$ 个等待者在同一缓存行上的竞争；MCS/ticket 类结构通过让每个等待者使用独立缓存行，把 $N^2$ 项削为 $O(N)$，这正是排队锁在核数增长时收益放大的原因。

## 四、代码实现

```c
// 简化自旋锁（x86，带 PAUSE）
static inline void spin_lock(int *v) {
    for (;;) {
        // 先测再 CAS，减少不必要的总线锁
        if (__atomic_test_and_set(v, __ATOMIC_ACQUIRE) == 0)
            return;                       // 抢到
        while (__atomic_load_n(v, __ATOMIC_RELAXED))
            asm volatile("pause");        // 自旋提示
    }
}
static inline void spin_unlock(int *v) {
    __atomic_clear(v, __ATOMIC_RELEASE);
}
```

更公平的 ticket 锁：`lock` 取一个递增 ticket，释放者把 `now_serving++`，等待者自旋在自己 ticket 是否等于 `now_serving`，保证 FIFO。

```c
// ticket 锁：FIFO 公平，等待者自旋在自己的位置量上
void ticket_lock(ticket_t *t) {
    unsigned me = __atomic_fetch_add(&t->next, 1, __ATOMIC_RELAXED);
    while (__atomic_load_n(&t->now_serving, __ATOMIC_ACQUIRE) != me)
        asm volatile("pause");            // 等待轮到自己
}
void ticket_unlock(ticket_t *t) {
    __atomic_fetch_add(&t->now_serving, 1, __ATOMIC_RELEASE);
}
```

ticket 锁的代价是「所有等待者仍读同一 `now_serving` 缓存行」，属读共享、写稀有，流量远低于测试-设置锁；而 MCS 让每个等待者只读自己节点，进一步消除读争用。

## 五、与其他技术对比

| 锁 | 等待方式 | 可否睡眠 | 适用 |
| --- | --- | --- | --- |
| 自旋锁 | 忙等 | 否（不可睡） | 短临界区、中断上下文 |
| 互斥锁（futex） | 睡眠 | 是 | 长临界区、用户态 |
| RCU | 读者无锁 | 否（读者） | 读多写少 |
| ticket 锁 | 忙等（FIFO） | 否 | 需公平性的短临界区 |
| MCS/qspinlock | 忙等（本地自旋） | 否 | 高核数竞争 |

自旋锁忙等、不睡眠、适短临界区；单核下退化为禁抢占。相较 RCU，自旋锁写者互斥。

## 六、常见误区

1. 误以为自旋锁一定快——长临界区下严重空转、拖累整核。
2. 误以为用户态可随意自旋——可能饿死其他线程，应改用 futex。
3. 误以为自旋锁内可睡眠——睡眠会让同核其他抢锁者死锁，故自旋锁内严禁调度。
4. 误以为普通自旋锁公平——朴素自旋锁不保证 FIFO，可能出现饥饿（MCS/ticket 才解决）。
5. 误以为自旋锁不需要内存屏障——缺 acquire/release 会让临界区数据对下一持有者不可见。
6. 误以为关抢占是性能优化——它是正确性要求，防止同核重入死锁，代价是调度推迟。

## 七、与开源书·权威来源对应

- Love《Linux Kernel Development》第 10 章讲 spinlock、关抢占与底半部（bottom half）交互。
- CSAPP 12.x 讲锁的原子实现与 `test_and_set`。
- Intel SDM 讲 `PAUSE` 在自旋中的功耗与正确性作用。
- Mellor-Crummey & Scott 1991 的 MCS 锁论文是排队锁的经典来源，qspinlock 则是其在内核中的工程化变体。

## 八、面试题

1. 为什么中断上下文只能用自旋锁？答：中断上下文不能睡眠，互斥锁阻塞会死锁；自旋锁忙等且常关中断避免重入。
2. `PAUSE` 作用？答：降低自旋功耗、提示超线程让出资源、防内存序违规导致活锁。
3. 单核上自旋锁如何工作？答：退化为仅关抢占（或关中断），防止同核其他路径重入临界区。
4. MCS/qspinlock 解决什么？答：把「全等待者自旋同一缓存行」改为「各自自旋本地节点」，减少缓存行颠簸与广播流量。
5. 为什么要在 CAS 外再套一层普通读自旋？答：避免持续发送独占请求，既降低一致性流量，也减少对持有者缓存行的干扰。
6. ticket 锁与 MCS 锁的差异？答：ticket 公平但等待者读同一变量（读共享）；MCS 每个等待者只在自己节点自旋，扩展性更好但需维护队列指针。

## 九、演进与趋势

qspinlock（排队自旋锁）减少 cache line 抖动，保证 FIFO 公平；MCS 锁使自旋本地化（每人自旋自己节点）降低广播；NUMA 感知锁（如 `pvqspinlock`）在虚拟化下降低饥饿。硬件也提供「带优先级的原子操作」缓解锁持有者被抢占导致的长尾。

在虚拟化与高核数场景下，「锁持有者被 vCPU 抢占」会造成经典的「锁护送（lock holder preemption）」长尾，因此出现了「暂停自旋（pause-loop exiting）」与半虚拟化让出（yield to hypervisor）等机制。用户态侧则演化出 futex 自适应自旋（adaptive spinning）与序列锁，把「短等待自旋、长等待睡眠」做成自适应策略。

## 十、小结

自旋锁用原子 CAS + 忙等保护短且不可睡的临界区，是内核并发最基础工具。其正确用法核心是「临界区足够短」，而公平性由排队锁变体保障。内存序（acquire/release）与关抢占不是可选优化而是正确性前提；具体实现细节请以目标内核版本与架构文档为准。
