# 读写锁与RCU

> 对应 Love《Linux Kernel Development》第 10 章 RCU；Bryant & O'Hallaron《CSAPP》第 12 章。

## 一、背景与挑战

很多数据结构读多写少（路由表、配置、链表）。普通互斥让读也串行，吞吐受限。读写锁（rwlock）允许多读并发、写独占；RCU（Read-Copy-Update）进一步让读者零同步、写者延迟回收，在读多写少场景把读者开销降到近零，是 Linux 内核大量子系统的支柱。难点在于：RCU 要求读者「在宽限期内不睡眠、不离开 CPU 太久」，否则宽限期无法结束、写者永久等待。

rwlock 自身也有两个经典难题：一是「写者饥饿」——持续不断的读者可能让写者长期拿不到锁；二是「读侧仍有原子开销」——每次读仍要递增/递减共享计数，高核数下这个计数器就是竞争热点。RCU 正是为消除第二点而生，而第一点则由「写者优先」或排队实现缓解。

## 二、核心原理

rwlock：多个读者同时持读锁并发，写者需独占且无读者。`rcu_read_lock()` 仅禁止抢占（读者无锁、零原子操作）读指针；写者复制旧对象、改副本、用 `rcu_assign_pointer` 原子切换全局指针，旧版本等所有读者退出「宽限期（grace period）」后回收。读者解引用稳定指针，无需原子、无需屏障（架构保证指针读原子），故读吞吐近似无锁。宽限期由「静止状态（quiescent state，如上下文切换、idle）」判定：当每个 CPU 都经历过一次静止状态，说明所有在 `rcu_read_lock` 前的读者都已退出。

核心直觉是「把同步成本从读者转移到写者」：读者只需保证自己不被打断太久，写者则承担复制、发布、等待与回收。写越稀少，摊到每次写上的等待成本越可接受，这是 RCU 收益模型的全部基础。

还有一条常被忽略的规则：读者必须在同一个 `rcu_read_lock/unlock` 区间内完成所有解引用与使用，不能把指针带出区间后再使用；否则对象可能在区间外被回收，产生 UAF。这条规则是 RCU 正确性的「使用契约」。

## 三、形式化与数学基础

rwlock 并发约束：

$$readers\ge 0,\quad writer\Rightarrow readers=0$$

RCU 宽限期：$GP$ 结束当且仅当所有在 `rcu_read_lock` 之前的读者已完成：

$$reclaim(old)\iff \forall r\in readers_{before\ GP}:\ r\ done$$

读者无原子操作，故读吞吐 $\approx$ 无锁；写者付出复制 + 等待宽限期的代价。若记读者数 $R$、写者复制成本 $C_{copy}$、宽限期等待 $T_{gp}$，则写者总时间 $\approx C_{copy}+T_{gp}$，与 $R$ 无关——这正是 RCU 读侧可扩展的关键。

宽限期的上界与「最长读者临界区」直接相关：

$$T_{gp} \le \max_{r\in readers} dur(r) + \epsilon$$

因此一旦有读者长时间不退出（如在其中睡眠），上界被破坏、写者被无限延迟。这也解释了为何「可睡眠 RCU（SRCU）」需要额外的显式追踪机制——它必须能检测「睡眠中的读者是否已退出」，而不能只靠 CPU 静止状态。

## 四、代码实现

```c
struct route { int dst; struct route *next; };
struct route __rcu *g_route;
// 写者：复制-修改-发布-等宽限期-回收
void update(int new_dst) {
    struct route *old = rcu_dereference(g_route);
    struct route *new = kmalloc(sizeof(*new));
    *new = *old; new->dst = new_dst;
    rcu_assign_pointer(g_route, new);   // 原子指针切换
    synchronize_rcc();                  // 等宽限期：旧读者都退出
    kfree(old);                         // 安全回收
}
// 读者：无锁
void reader(void) {
    rcu_read_lock();
    struct route *r = rcu_dereference(g_route);
    use(r->dst);
    rcu_read_unlock();
}
```

```c
// 链表删除：先摘除（发布），再等宽限期，最后回收
void remove_node(int dst) {
    struct route *prev = NULL, *cur = rcu_dereference(g_route);
    while (cur && cur->dst != dst) { prev = cur; cur = cur->next; }
    if (!cur) return;
    if (prev) rcu_assign_pointer(prev->next, cur->next);  // 先让新读者看不到
    else      rcu_assign_pointer(g_route, cur->next);
    synchronize_rcu();          // 等所有「可能持有 cur」的读者退出
    kfree(cur);                 // 此时回收才安全，避免 UAF
}
```

注意 `rcu_assign_pointer` 与 `rcu_dereference` 成对使用是「发布-订阅」语义的关键，它们携带必要的屏障，缺一会在弱内存序架构（如 ARM）上产生可见性问题。

## 五、与其他技术对比

| 原语 | 读者开销 | 写者代价 | 适用 |
| --- | --- | --- | --- |
| rwlock | 原子/自旋 | 独占 | 读写都频繁 |
| RCU | 近零（无锁） | 复制+等宽限期 | 读多写少 |
| seqlock | 重试 | 独占 | 读极多写极少 |
| SRCU | 近零（可睡眠） | 复制+重追踪 | 读者可能睡眠 |

RCU 读者零开销但写者复制+延迟回收；rwlock 简单但写者饿读、读自旋。相较 seqlock，RCU 不需读者重试。用户态 urcu 库提供类似能力。

## 六、常见误区

1. 误以为 RCU 读者无代价意味着写快——写需复制与等待宽限期，开销不低。
2. 误以为可立刻释放旧版——必须过 GP，否则读者可能解引用已释放内存（UAF）。
3. 误以为 RCU 替代所有锁——只适合读多写少、数据可延迟回收、读者不睡眠过久的场景。
4. 误以为读者内可任意停留——读者若长时间不退出（如睡眠），宽限期无法结束，写者永久阻塞。
5. 误以为可以把指针带出读侧临界区——一旦离开 `rcu_read_lock/unlock` 区间，对象随时可能被回收。
6. 误以为 rwlock 天然公平——多数实现写者可能饥饿，需「写者优先」或排队变体。

## 七、与开源书·权威来源对应

- Love《Linux Kernel Development》第 10 章讲 RCU、rculist 与宽限期。
- OSTEP 同步章以 RCU 讲解「读侧无锁 + 写侧延迟回收」。
- McKenney 的 RCU 论文/文档是 Linux RCU 实现的权威来源。
- Herlihy & Shavit 关于并发对象可线性化与读者-写者语义的讨论，可为 rwlock/RCU 的语义边界提供形式化参照。

## 八、面试题

1. RCU 读者为何不用锁？答：读者仅解引用稳定指针（指针读原子），写切换指针后旧版延迟回收，故读者零同步。
2. 宽限期（grace period）含义？答：所有在宽限期开始前进入的读者都退出的时间点，之后旧对象可安全释放。
3. 为什么 RCU 不适合写多场景？答：每次写都复制+等宽限期，写密集时复制与等待开销远超锁。
4. 链表删除如何用 RCU 防 UAF？答：摘除节点后 `synchronize_rcu()` 确认无读者再 `kfree`。
5. rwlock 与 RCU 的成本结构差异？答：rwlock 把成本放在读者（原子计数）；RCU 把成本放在写者（复制与等待），因此适用负载恰好互补。
6. 什么情况下必须用 SRCU？答：当读侧临界区可能睡眠（如需要拿其他锁或做阻塞 I/O）时，普通 RCU 的「不睡眠」契约会被破坏。

## 九、演进与趋势

RCU 多 flavor（sched/bh/task）适配不同上下文；树形宽限期（tree RCU）扩展至多核降低开销；用户态 urcu 成熟，使 RCU 思想走出内核进入高性能用户程序。还出现「可睡眠 RCU（SRCU）」允许读者睡眠，代价是更重的宽限期追踪。

工程上，RCU 的形态还在细化：为降低宽限期检测开销，出现了按 CPU 分层的树形结构与「快速宽限期」路径；为便于正确性验证，出现了形式化建模与自动化测试工具（针对 RCU 使用契约的检查）。这些手段的共同目标是「让读侧继续保持近零成本，同时把写侧等待压到可预测范围」。

## 十、小结

读写锁与 RCU 针对读多写少优化，RCU 以「复制 + 延迟回收」把读者开销降到近零，是读多写少场景的性能利器，但写代价与回收时机需谨慎处理。正确使用 RCU 的关键在于遵守「读者不睡眠、指针不带出临界区、写者必须等宽限期」这三条契约，缺一都会从性能优化退化为正确性缺陷。
