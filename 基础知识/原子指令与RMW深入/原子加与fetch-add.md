# 原子加与fetch-add

> 对应 Herlihy & Shavit《The Art of Multiprocessor Programming》的共识数层次，与 Intel SDM Vol.2 对 `LOCK XADD` 的描述。

## 一、背景与挑战

计数器、引用计数、序号分配等场景，只需要「读旧值并加上一个增量」这一类受限的读-改-写（Read-Modify-Write, RMW）。用通用 CAS 循环当然能实现，但代价明显：

- CAS 循环在高竞争下需要反复重读、重算、重试，失败即白做，竞争线程数 $n$ 增大时期望重试次数上升；
- CAS 用「值相等」判断无冲突，无法区分「值没变」与「变过又变回来」，天然引入 ABA 风险；
- 对固定的更新语义（加法），让硬件在一条指令内完成，可省掉重试循环与额外观测。

因此几乎所有体系结构都提供了专用的原子加指令，它比 CAS 更快，且不被 ABA 困扰。

## 二、核心原理

`fetch_add(addr, d)` 的契约是：原子地返回该地址的**旧值**，并把地址内容加上 $d$。它必须同时满足：

1. **不可分性**：读与写在其它处理器看来是同一瞬间发生的动作；
2. **返回旧值**：返回值是加法之前的值，故 `x = fetch_add(a, 1)` 可拿到唯一序号；
3. **全序**：对同一地址的所有 fetch-add，存在与真实时间相容的串行化顺序。

硬件实现路径大致三条：

- **x86**：`LOCK XADD [mem], reg`，寄存器先持有增量，执行后寄存器变为旧值（`XADD` 自 80486 引入）；结果被忽略时编译器常改发 `LOCK INC`。
- **带 LL/SC 的 RISC**（ARM/Power/RISC-V）：用加载-链接/条件存储循环模拟，`stxr` 失败即重试。
- **Armv8.1-A 的 LSE 原子指令**：`LDADD`、`LDCLR`、`LDSET` 等把 RMW 做成单指令，避免 LL/SC 循环在竞争下的伪失败。

多核冲突本质上由缓存一致性协议（MESI 系列）串行化：任一时刻只有一个核能以独占态持有该缓存行。

## 三、形式化与数学基础

设初值 $v_0$，并发执行 $n$ 次加法，增量分别为 $d_1,\dots,d_n$。原子性保证最终值只取决于增量集合，与交错顺序无关：

$$v_{final} = v_0 + \sum_{i=1}^{n} d_i$$

更强的性质是：存在一个排列 $\pi$，使观察到的每一步满足

$$v_{k+1} = v_k + d_{\pi(k)},\quad k = 0,\dots,n-1$$

且各线程拿到的返回值互不相同、正好构成前缀和。这正是「用 fetch_add 分配唯一序号」的正确性基础。其**线性化点**可定在指令修改内存的那一刻，落在调用返回之前，因而 fetch-add 是可线性化的。

## 四、代码实现

```c
#include <stdatomic.h>

atomic_long counter = 0;

long next_id(void) {
    /* relaxed：计数器只需最终聚合正确，不借它建立跨变量顺序 */
    return atomic_fetch_add_explicit(&counter, 1, memory_order_relaxed);
}
```

```asm
; x86-64 典型展开：long old = fetch_add(&counter, 1)
        mov     rax, 1
        lock xadd QWORD PTR counter[rip], rax   ; rax <- 旧值
; 若只需自增、不用旧值，则编译为：lock inc QWORD PTR counter[rip]
```

C++ 对应写法为 `std::atomic<long>::fetch_add`。是否保留返回值直接影响指令选择：需要旧值必须 `XADD`，不需要则可退化为更轻的 `INC`。

## 五、与其他技术对比

| 维度 | fetch_add | CAS 循环 | LL/SC 循环 | 互斥锁 |
| --- | --- | --- | --- | --- |
| 表达力 | 仅固定运算（加/减/或） | 任意条件更新 | 任意条件更新 | 任意临界区 |
| ABA 风险 | 无（不比较值） | 有 | 无（检测写冲突） | 无 |
| 高竞争行为 | 硬件串行化，无活锁 | 重试风暴，可能活锁 | 伪失败增多 | 睡眠/唤醒开销 |
| 返回值 | 旧值 | 成功/失败 | 成功/失败 | — |
| 典型指令 | `LOCK XADD` / `LDADD` | `LOCK CMPXCHG` / `CAS` | `LDXR` / `STXR` | `LOCK` + 等待队列 |

能用 fetch-add 表达的更新，就不要再写成 CAS 循环：前者免 ABA、无重试、指令更少。

## 六、常见误区

- **「relaxed 内存序不安全」**：计数器只求最终聚合值时 `memory_order_relaxed` 完全正确；只有把它当同步信号（如计数归零发布数据）时才需要 acquire/release 或更强序。
- **「fetch_add 能替代 CAS」**：它只能表达「加上常量」；一旦更新依赖任意判断（如「若为 0 则设为 5」），必须回到 CAS。
- **「原子操作没有性能问题」**：单个共享计数器在核数增多时会退化为缓存行乒乓（ping-pong），吞吐不升反降。
- **「忽略返回值会更快」**：可能允许 `LOCK INC`，但原子性开销与缓存行争用依然存在。

## 七、与开源书·权威来源对应

- **Intel SDM Vol.2**：`XADD` 指令语义与 `LOCK` 前缀的原子性保证。
- **Intel SDM Vol.3A**：「Locked Atomic Operations」与「Bus Locking」，说明缓存行锁优先于总线锁。
- **Herlihy & Shavit《The Art of Multiprocessor Programming》**：共识数层次中 fetch-and-increment 的同步能力弱于 CAS。
- **Bryant & O'Hallaron《Computer Systems: A Programmer's Perspective》**：第 12 章从线程视角说明计数器为何需要原子性。
- **Hennessy & Patterson《Computer Architecture》**：一致性协议如何为 RMW 提供串行化点。

## 八、面试题

**Q1：为什么计数器常用 relaxed？**
要点：只关心最终聚合值，不借它给其它变量排序；relaxed 省去屏障开销，加法仍原子、不丢失。

**Q2：fetch_add 为什么天然免疫 ABA？**
要点：它不比较旧值，只做加法；ABA 的根源正是「比较值」这一动作。

**Q3：热点计数器为何拖慢多核？**
要点：各核反复争用同一缓存行，独占权在核间传递，互连流量随核数增长。

**Q4：`counter++` 与 `fetch_add(1)` 编译结果一样吗？**
要点：结果被忽略时通常都编译为 `LOCK INC`；需要旧值时必须是 `LOCK XADD`。

## 九、演进与趋势

- **Armv8.1-A LSE**：`LDADD`/`LDSET`/`LDCLR` 把 RMW 变成单指令，减少 LL/SC 伪失败；软件依据 HWCAP 探测后选择代码路径。
- **RISC-V A 扩展**：`amoadd.w` 等原子内存操作纳入标准。
- **缓解热点**：分片计数（striped counter）为每核或每槽各存一份、读取时求和，写入无争用，代价是读取不再是 $O(1)$ 的精确值。
- **近存计算**：在内存内计算与 SIMD 场景下，批量原子更新成为研究方向。

## 十、小结

原子加是 RMW 家族中最专用、最高效的成员：单指令完成「返回旧值 + 累加」，天然免 ABA、无需重试循环，适合计数、序号分配与统计聚合。其边界同样清晰——只能表达固定加法语义，且热点共享缓存行会成为扩展性瓶颈，工程上需借助分片化解。
