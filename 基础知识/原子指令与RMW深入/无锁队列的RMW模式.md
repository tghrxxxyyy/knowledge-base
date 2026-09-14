# 无锁队列的RMW模式

> 对应 Maged M. Michael & Michael L. Scott, *Simple, Fast, and Practical Non-Blocking and Blocking Concurrent Queue Algorithms* (PODC 1996)，以及 Herlihy & Shavit《The Art of Multiprocessor Programming》。

## 一、背景与挑战

生产者-消费者队列是并发程序的基本构件。用互斥锁保护会带来三个问题：锁竞争限制吞吐、持锁期间若线程被抢占会拖慢所有参与者（尤其在内核或实时场景）、以及锁与其它锁之间可能形成死锁环。

无锁（lock-free）队列用 CAS 直接在头/尾指针上推进，任一时刻系统整体仍在前进，不因某个线程暂停而卡死。难点有三：队列两端都要更新（`next` 与 `tail`），两步之间的中间状态必须对并发者**可解释**；空队列与单元素队列是易错边界；节点回收无锁化极难，某线程可能仍持有刚被摘除节点的指针，直接释放会造成悬垂访问。

## 二、核心原理

Michael-Scott 队列的关键设计是**哑元节点（dummy node）**：队列始终至少含一个节点，`head` 指向哑元，`tail` 指向末节点。于是：

- **空队列**：`head == tail == dummy`，`dummy->next == NULL`；
- **入队**：先用 CAS 把新节点挂到 `tail->next`；成功后（可能由本次、也可能由其它线程）再用 CAS 把 `tail` 推进到新节点。第二步允许失败，因为别的线程可能已代为推进。
- **出队**：读出 `head`、`tail` 与 `head->next`。若 `head == tail` 而 `next == NULL`，说明队列空，返回空；否则先用 CAS 把 `head` 推进到 `next`，成功者取走 `next` 的数据并把旧哑元的 `next` 指向自己（自引用，用于标记已摘除）。

每一步都遵循同一模式：**读快照 → 基于快照计算目标状态 → CAS 提交 → 失败则重读重试**。这正是 RMW 在无锁算法中的标准用法。

## 三、形式化与数学基础

**lock-free（无锁）** 的定义：在任意无限执行中，都有某个线程在有限步内完成操作。

$$\forall\ \text{infinite execution } \sigma,\ \exists\ \text{thread } t:\ t \text{ 在 } \sigma \text{ 中于有界步数内完成无限多次操作}$$

它比 wait-free 弱：wait-free 要求**每个**线程都在有界步内完成，而 lock-free 只要求系统级进展，单个线程仍可能饥饿。

CAS 的原子性可刻画为：$\text{CAS}(A, e, d)$ 当且仅当 $A = e$ 时置 $A \leftarrow d$。在 Michael-Scott 队列中，`tail->next` 的 CAS 与 `head` 的 CAS 分别构成入队与出队的线性化点；由于 CAS 保证只有一个线程成功，队列的 FIFO 顺序得以保持（入队的 CAS 顺序即线性化顺序）。

**内存序要求**：入队时挂接 `next` 需要 release 语义（让后续读者看到节点数据），读取 `next` 需要 acquire 语义；尾指针推进可用 relaxed 或用 CAS 的默认强序。C++ 中的宽松写法需要仔细推敲，否则在弱内存模型（ARM/Power）上会出现读者看到节点指针却看不到节点内容的问题。

## 四、代码实现

```c
/* Michael-Scott 队列的入队（C11 atomics，简化示意） */
typedef struct Node {
    _Atomic(struct Node *) next;
    int value;
} Node;

typedef struct {
    _Atomic(Node *) head;
    _Atomic(Node *) tail;
} Queue;

void enqueue(Queue *q, Node *n) {
    atomic_store_explicit(&n->next, NULL, memory_order_relaxed);
    Node *t;
    for (;;) {
        t = atomic_load_explicit(&q->tail, memory_order_acquire);
        Node *next = atomic_load_explicit(&t->next, memory_order_acquire);
        if (next != NULL) {
            /* tail 落后了：帮忙推进（允许失败） */
            atomic_compare_exchange_strong(&q->tail, &t, next);
            continue;
        }
        /* 关键 CAS：把新节点挂到尾部 */
        Node *expected = NULL;
        if (atomic_compare_exchange_strong_explicit(
                &t->next, &expected, n,
                memory_order_release, memory_order_relaxed)) {
            /* 挂接成功；尾指针推进失败无妨，别的线程会帮 */
            atomic_compare_exchange_strong(&q->tail, &t, n);
            return;
        }
    }
}
```

`compare_exchange_strong` 在失败时会把 `expected` 更新为当前值，因此循环中必须每轮重新读取，而不能复用陈旧快照。

## 五、与其他技术对比

| 维度 | 无锁队列（MS） | 互斥锁队列 | 无等待队列 | 环形缓冲（SPSC） |
| --- | --- | --- | --- | --- |
| 进展保证 | lock-free | 阻塞（可能死锁） | wait-free | lock-free（单生产者单消费者） |
| 抗线程暂停 | 是 | 否 | 是 | 是 |
| 内存回收需求 | 必须（HP/epoch/RCU） | 不需要 | 必须 | 不需要（固定缓冲） |
| 实现复杂度 | 高 | 低 | 很高 | 低 |
| 适用场景 | 通用 MPMC | 临界区较长 | 实时/硬期限 | 高频 SPSC 通道 |
| 空间开销 | 每节点 + 回收元数据 | 每节点 | 每节点 + 辅助结构 | 固定 |

## 六、常见误区

- **「无锁就等于无等待」**：lock-free 只保证系统级进展，单个线程可能长期饥饿；wait-free 才保证每线程有界步完成。
- **「有了 CAS 就不会有 ABA」**：CAS 的 ABA 在无锁队列里非常致命——已摘除节点若被复用，`next` 指针会指向错误位置，必须配版本号或安全回收。
- **「用 CAS 就不需要内存回收方案」**：摘除节点后直接 `free` 会让仍在读该节点的线程悬垂访问，必须用 hazard pointer、epoch-based reclamation、QSBR 或 RCU 之类机制。
- **「`compare_exchange_weak` 和 strong 随便用」**：在 LL/SC 机器上 weak 可能伪失败，必须写在循环里；strong 在内部消化伪失败，开销更高。
- **「哑元节点是多余开销」**：它消除了空队列的边界特判，使入队出队统一为指针 CAS，是算法简洁性的来源。

## 七、与开源书·权威来源对应

- **Michael & Scott 1996（PODC）**：*Simple, Fast, and Practical Non-Blocking and Blocking Concurrent Queue Algorithms*，MS 队列与两锁队列原文。
- **Herlihy & Shavit《The Art of Multiprocessor Programming》**：第 10 章队列，lock-free 与 wait-free 的定义与证明。
- **Maged Michael, *Hazard Pointers: Safe Memory Reclamation for Lock-Free Objects***（IEEE TPDS）：无锁内存回收的经典方案。
- **Fraser & Harris, *Concurrent Programming Without Locks***：实用无锁数据结构与回收技术综述。
- **C++ 标准 `[atomics]` 章节**：`compare_exchange_weak/strong` 语义与内存序约定，以官方最新文本为准。
- **Love《Linux Kernel Development》**：内核中无锁（`kfifo`、`llist`）与 RCU 的使用对照。

## 八、面试题

**Q1：无锁队列为什么用哑元节点？**
要点：让队列恒非空，消除空队列/单元素的边界特判，使入队出队统一为指针 CAS。

**Q2：为什么入队的第二步 CAS 允许失败？**
要点：别的线程可能已经帮忙推进 `tail`；失败说明别人做了同样的工作，不影响正确性。

**Q3：lock-free 与 wait-free 的区别？**
要点：lock-free 只保证系统级进展；wait-free 保证每个线程在与其步数成比例的界内完成。

**Q4：无锁队列为什么必须有内存回收方案？**
要点：节点被摘除后其它线程可能仍持有指针（正在读 `next`），立即释放会造成悬垂与 ABA。

**Q5：可以在无锁队列上用 `relaxed` 存取吗？**
要点：不行。挂接 `next` 需 release，读取需 acquire，否则弱内存模型下会读到指针却读不到节点内容。

## 九、演进与趋势

- **回收机制**：hazard pointer、epoch-based reclamation、QSBR、RCU 各有取舍；工业库常提供多种策略可选。
- **成熟实现**：Folly 的 `MPMCQueue`（有界、数组型，回避指针回收问题）、moodycamel `ConcurrentQueue`（多子队列、批量操作）在大规模 MPMC 场景被广泛使用。
- **有界替代无界**：很多系统宁可用预分配环形缓冲，把「回收」问题转化为「背压」问题，工程上更可控；形式化验证（CppMem、模型检测）与宽 CAS、事务内存等硬件辅助则在降低实现难度。

## 十、小结

Michael-Scott 队列把无锁编程的核心模式浓缩为一句话：**读快照、算目标、CAS 提交、失败重试**，并用哑元节点统一边界。它换来死锁免疫与抗暂停能力，也带来三个必须承担的代价——ABA、内存回收与内存序推理。缺少其中任何一项，代码都可能在弱内存模型或高竞争下静默出错。
