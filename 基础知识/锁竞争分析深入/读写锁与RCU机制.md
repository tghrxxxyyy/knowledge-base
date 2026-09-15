# 读写锁与RCU机制

> 对应 Tanenbaum《Modern Operating Systems》同步原语、Bryant & O'Hallaron《CSAPP》第 12 章、Love《Linux Kernel Development》（RCU 章）、McKenney 等 Linux RCU 论文与 `Documentation/RCU/`、Herlihy & Shavit《The Art of Multiprocessor Programming》。

## 一、背景与挑战
读多写少场景中，互斥锁让本可并行的读操作也串行化，浪费了读并行性。读写锁（rwlock）允许多个读者同时进入、写者独占，代价是读者计数需要原子更新（读写两端都产生缓存一致性流量），且写者可能被持续到来的读者**饥饿**。

RCU（Read-Copy-Update）走得更远：读者完全不使用原子指令、不加锁，直接遍历「旧版本」数据；写者先复制出新版本、原子发布指针，等待一个宽限期（grace period）后回收旧结构。这把读路径成本降到常数级与单次指针解引用相当，代价是**延迟回收**与写时复制，以及对读者不能阻塞的严格约束。

## 二、核心原理
**读写锁**维护读者计数 `rcnt`：读者进入时 `rcnt++`、离开时 `rcnt--`；写者必须等 `rcnt == 0` 且独占写权。读者之间不互斥，但写者需等全部读者退出。计数用原子操作维护，因此即使无写者，读者之间也在争用同一缓存行（参见伪共享文档）。写者优先策略可缓解读者饥饿，但会反过来延迟读者。

**RCU** 的三段式写路径：
1. **复制（copy）**：基于旧版本构造新版本，绝不就地修改可能被读者访问的节点；
2. **发布（publish/update）**：用带 release 语义的原子写替换指针；
3. **回收（reclaim）**：等待宽限期结束——即所有在发布**之前**就已开始的读侧临界区都已结束——再释放旧结构。

宽限期保证的正确性论证：任何在发布前开始的读者持有旧指针，因此旧结构不能释放；任何在发布后开始的读者只能看到新指针。二者不会同时访问同一被回收对象。内核用静止状态（quiescent state）来判定读者临界区结束——线程经历一次调度切换、返回用户态或进入 idle 都算静止状态。

## 三、形式化与数学基础
读写锁在「无写者」时读吞吐近似与读者数 $R$ 成正比（但每个读者仍需原子计数，故受同一缓存行串行化）：

$$ T_{rw} \approx R \cdot t_{read} \quad (\text{无写竞争，理想化}) $$

RCU 的成本结构显著不同——读路径与并发度无关，写路径付出宽限期：

$$ C_{read} = O(1) \;\;(\text{单次解引用，无原子指令}),\qquad C_{write} = O(1) + T_{gp} $$

其中 $T_{gp}$ 为宽限期长度，量级从数微秒到数毫秒不等，取决于实现与系统负载（具体数值以官方最新文档与实测为准）。RCU 不保证立即回收，因此旧对象生命周期延至宽限期结束，内存占用上界为：

$$ M_{peak} \le M_{live} \cdot (1 + n_{pending}) $$

即同时处于「已发布但未回收」状态的版本数受并发写者数量约束。

**RCU 的发布语义**可用 happens-before 表达。设写者执行：

$$ \text{init}(x^*) \xrightarrow{\text{release}} head \leftarrow x^* $$

读者执行：

$$ p \leftarrow head \xrightarrow{\text{acquire}} \text{read}(p \to data) $$

release/acquire 配对构成 synchronizes-with，保证读者一旦看到新指针，就必然看到其初始化完成的内容——这是 RCU 不需要额外屏障即可正确发布的关键。

## 四、代码实现
读者无锁遍历、写者复制并原子发布（C11 示意，真实内核用 `rcu_read_lock()` 与 `rcu_dereference()`）：

```c
/* 读者无锁、写者复制更新的单链表（示意实现） */
#include <stdatomic.h>
#include <stdlib.h>

struct Node { int val; struct Node *next; };
_Atomic(struct Node *) head = NULL;

int read_sum(void) {
    int s = 0;
    /* rcu_read_lock()：仅禁止抢占/记录静止状态，不加锁 */
    struct Node *p = atomic_load_explicit(&head, memory_order_acquire);
    while (p) {
        s += p->val;
        p = p->next;
    }
    /* rcu_read_unlock() */
    return s;
}

void publish_front(int v) {
    struct Node *n = malloc(sizeof *n);
    n->val  = v;
    n->next = atomic_load_explicit(&head, memory_order_relaxed);
    atomic_store_explicit(&head, n, memory_order_release);  /* 原子发布 */
    /* 真实 RCU：synchronize_rcu() 等待宽限期后，才可释放被替换的旧节点 */
}
```

内核对应的关键 API 是 `rcu_read_lock()` / `rcu_read_unlock()`（读侧，允许嵌套、不可睡眠）、`rcu_assign_pointer()`（发布）与 `synchronize_rcu()` / `call_rcu()`（等宽限期与延迟回调）；`list_add_rcu`、`hlist_del_rcu` 等宏封装了常见操作的指针写法。

## 五、与其他技术对比
| 机制 | 读开销 | 写开销 | 写者饥饿 | 风险与约束 |
| --- | --- | --- | --- | --- |
| 互斥锁 | 串行 | 串行 | 无 | 读无并行 |
| 读写锁 | 原子计数 | 等读者全部退出 | 可能 | 计数争用、写者饥饿 |
| RCU | $O(1)$ 无原子 | 复制 + 等宽限期 | 无 | 延迟回收、读侧不可睡眠 |
| seqlock | 读重试（可能多次） | 独占 + 版本号递增 | 无 | 读者可能反复重试 |

RCU 读侧最轻且完全无饥饿，但不能在临界区内睡眠/阻塞（否则宽限期无法结束、写者被卡住），也不能做需要强一致快照的读；seqlock 适合短小、极高频读且写很少的数据（如时间戳、统计），读者检测到版本变化即重试；读写锁则是通用折中。

## 六、常见误区
误区一：RCU 写者可以就地修改旧节点。错。读者可能正在遍历旧节点，写者必须复制新版本并原子发布，就地修改会造成撕裂读。

误区二：宽限期未结束就回收。读者可能仍持有旧指针，提前 `free` 会导致 use-after-free；必须等 `synchronize_rcu()` 返回或 `call_rcu()` 回调执行。

误区三：把 RCU 当万能锁替代。RCU 不适合写多场景（每次写都要复制 + 等宽限期），也不提供跨多对象的原子一致视图，且回收时机复杂、调试困难。

误区四：读者临界区可以任意长或睡眠。内核中 RCU 读者不能睡眠/阻塞，否则静止状态无法到来，宽限期永不结束，写者与回收线程被无限期挂起。

误区五：以为 RCU 就是「读不加锁所以不用管内存序」。发布必须用 release（或 `rcu_assign_pointer` 提供的等价语义），否则读者可能看到未初始化的节点内容。

## 七、与开源书·权威来源对应
- **Tanenbaum《Modern Operating Systems》**：读写锁与同步原语的经典讲授。
- **Bryant & O'Hallaron《CSAPP》第 12 章**：Pthreads 读写锁（`pthread_rwlock_t`）的使用示例。
- **Love《Linux Kernel Development》RCU 章**：图解宽限期、静止状态与回收路径。
- **McKenney 等 Linux RCU 论文及内核 `Documentation/RCU/`**：形式化 grace period 与 quiescent state，是 RCU 最权威的一手资料。
- **Herlihy & Shavit《The Art of Multiprocessor Programming》**：从读侧无锁与可扩展性角度分析 RCU 与相关同步原语。

## 八、面试题
1. **RCU 读者为何无需加锁？** 读者只做一次原子读指针然后遍历「当时可见」的版本，不修改共享状态、不需要与其他读者互斥，因而省去原子计数与锁获取，成本为常数级。
2. **宽限期（grace period）的含义？** 从新版本发布到「所有在发布前开始的读者临界区均已结束」之间的时间间隔；期间旧对象必须保留，不得回收。
3. **读写锁写者饥饿如何解决？** 采用写者优先的读写锁（新读者在有等待写者时被阻塞）、使用公平队列，或改用 RCU/seqlock 让写路径不再等待读者计数归零。
4. **RCU 适合什么场景，不适合什么？** 适合读极多写极少、且读侧不需要强一致快照的场景（路由表、配置、链表查找）；不适合写频繁、读侧需睡眠或需要跨对象原子一致性的场景。

## 九、演进与趋势
用户态 RCU（userspace-rcu / urcu）与 QSBR（Quiescent State Based Reclamation）把宽限期探测交给线程主动上报静止状态，显著降低写者开销；hazard pointer 提供另一种安全回收机制（C++ 标准化的进展以官方最新文档为准），与 RCU 思路互补——前者按指针登记，后者按时间段划分。RT-Linux 中的 `SRCU`（sleepable RCU）放宽了读者可睡眠的限制，代价是更长的宽限期。RCU 已从内核扩展到用户态高并发数据结构（并发哈希表的读路径、无锁队列的内存回收），成为读多写少场景的默认方案之一。

## 十、小结
读多写少时，读写锁先解除读串行化，RCU 再把读成本降到常数级并消除读侧饥饿，代价是写时复制、延迟回收以及读者不可睡眠的强约束。用好 RCU 的关键在于三点：发布用 release 语义、回收必须等宽限期、读者临界区保持短小不可阻塞。它适合读极多写极少的场景，写多或需强一致时仍应回到读写锁或互斥锁。
