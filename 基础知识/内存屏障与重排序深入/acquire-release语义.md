# acquire-release语义

> 对应 ISO C++11 内存模型（memory_order）；Boehm & Adve 2008「Foundations of the C++ Concurrency Memory Model」。

## 一、背景与挑战

全顺序一致性（seq_cst）太贵（需全局单一顺序与全屏障），弱模型裸写又太难用且易错。acquire-release 提供「刚好够用」的同步：release 之前的写对随后 acquire 同一变量的线程可见，既表达发布-订阅，又不必付出全局顺序的代价。它是并发编程最常用的内存序。其定位介于 relaxed（仅原子）与 seq_cst（全序）之间，覆盖绝大多数「发布-订阅」「锁获取-释放」语义，而无需全屏障开销。

从工程视角看，acquire-release 几乎就是「锁」的语义内核：`lock()` 是一次 acquire（阻止后续临界区访存被上移），`unlock()` 是一次 release（阻止此前临界区访存被下移）。理解这一点即可明白为何「锁能保护临界区」——保护并非来自互斥本身，而是来自这对 acquire/release 建立起的 happens-before 边。

## 二、核心原理

release 操作（如 `store(1, release)`）之前的所有写，不会被编译器/CPU 重排到它之后；acquire 操作（如 `load(acquire)`）之后的所有读/写，不会被重排到它之前。二者配对（对同一原子变量）建立 happens-before：release 侧的写入对 acquire 侧可见。注意 acquire/release 只在「配对变量」上建立单向同步边，不在独立变量间建立顺序。它不构成「全处理器一致」的顺序，因此比 seq_cst 弱，但比 relaxed 强在能传递 happens-before。

必须澄清「单向」的确切含义：同步边是 $W_{release}\ \text{sw}\ R_{acquire}$，方向是从 release 到 acquire。反向不成立——acquire 之后的写在 release 侧不可见。同时它只提供「配对点前后」的序，不提供「配对点自身」的全局顺序：两个线程各自 release/acquire 不同变量时，无法推出二者的先后。

## 三、形式化与数学基础

若线程 A 执行 `x.store(1, release)`，线程 B 执行 `x.load(acquire)` 且读到 1，则存在同步边：

$$W_A(x,1)\ \text{sw}\ R_B(x,1) \implies \forall w\ \text{po-before release}:\ w\ \text{hb}\ \text{acquire-po-after loads}$$

即 release 之前的所有写 happens-before acquire 之后的所有读。注意：若 B 读到的不是 1（例如读到旧值 0），则同步边不建立，后续读不保证看到 A 的写。同步是「条件性」的——只在 acquire 确实验证到 release 值时成立。

| 内存序 | 同步边 | 可被上移/下移 |
| --- | --- | --- |
| relaxed | 无 | 前后访存均可跨越 |
| release | 仅向后（不后移） | 之前的读可后移 |
| acquire | 仅向前（不前移） | 之后的读可上移 |
| acq_rel | 双向局部 | RMW 场景 |
| seq_cst | 全局单一顺序 | 均不可跨越 |

## 四、代码实现

```c
#include <atomic>
std::atomic<int> flag{0};
int data = 0;
// 写线程
void writer() {
    data = 42;                                       // 普通写
    flag.store(1, std::memory_order_release);        // 发布；之前写不被后移
}
// 读线程
void reader() {
    if (flag.load(std::memory_order_acquire)) {      // acquire
        assert(data == 42);                          // 必然可见
    }
}
```

若把 `flag.store` 改为 relaxed，则即使 reader 读到 1，`data==42` 也不保证——这正是 relaxed 与 release 的本质区别。

```c
// acq_rel 用于「读-改-写」：既接收上游同步，又向下游发布
std::atomic<int> seq{0};
int next = seq.fetch_add(1, std::memory_order_acq_rel) + 1;
// 该操作对「之前每个 release」都是 acquire，对「之后每个 acquire」都是 release
```

`fetch_add(acq_rel)` 是构造「多生产者取号」等结构的基石：每个生产者既能看到前序发布的数据，又能把自身的结果发布给后序消费者。

## 五、与其他技术对比

| 内存序 | 强度 | 成本 | 作用 |
| --- | --- | --- | --- |
| relaxed | 最弱 | 最低 | 仅原子性，无同步 |
| acquire/release | 中 | 低 | 配对同步（发布-订阅） |
| acq_rel | 中 | 低-中 | RMW 双向局部同步 |
| seq_cst | 最强 | 高 | 全局单一顺序 |

acquire/release 比 seq_cst 弱但在独立变量间不建立顺序，故更高效；比 relaxed 强在能传递 happens-before。

| 架构 | release 实现 | acquire 实现 |
| --- | --- | --- |
| x86-TSO | 普通 `mov`（store→store 本就有序） | 普通 `mov` + 编译器屏障 |
| ARMv8 | `dmb ish` 或 `stlr` | `dmb ish` 或 `ldar` |
| RISC-V | `fence rw,w` | `fence r,rw` |

## 六、常见误区

1. 误以为 acquire/release 自动保证多变量原子性——它们只同步「配对变量」所传递的 happens-before 链，多变量需各自配对或用 seq_cst。
2. 误以为 release 是「全屏障」——release 只阻止前写后移，不阻止前读后移；acquire 只阻止后访存前移。
3. 误以为 consume 还能用——consume 语义因实现困难，多数编译器按 acquire 处理，社区聚焦 release/acquire 与 seq_cst。
4. 误以为 acquire 侧一定看到 release 侧全部——仅当 acquire 读到的正是 release 写入的值时同步边才成立。
5. 误以为 release 与 acquire 必须成对出现在同一变量上才「编译通过」——语法允许任意组合，但语义上不配对则无同步，编译器不会报错。
6. 误以为 relaxed 也能建链——多个 relaxed 之间不构成传递的 happens-before，必须至少一端是 release/acquire。

## 七、与开源书·权威来源对应

- C++ 国际标准 `memory_order` 章节定义 release/acquire 语义与 synchronizes-with。
- Boehm & Adve 2008 论证 C++ 并发内存模型的必要性，奠定 acquire/release 形式语义。
- Herlihy & Shavit 以 acquire/release 作为无锁数据结构的基本工具。
- Drepper《What Every Programmer Should Know About Memory》说明各架构原子与屏障指令的落地。

## 八、面试题

1. release/acquire 为何比 seq_cst 快？答：只约束配对同步点的局部顺序，不要求全局单一顺序，减少屏障（x86 上甚至零额外指令）。
2. 若两个线程各自 release 不同变量，能互相可见吗？答：不能，同步边只在「同一原子变量」的 release→acquire 配对间建立。
3. release 能阻止前面的读被重排吗？答：不能，release 只约束其「之前写」不后移，不约束之前的读。
4. relaxed 与 release 在消息传递上差在哪？答：relaxed 不建立同步边，即使读到标志，数据也不保证可见。
5. `acq_rel` 用在什么场景？答：读-改-写操作（如 `fetch_add`）既需接收上游同步又需发布给下游时使用。
6. 为何说锁的语义就是 acquire/release？答：`lock` 是 acquire、`unlock` 是 release，临界区保护来自这对边建立的 hb 关系。

## 九、演进与趋势

consume 语义事实停滞；语言与工具链聚焦 release/acquire 与 seq_cst。硬件上 ARM 用 DMB 实现 acquire/release，RISC-V 用 acquire/release 位，x86 因 TSO 多数情况无需额外指令，仅跨变量顺序需 MFENCE。C++20 还引入了 `atomic_ref` 把 acquire/release 应用到既存对象。

工具侧，`-fsanitize=thread`（TSan）以 happens-before 模型检测缺失同步，`relaxed` 顺序的误用是其主要捕获目标之一；硬件侧则有 ARMv8.1 LSE 与 RISC-V 的 `aq/rl` 位，把 acquire/release 直接编入单条原子指令，进一步压低同步代价。

## 十、小结

acquire-release 用最小同步成本表达「发布-订阅」模式，是并发编程最常用的内存序。理解它「只在配对变量上建立 happens-before 单向边」是避免误用的关键。实践中应优先使用 release/acquire 而非默认的 seq_cst——前者在绝大多数场景已足够，且在 ARM 上能显著减少屏障开销。
