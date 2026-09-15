# C++ 内存模型与原子操作

> 对应 ISO/IEC 14882（C++ 标准）中的内存模型与 `std::atomic` 章节，以及 cppreference 的并发支持文档与 Boehm & Adve 关于 C++ 内存模型设计的论文。

## 一、背景与挑战

在 C++11 之前，语言层面完全没有多线程与原子性的定义：pthread 只是库，编译器可以自由地把带数据竞争的访问重排或消除，`volatile` 又被广泛误用为同步手段。结果是同一份并发代码在 x86 上「碰巧能跑」，换到 ARM 就崩，且编译器升级后行为还会改变。

C++11 起，标准正式定义了内存模型：用 `std::atomic` 表达原子对象，用 `memory_order` 表达同步强度，用「先于发生」（happens-before）关系定义什么程序有确定含义。这解决了三个层次的问题——哪些程序是合法的（有数据竞争的程序行为未定义）、同步如何建立（synchronizes-with / happens-before）、以及编译器与硬件需要施加多少排序（按 memory_order 映射到平台指令）。

## 二、核心原理

六种内存序，从弱到强：

- `relaxed`：只保证原子性（不撕裂）与同一原子对象上的修改序一致性，不建立跨线程顺序。
- `consume`：依赖序，仅保证「依赖该值的后续访问」不被提前；实践中编译器多退化为 acquire，标准自 C++20 起明确建议避免使用。
- `acquire`：用于读，禁止其后（程序序）的读写被提前到该读之前。
- `release`：用于写，禁止其前（程序序）的读写被推迟到该写之后。
- `acq_rel`：用于读—改—写（RMW）操作，兼具两者语义。
- `seq_cst`：在 acquire/release 基础上增加一个所有 seq_cst 操作共享的全局总序，语义等价于顺序一致性。

核心关系链：一次 `release` 存储与读到该值的 `acquire` 加载之间建立「同步于」（synchronizes-with）；同步于再与程序序组合，形成 happens-before。若两个访问涉及同一对象、至少一个为写、且没有 happens-before 关系，则构成数据竞争，程序行为未定义（UB）。

一致性保证（对单个原子对象，即使 relaxed 也成立）：修改序（modification order）是全序；读—读一致（同一线程不会先读到新值再读到旧值）；读—写一致；写—写一致。因此 relaxed 绝非「随便」，它仍保证同一变量的值不会倒退。

原子读—改—写（fetch_add、compare_exchange 等）语义上读取「修改序中紧邻其前的值」并写入新值，是构造计数器、锁与无锁数据结构的基元。`compare_exchange_weak` 允许伪失败（spurious failure），在循环中通常更高效；`compare_exchange_strong` 不伪失败但可能生成更长的代码。CAS 循环要警惕 ABA 问题：值回到旧值无法被察觉，需配合版本号或标签指针。

## 三、形式化与数学基础

happens-before 由同步操作建立：

$$release(x, v) \;\xrightarrow{sw}\; acquire(x, v) \;\Longrightarrow\; \forall w \prec_{po} release:\ w \xrightarrow{hb} \forall r \succ_{po} acquire$$

即「释放点之前的写」先于发生「获取点之后的读」。传递性使 happens-before 成为偏序：

$$a \xrightarrow{hb} b \wedge b \xrightarrow{hb} c \;\Rightarrow\; a \xrightarrow{hb} c$$

数据竞争自由（DRF）程序在 `seq_cst` 下等价于顺序一致执行，这被称为 DRF-SC 保证：

$$\text{DRF}(P) \;\Rightarrow\; \text{obs}(P, \text{seq\_cst}) = \text{obs}(P, SC)$$

这条性质是 C++ 内存模型可用性的基石：程序员只要保证无数据竞争（用原子或锁），就可以按 SC 的直觉推理。

`seq_cst` 的总序 $S$ 要求：

$$\forall \text{seq\_cst 操作 } a, b:\ a \prec_{po} b \;\Rightarrow\; a \prec_S b$$

并额外约束与 `hb` 兼容（$a \xrightarrow{hb} b \Rightarrow a \prec_S b$）。这正是 `seq_cst` 比 acquire/release 更强也更贵的原因：硬件需要维护一个全局可见的顺序点（x86 上体现为 MFENCE 或 LOCK 指令，ARM 上体现为带 `stlr`/`ldar` 的全序约束与必要屏障）。

可以形式化地说明哪些 litmus 结果被禁止。经典的「store buffering」在 `seq_cst` 下不允许 $(0,0)$，而在 relaxed 下允许；「message passing」在 release/acquire 下不允许「看到旗标却看不到数据」，而全 relaxed 允许。

## 四、代码实现

```cpp
#include <atomic>
#include <thread>

// 1) 发布—订阅：release/acquire 建立 happens-before，足够且比 seq_cst 便宜
std::atomic<int>  g_flag{0};
int               g_data = 0;          // 普通变量，靠 hb 保护

void writer() {
    g_data = 42;                                        // 普通写
    g_flag.store(1, std::memory_order_release);         // 释放：其前写不可后移
}

int reader() {
    while (g_flag.load(std::memory_order_acquire) == 0) { }  // 获取
    return g_data;                                      // 必然读到 42
}

// 2) 自旋锁：acquire 取锁、release 放锁；acq_rel 用于 RMW
class SpinLock {
    std::atomic_flag f_ = ATOMIC_FLAG_INIT;
public:
    void lock() {
        while (f_.test_and_set(std::memory_order_acquire)) { }  // 忙等
    }
    void unlock() {
        f_.clear(std::memory_order_release);
    }
};

// 3) 无锁 CAS 计数：weak 允许伪失败，循环中通常更高效
bool try_increment_if_less(std::atomic<int>& a, int limit) {
    int cur = a.load(std::memory_order_relaxed);
    while (cur < limit) {
        if (a.compare_exchange_weak(cur, cur + 1,
                                    std::memory_order_acq_rel,   // 成功序
                                    std::memory_order_relaxed))  // 失败序
            return true;
        // 失败时 cur 已被更新为当前值，可直接重试
    }
    return false;
}

// 4) 屏障：atomic_thread_fence 与原子操作配对使用时需注意语义差异
void fence_example(std::atomic<int>& x, std::atomic<int>& y) {
    x.store(1, std::memory_order_relaxed);
    std::atomic_thread_fence(std::memory_order_release);  // 使其前所有写成为"释放"
    y.store(1, std::memory_order_relaxed);
}
```

工程要点：`is_lock_free()` / `is_always_lock_free` 应被检查——某些平台上 64 位或 128 位原子的实现依赖内部锁；`std::atomic_ref`（C++20）让已有对象临时获得原子语义，代价是必须保证生命周期内没有非原子访问并发；`wait/notify_one/notify_all`（C++20）为原子对象提供高效的阻塞等待，避免纯自旋的功耗与争用。此外，原子对象初始化后不可再拷贝，嵌入结构体时要注意对齐与布局。

## 五、与其他技术对比

| 机制 | 原子性 | 跨线程顺序 | 可移植性 | 典型用途 |
| --- | --- | --- | --- | --- |
| 普通变量 + 锁 | 由锁保证 | 由锁保证 | 好 | 通用临界区 |
| `volatile` | 无 | 无 | 好（但语义被误用） | MMIO、信号处理 |
| `std::atomic` relaxed | 有 | 无 | 好 | 统计计数、标记位 |
| acquire/release | 有 | 单向（配对后双向） | 好 | 发布订阅、自旋锁 |
| `seq_cst` | 有 | 全局总序 | 好 | 需要 SC 直觉的算法 |
| 手写 asm fence | 有（配合原子指令） | 可控 | 差（需分平台） | 内核、极底层优化 |

## 六、常见误区

1. 认为 `atomic` 默认 `seq_cst` 就是最优：多数场景 release/acquire 足够，且能显著降低屏障成本。
2. 认为 relaxed 访问是线程安全的：relaxed 只保证原子性与单变量的修改序，不建立 happens-before，跨变量数据流动仍需 acquire/release。
3. 用 `compare_exchange_weak` 却不在循环中使用：伪失败会导致逻辑错误地失败返回。
4. 忘记 CAS 的 ABA 问题：值回到原值不会被察觉，需要版本号（如打包指针+计数）或禁用回收（如 hazard pointer/RCU）。
5. 认为 `volatile` 可以替代 `atomic`：`volatile` 不保证原子性、不建立 happens-before，也不阻止 CPU 重排。
6. 在同一原子对象上混用不同序却不理解后果：混合是合法的，但顺序保证由「最弱的那次」支配，容易产生难以推理的边界行为。

## 七、与开源书·权威来源对应

- ISO/IEC 14882（C++ 标准）：`[atomics.order]`、`[intro.races]` 等章节定义 happens-before 与 memory_order 语义。
- cppreference：`std::atomic`、`std::memory_order`、`std::atomic_ref` 的实用参考。
- Boehm & Adve 等关于 C++ 内存模型设计的论文：DRF-SC、依赖序与 consume 的取舍。
- Bryant & O'Hallaron《CSAPP》：并发与存储层次基础。
- Herlihy & Shavit《The Art of Multiprocessor Programming》：无锁算法与 CAS 的构造与正确性。
- Linux 内核文档（memory-barriers.txt、RCU 相关文档）：工业级内存序实践与常见错误。

## 八、面试题

1. 问：为什么「无数据竞争」这么重要？答：DRF-SC 保证——程序若不含数据竞争，则 seq_cst 语义下的观察结果与顺序一致执行等价，程序员可按 SC 直觉推理；含竞争的程序行为是未定义的。
2. 问：release/acquire 相比 seq_cst 少了什么？答：缺少所有 seq_cst 操作共享的全局总序，因此不能表达「跨多个变量的全局偏好顺序」（如 Dekker 型算法、部分需要 SC 的 litmus 结果）。
3. 问：`compare_exchange_weak` 为什么要放在循环里？答：它允许伪失败（即使值匹配也可能返回 false），循环可以把伪失败当普通失败重试，从而在 LL/SC 类架构上生成更高效率的代码。
4. 问：relaxed 计数器的语义边界在哪？答：只保证自增不丢失与单变量的修改序；如果计数器用来指示「另一个数据结构已就绪」，必须用 release/acquire 建立 happens-before。
5. 问：`atomic_thread_fence` 与原子操作自带序有何区别？答：fence 不作用于单个原子对象，而是把「其前的全部写」或「其后的全部读」整体变为释放/获取侧；在配对时可以与 relaxed 原子操作组合使用，但语义更容易写错。

## 九、演进与趋势

- `atomic_ref`（C++20）：让既有对象在受限生命周期内获得原子访问，便于把原子语义引入已有数据结构。
- 等待/通知接口（C++20）：`atomic::wait/notify_*` 提供了无锁但可阻塞的等待，减少纯自旋的能耗与争用。
- `consume` 的实际退场：标准与主流实现普遍将 consume 视为 acquire 或建议避免，依赖序的收益在工程上难以稳妥获得。
- 无锁与内存回收的工程化：hazard pointer、epoch-based reclamation、RCU 等方案配合原子操作，构成现代无锁数据结构的基础设施。
- 编译器与硬件的协同验证：内存模型的一致性测试（litmus for C++）与工具链检查被纳入持续集成，避免编译器重排破坏原子语义。

## 十、小结

C++ 内存模型把 x86、ARM、POWER 的差异抽象为六档内存序与一套 happens-before 关系：`relaxed` 只给原子性，`release/acquire` 给单向顺序并可配对建立跨线程因果，`seq_cst` 额外提供全局总序。写并发代码的正确姿势是：先用原子或锁消除数据竞争（拿到 DRF-SC 保证），再在真正需要跨线程传递数据的地方使用尽可能弱但够用的内存序——既保证正确性，又不为多余的屏障付费。
