# CAS与原子比较交换

> 对应 Herlihy, *Wait-Free Synchronization* (ACM TOPLAS 1991)，与 C++ 标准 `[atomics]` 中 `compare_exchange_weak/strong` 的规定，以及 Intel SDM Vol.2 的 `CMPXCHG` 描述。

## 一、背景与挑战

读-改-写（RMW）需要在单一不可分割的操作中读取旧值并写入新值。比较并交换（Compare-And-Swap, CAS）把「条件判断」与「写入」合并为原子步骤，可以表达几乎任意状态转移——绝大多数无锁算法（栈、队列、哈希表、引用计数、内存池）都建立在它之上。

CAS 的挑战来自判定依据：**用值相等推断状态未变**。这在两种情形下失效：**ABA**（值从 A 变 B 又变回 A，CAS 误判无冲突并覆盖中间状态）与**活锁**（高竞争下反复失败，线程长期无法推进）。这两点是所有 CAS 算法必须正面处理的工程问题。

## 二、核心原理

`CAS(addr, expected, desired)` 的语义：

- 若 `*addr == expected`，则写入 `desired`，返回**成功**；
- 否则**不写入**，把 `*addr` 的当前值回填到 `expected`（语言层面），返回**失败**。

失败时回填旧值是 C11/C++ 的关键设计：它让「重读 → 重算 → 重试」的循环不需要额外加载，直接复用回填值即可。

围绕 CAS 的三种常见优化：

- **weak vs strong**：弱版本允许伪失败（适配 LL/SC 硬件），必须放在循环里；强版本在内部消化伪失败，等价于「值相等则必成功」。在 x86 上两者通常编译为同一指令，在 ARM 上强版本需要一个内部重试循环。
- **退避（backoff）**：失败后插入 `PAUSE`、指数延迟或 `sched_yield`，降低争用与总线流量。
- **带标签 CAS**：把「值 + 版本号」打包成一个可原子访问的宽字（如 128 位双字 CAS），比较时同时比较版本，从根上消除 ABA。

## 三、形式化与数学基础

CAS 的原子语义形式化为：

$$
\text{CAS}(A, e, d) =
\begin{cases}
A \leftarrow d,\ \text{return } \texttt{true}, & \text{若 } A = e \\
e \leftarrow A,\ \text{return } \texttt{false}, & \text{否则}
\end{cases}
$$

判等与写入对其它处理器不可分，其线性化点即为实际写内存的瞬间（成功时）或读内存的瞬间（失败时）。

**ABA 的形式刻画**：若取值序列为 $A \xrightarrow{t_1} B \xrightarrow{t_2} A$，某线程在 $t_2$ 之后以 $e = A$ 提交 CAS 时条件 $A = e$ 成立，却跨越了 $(t_1, t_2)$ 间的状态变化。带版本号的方案把状态扩展为 $(value, version)$，写入时 version 单调递增，于是 $(A, v_1) \neq (A, v_3)$，判定恢复正确。

**Herlihy 的结论**：CAS 与 LL/SC 的共识数（consensus number）为 $\infty$，即可以等待无关地（wait-free）实现任意数量的对象；而 test-and-set、fetch-and-add 的共识数为 2，即两个线程无法仅靠它们达成无等待共识。这就是「CAS 是无锁编程基石」的理论依据。

## 四、代码实现

```c
#include <stdatomic.h>

/* 用 CAS 循环实现原子自增（compare_exchange_weak 版） */
void atomic_inc(atomic_int *a) {
    int e = atomic_load_explicit(a, memory_order_relaxed);
    while (!atomic_compare_exchange_weak_explicit(
               a, &e, e + 1,
               memory_order_relaxed, memory_order_relaxed)) {
        /* 失败时 e 已被回填为当前值，直接进入下一轮 */
    }
}
```

```c
/* 带版本号的 CAS：把 ABA 从根上排除（x86-64 的 16 字节 CAS） */
typedef struct { long value; long version; } Tagged;

bool tagged_cas(_Atomic(Tagged) *p, long oldv, long newv) {
    Tagged e = atomic_load(p);
    while (e.value == oldv) {
        Tagged want = { newv, e.version + 1 };  /* 版本随每次尝试重算 */
        if (atomic_compare_exchange_weak(p, &e, want))
            return true;   /* 成功：value 与 version 一起原子更新 */
        /* 失败：e 被回填为最新值，回到循环重新判 value */
    }
    return false;
}
```

`_Atomic(Tagged)` 需要 16 字节原子支持（x86-64 的 `CMPXCHG16B`、ARMv8.1 的 `CASP`）；若平台不支持，编译器可能退化为锁实现或直接编译失败。

## 五、与其他技术对比

| 维度 | CAS | LL/SC | TAS | fetch_add | 互斥锁 |
| --- | --- | --- | --- | --- | --- |
| 表达力 | 任意条件更新 | 任意条件更新 | 仅置位并读旧值 | 仅加减等固定运算 | 任意临界区 |
| ABA | 有 | 无 | 无 | 无 | 无 |
| 伪失败 | 无 | 有 | 无 | 无 | 无 |
| 共识数 | $\infty$ | $\infty$ | 2 | 2 | $\infty$（阻塞） |
| 典型指令 | `LOCK CMPXCHG` | `LDXR`/`STXR` | `XCHG` | `LOCK XADD` | `LOCK` + futex |
| 活锁风险 | 高竞争下有 | 有（伪失败） | 高 | 无 | 无（但可能死锁） |

## 六、常见误区

- **「CAS 一定成功」**：高竞争下可能反复失败形成活锁，需要退避；CAS 只保证「成功时是正确的」。
- **「值相等就说明没变过」**：这正是 ABA 的误判；内存复用场景（节点池、分配器）尤其危险。
- **「有 DCAS 就没有 ABA」**：双字 CAS 跨架构可移植性差（ARM 用 `CASP`、Power 有对应指令），且仍需软件版本管理。
- **「CAS 循环里可以随便写副作用」**：循环体必须可重放，日志、计数、系统调用都不能放在重试路径里。
- **「CAS 失败后 expected 应保持原值」**：恰恰相反，语言会把它回填为当前值，误用陈旧快照是常见 bug 来源。

## 七、与开源书·权威来源对应

- **Herlihy, *Wait-Free Synchronization*, TOPLAS 1991**：共识数层次与 CAS 的万能性证明。
- **Intel SDM Vol.2**：`CMPXCHG`/`CMPXCHG8B`/`CMPXCHG16B` 指令语义与 `LOCK` 前缀。
- **C++ 标准 `[atomics.types.operations]`**：`compare_exchange_weak/strong` 的语义、回填行为与内存序参数，以官方最新文本为准。
- **Bryant & O'Hallaron《CSAPP》**：第 12 章从线程同步视角解释为何需要原子原语；Drepper《What Every Programmer Should Know About Memory》给出 CAS 与缓存行争用的性能刻画。

## 八、面试题

**Q1：CAS 的 ABA 问题是什么，如何解决？**
要点：值 A→B→A 使 CAS 误判无变更；解法是带版本号/标签的宽 CAS，或依赖 LL/SC、安全内存回收等机制。

**Q2：`compare_exchange_weak` 与 `strong` 的区别？**
要点：weak 允许伪失败，必须写在循环里；strong 保证值相等即成功，但可能在内部重试。在 LL/SC 机器上 weak 更高效。

**Q3：为什么 CAS 失败后不需要重新加载 `expected`？**
要点：失败路径会把内存当前值写回 `expected`，直接复用即可，减少一次加载。

**Q4：CAS 活锁怎么办，为什么说 CAS 的共识数无穷大？**
要点：活锁靠退避（`PAUSE`、指数延迟、`sched_yield`）与减少共享点（分片、松弛）化解；共识数为 $\infty$ 是因为 CAS 能在常数步内模拟任意数量的原子寄存器与共识协议，从而可 wait-free 实现任意对象。

## 九、演进与趋势

- **宽 CAS**：x86-64 `CMPXCHG16B`、ARMv8.1 `CASP` 支持 128 位原子操作，使「值 + 版本」打包成为可行方案。
- **硬件事务内存**：以 TSX 类扩展为代表，尝试把多地址更新变成原子事务，但受平台与禁用策略限制（以厂商最新文档为准）。
- **语言与形式化**：C11/C++ 内存模型让 CAS 的内存序参数可精确表达，CppMem 等模型检测工具被用于验证 CAS 算法；对计数类场景，fetch_add 与 LSE 原子指令以更低开销取代 CAS 循环。

## 十、小结

CAS 是通用 RMW 原语，凭「比较-交换」的原子性可以在有限步内构造任意无等待对象，是共识数理论的明星。它的两个固有陷阱——ABA 与活锁——决定了工程实践必须配套版本号、退避与安全内存回收。掌握 CAS 的语义细节（回填、强弱版本、内存序）与实现边界（宽 CAS 支持），是编写正确高效无锁代码的前提。
