# 无锁编程与CAS原子

> 对应 Bryant & O'Hallaron《CSAPP》12.7、ISO/IEC 9899（C11 `stdatomic`）、Herlihy & Shavit《The Art of Multiprocessor Programming》第 1/10 章、OSTEP 并发章节、Adve & Gharachorloo 1996（内存一致性模型）。

## 一、背景与挑战
锁带来一系列风险：死锁、优先级反转、阻塞与惊群，且在高竞争下吞吐急剧塌陷（持锁者被换出时其他线程排队等待）。无锁（lock-free）编程用原子原语保证「系统级进展」——至少有一个线程在有限步内前进——适合高并发低延迟的数据结构（队列、栈、计数器、哈希表）。

代价是三类新难题：
- **ABA 问题**：值变化后又回到原值，CAS 误判未变；
- **重试饥饿与活锁**：CAS 循环持续失败，单线程可能永不前进；
- **安全内存回收**：节点被摘除后仍有读者在访问，free 会导致悬垂引用。

再加上内存序（memory ordering）的正确性论证，无锁代码的复杂度显著高于等价加锁实现。

## 二、核心原理
CAS（Compare-And-Swap）原子地执行「比较并条件交换」：仅当 `*addr == expected` 时写入 `new`。典型无锁更新模式是 **read-modify-CAS** 循环：读当前值、基于它计算新值、尝试提交，失败则用 CAS 回填的旧值重试。

```text
loop:
    old = load(addr)          # 读取当前值
    new = f(old)              # 计算新值
    if CAS(addr, old, new):   # 仅当仍为 old 才提交
        success
    else:
        retry                 # old 被更新为最新值，重试
```

进展保证的层次（Herlihy & Shavit 的标准定义）：
- **blocking**：某线程持锁时崩溃或阻塞，全体停止；
- **lock-free**：任意时刻至少有一个线程能在有限步内完成操作；
- **wait-free**：**每个**线程都能在有限步内完成操作，无重试饥饿。

注意区分：lock-free 不保证每个线程都前进，只是在无限执行下无限次完成操作。这也是 CAS 循环可能出现「某线程反复失败」的原因。

## 三、形式化与数学基础
CAS 的形式语义：

$$ CAS(addr, exp, new) = \begin{cases} \text{true}, & *addr = exp \;\Rightarrow\; *addr \leftarrow new \\ \text{false}, & \text{否则，内存不变} \end{cases} $$

**ABA 问题。** 设线程 $T_1$ 读到 $*addr = A$，在此期间另一线程把值改为 $B$ 又改回 $A$。$T_1$ 的 CAS 仍然成功，但中间状态变化被掩盖。用版本号扩展指针可消除：

$$ ptr' = \langle version + 1,\; address \rangle,\qquad CAS(addr, \langle v, a\rangle, \langle v{+}1, b\rangle) $$

每次更新版本自增，比较同时覆盖地址与版本，要求该元组能被单条原子指令处理（双宽 CAS，如 x86-64 的 `CMPXCHG16B`；否则需 LL/SC 或额外锁）。

**内存序。** C11 定义 `relaxed < acquire/release < seq_cst`。`release` 保证之前的写不会被重排到其后，`acquire` 保证之后的读不会被重排到其前；二者配对构成 synchronizes-with 关系，是「无锁发布」的正确性基础。所有原子操作在线程间构成一个总修改序（modification order），这是论证无锁算法正确性的形式化工具。

## 四、代码实现
无锁栈（Treiber stack）的 push，使用 C11 原子操作与显式内存序：

```c
/* Treiber 栈的 push：CAS 循环更新头指针 */
#include <stdatomic.h>
#include <stdlib.h>

struct Node { int v; struct Node *next; };
_Atomic(struct Node *) top = NULL;

void push(int v) {
    struct Node *n = malloc(sizeof *n);
    n->v = v;
    struct Node *t = atomic_load_explicit(&top, memory_order_acquire);
    do {
        n->next = t;                 /* 先接上旧链头 */
    } while (!atomic_compare_exchange_weak_explicit(
                 &top, &t, n,
                 memory_order_release,   /* 成功：发布新链头 */
                 memory_order_acquire)); /* 失败：t 被回填为最新值 */
}
```

`weak` 版本允许伪失败（spurious failure），在循环中重试即可，某些架构上比 `strong` 更快。释放路径必须配合安全回收（hazard pointer 或 epoch-based reclamation）才能 free 被摘除的节点，否则读者可能仍在遍历它。

## 五、与其他技术对比
| 方案 | 进展保证 | 主要风险 | 读路径成本 |
| --- | --- | --- | --- |
| 互斥锁 | 持锁者前进 | 死锁/优先级反转/阻塞 | 原子 + 可能睡眠 |
| 自旋锁 | 持锁者前进 | 空转、单核危险 | 原子 + 忙等 |
| 无锁 CAS | 系统级前进 | ABA、重试活锁 | 原子 CAS 循环 |
| wait-free | 每线程有限步 | 实现极难、开销大 | 常数步 |
| RCU | 系统级前进 | 延迟回收、不可睡眠 | 常数、无原子 |

无锁避免死锁但引入 ABA 与重试；RCU 读侧最轻但写者需复制并等宽限期；wait-free 最强但构造复杂，实践中仅在少数结构（如某些 FIFO 队列）中实现。

## 六、常见误区
误区一：认为无锁一定更快。高竞争下 CAS 失败率上升，重试消耗缓存一致性带宽，可能慢于一次精心设计的分片锁。

误区二：忽略 ABA。`free` 后 `malloc` 返回同一地址会制造隐蔽错误，尤其在栈/队列的 pop 路径上。

误区三：忘记内存序。全用 `relaxed` 会让初始化写入被重排到发布之后，其他线程可能读到未初始化节点；`acquire`/`release` 才是常见正确选择，`seq_cst` 最安全但最慢。

误区四：把 `weak` 的伪失败当逻辑错误。它正是规范允许的行为，处理方式是重试而非断言失败。

误区五：以为无锁结构不需要内存回收方案。摘除节点后仍需保证没有读者持有它，必须用 hazard pointer、epoch/RCU 或引用计数。

## 七、与开源书·权威来源对应
- **Bryant & O'Hallaron《CSAPP》12.7**：同步原语与原子交换/CAS 示例。
- **ISO/IEC 9899（C11）`stdatomic.h`**：原子类型与六种内存序的规范定义。
- **Herlihy & Shavit《The Art of Multiprocessor Programming》第 1/10 章**：lock-free 与 wait-free 的形式化定义与一致性数（consensus number）理论。
- **OSTEP 并发章节**：讨论无锁的进展保证与实测取舍。
- **Adve & Gharachorloo 1996**：共享内存一致性模型的形式化综述，是内存序论证的经典参考。

## 八、面试题
1. **CAS 是什么？** 比较并交换的原子原语：仅当内存值等于期望值时才写入新值并返回成功；是无锁循环提交的基础。
2. **ABA 问题及解法？** 值 $A \to B \to A$ 使 CAS 误判未变；用版本号或标记指针（tagged pointer）让每次更新都改变被比较的元组。
3. **`memory_order` 各档含义？** `relaxed` 仅保证原子性不保证顺序，`acquire`/`release` 建立同步边防止越界重排，`seq_cst` 提供全局单一总序但开销最大。
4. **lock-free 与 wait-free 的区别？** lock-free 只保证系统整体持续前进，个别线程可能饥饿；wait-free 保证每个线程有限步完成。
5. **无锁结构如何安全释放内存？** hazard pointer（读者登记在用指针）、epoch/RCU（延迟到宽限期后回收）或引用计数（如 `shared_ptr` 的原子引用）。

## 九、演进与趋势
C++20 引入 `std::atomic::wait`/`notify_one`（用户态等待唤醒，语义类似 futex），使无锁结构可在竞争时优雅退避。事务内存（HTM/TSX）提供硬件事务语义，但受安全退役与容量限制，生态有限。hazard pointer 已被提出纳入 C++ 标准（进展以官方最新文档为准）；Rust 生态的 `crossbeam` 提供成熟的 MPMC 队列、栈与 epoch 回收，成为工程实践的重要参照。主流方向是「无锁读 + 有界重试 + 显式回收」的组合，而非追求纯 wait-free。

## 十、小结
无锁以 CAS 等原子原语换取无阻塞进展，但必须同时解决三大难题：ABA（版本/标记）、内存序（acquire/release 配对）、安全回收（hazard pointer/RCU）。它不是银弹——在中等竞争下，精心分片的锁往往更简单也更快；无锁的价值集中在读多写少、延迟敏感且可论证正确性的场景。
