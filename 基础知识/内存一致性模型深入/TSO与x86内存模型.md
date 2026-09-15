# TSO 与 x86 内存模型

> 对应 Intel SDM 卷 3「Memory Ordering」章节（厂商手册，真实来源），以及 Owens、Sarkar & Sewell 的 x86-TSO 形式化模型（2009）。

## 一、背景与挑战

x86 采用总存储顺序（Total Store Order, TSO），可以理解为「顺序一致性（SC）减去一项放松」：只允许较晚的读越过较早的写（StoreLoad 重排），其余三种组合（LoadLoad、LoadStore、StoreStore）严格保序。这个折中让 x86 既能在硬件上保留写缓冲（加速 store），又比 ARM/POWER 的弱内存模型对程序员友好得多。

问题在于这份「友好」是隐式的：大量 x86 上运行的并发代码并没有显式同步，只是碰巧因为 TSO 的强约束而正确。一旦移植到弱内存平台（ARM、RISC-V 弱序模式、POWER），这些隐藏的 StoreLoad 依赖就会暴露成难以复现的 bug。另一个挑战是 x86 的排序规则分散在多个机制里：TSO 基本规则、MFENCE/SFENCE/LFENCE 的作用范围、LOCK 前缀的隐含语义、非临时存储（non-temporal store）的弱化、以及字符串指令与 CLFLUSH 等特殊指令的排序行为。

## 二、核心原理

TSO 的硬件实现模型：每个核有一个 FIFO 写缓冲（store buffer）。本地 store 先进入写缓冲，稍后才写入（并广播失效给）缓存层次。本地 load 可以「绕过」自己尚未提交的 store 直接访问缓存：

- 若 load 命中自己写缓冲中的同一地址 → 前递（store-to-load forwarding）得到最新值，符合单线程直觉。
- 若 load 访问其他地址 → 可能读到其他核的较新值，同时自己缓冲中的写尚未对其他核可见，于是全局看来「读发生在写之前」——这就是 StoreLoad 重排。

在多核层面，TSO 的全局顺序由缓存一致性协议（MESI 类）保证：对每个地址存在唯一的写顺序（写串行化），且所有核观察到同一顺序。TSO 额外要求：

1. LoadLoad 有序：一个核不会先读新地址再读旧地址（等价于不允许读—读乱序）。
2. LoadStore 有序：读不会被延迟到后面的写之后（对同一核观察者而言）。
3. StoreStore 有序：写按程序序对其他核可见（写缓冲是 FIFO）。
4. StoreLoad 无序：较晚的读可以先于较早的写对其他核可见。

指令层面的语义：

- SFENCE：使前面的 store 对后继 store 有序（主要用于非临时存储与写合并缓冲）。
- LFENCE：使前面的 load 对后继 load 有序（现代 x86 上 LFENCE 是调度串行化指令，语义强于纯排序）。
- MFENCE：全屏障，阻止所有四类重排。
- LOCK 前缀的读—改—写指令（如 LOCK XADD、XCHG）：既是原子操作，又充当全序屏障，往往是实现临界区的最经济手段。

## 三、形式化与数学基础

TSO 允许的唯一重排（地址不同、无同步时）：

$$W_1;\, R_2 \;\Longrightarrow\; R_2 \text{ 可先于 } W_1 \text{ 全局可见}$$

被禁止的重排：

$$R;R,\quad R;W,\quad W;W$$

程序序（program order）与内存序（memory order）的关系可写为：存在一个全局内存序 $\prec_m$，使得对每个核 $i$：

$$\forall a, b:\ (a \prec_{po(i)} b) \wedge \neg(store(a) \wedge load(b)) \;\Rightarrow\; a \prec_m b$$

即除「store 后接 load」这一对之外，程序序都提升为内存序。若 $store(a) \prec_{po} load(b)$ 且两者地址不同，则 $a,b$ 在 $\prec_m$ 中可任意排布。把这一条件叠加到一致性协议的单地址写序（per-location total order）上，就得到完整的 x86-TSO 公理系统。

经典 litmus 测试「Store Buffering」在 TSO 下是允许出现 $(0,0)$ 结果的：

$$\text{初始 } x=y=0;\quad \text{核1: } x{=}1;\, r_1{=}y;\quad \text{核2: } y{=}1;\, r_2{=}x$$

两个核的读都能绕过各自的写缓冲，因此 $r_1{=}r_2{=}0$ 是合法结果；若把每个 store 换成 LOCK 前缀或在其后插入 MFENCE，则该结果被禁止。这类测试是验证内存模型实现是否正确的标准手段。

## 四、代码实现

```c
/* x86 TSO 下典型的发布—订阅模式：
   注意 sfence 只能管住 store 之间的顺序，
   发布点需要用 mfence / release 存储 / LOCK 指令才能禁止 StoreLoad 重排 */
volatile int data = 0;
volatile int flag = 0;

static inline void mfence(void) { __asm__ __volatile__("mfence" ::: "memory"); }

void producer(void) {
    data = 42;                 /* 普通 store，可能滞留在写缓冲 */
    mfence();                  /* 全屏障：禁止后面的读越过前面的写 */
    flag = 1;                  /* 其他核看到 flag==1 时必然能看到 data==42 */
}

int consumer(void) {
    while (!flag) { }          /* 自旋等待（实际应加 pause 降低功耗与冲突） */
    mfence();                  /* 保证后续读不被提前 */
    return data;               /* 必然返回 42 */
}
```

```asm
; 用 LOCK 前缀的读-改-写指令实现"原子操作 + 全屏障"双效：
; 相比 mfence，LOCK 指令通常不需要额外的总线锁（仅在必要时回退到锁总线）
    mov     eax, 0
    lock xadd [counter], eax     ; 原子取加，且隐含全序屏障语义
    mfence                       ; 若需要显式的全屏障，可另行加一条
    mov     ebx, [shared_ptr]
```

几个实现细节值得记住：其一，`xchg` 指令即使不加 LOCK 前缀也隐含锁定语义；其二，非临时存储（movnti/movntdq）走写合并缓冲，其顺序由 SFENCE 约束，因此 `mfence` 与 `sfence` 在存在 NT 存储时不能互相替代；其三，自旋等待应插入 `pause` 指令，减少流水线冲刷与总线争用；其四，`clflush` 可显式使某缓存行失效，用于持久内存的持久化与显式同步场景。

## 五、与其他技术对比

| 维度 | SC（顺序一致） | TSO（x86） | ARMv8 弱序 | POWER |
| --- | --- | --- | --- | --- |
| StoreLoad | 有序 | **可重排** | 可重排 | 可重排 |
| LoadLoad / StoreStore | 有序 | 有序 | 可重排（除依赖） | 可重排 |
| LoadStore | 有序 | 有序 | 可重排 | 可重排 |
| 获取语义实现 | 天然 | 普通 load 即可 | LDAR / acquire load | lwsync / acquire |
| 释放语义实现 | 天然 | 普通 store 即可 | STLR / release store | lwsync / release |
| 全屏障指令 | 不需要 | MFENCE / LOCK | DMB ISH | hwsync |
| 同步代价 | 高（无写缓冲） | 中 | 低（仅同步点付费） | 低 |

## 六、常见误区

1. 认为 x86 就是 SC：TSO 允许 StoreLoad 重排，双线程「旗标 + 数据」若不加屏障，仍可能出现读者看到旗标未见数据。
2. 认为单线程里重排不可见就无关紧要：重排的影响体现在其他核的观察上，本核由于前递（forwarding）几乎感知不到。
3. 认为 `volatile` 能解决并发：`volatile` 只禁止编译器优化，不生成 CPU 屏障，也不保证原子性。
4. 用 `sfence` 当作全屏障：`sfence` 只约束 store 之间的顺序，不能阻止后续 load 越过前面的 store。
5. 认为屏障越多越安全：多余的全屏障会显著降低吞吐，尤其在高争用自旋锁路径上。
6. 忽略 NT 存储与写合并缓冲：它们走不同的排序通道，屏障需求与普通 store 不同。

## 七、与开源书·权威来源对应

- Intel SDM 卷 3：《Memory Ordering》《Multiple-Processor Management》等章节给出 TSO 规则、MFENCE/LOCK 语义与自旋锁建议。
- Owens, Sarkar & Sewell, x86-TSO: A Rigorous and Usable Programmer's Model for x86 Multiprocessors（2009）：TSO 的公理化与操作语义模型。
- Adve & Gharachorloo, Shared Memory Consistency Models: A Tutorial（1996）：弱模型分类与形式化框架。
- Bryant & O'Hallaron《CSAPP》：并发编程、内存与缓存的行为基础。
- 富田《Computer Architecture》类教材与 Patterson & Hennessy：多核与存储层次。
- Linux 内核 Documentation/memory-barriers.txt：内核视角的屏障规则与常见错误示例。

## 八、面试题

1. 问：TSO 唯一允许的重排是什么？答：StoreLoad——较晚的读可以越过较早的写先被其他核观察到；其余 LoadLoad、LoadStore、StoreStore 均保序。
2. 问：为什么 x86 程序员容易写出不可移植的并发代码？答：TSO 隐式保证了除 StoreLoad 之外的顺序，代码在 x86 上碰巧正确；移植到 ARM/POWER 后缺失的 acquire/release 才会显形。
3. 问：MFENCE 与 LOCK 前缀有何异同？答：两者都能提供全序屏障语义；LOCK 指令同时完成原子读—改—写，因此在实现锁或计数器时更经济，可能在极端情况下退化为锁总线。
4. 问：SFENCE 什么时候是必须的？答：当使用非临时存储（写合并缓冲）时，需要用 SFENCE 保证这些写对其他核按序可见；普通 store 的顺序由 TSO 与一致性协议保证。
5. 问：如何检测代码是否依赖了 TSO 的隐含假设？答：用 litmus 工具或跨平台（x86 与 ARM）压力测试，并检查所有跨线程共享点是否有 acquire/release 或等价屏障。

## 九、演进与趋势

- 语言级内存模型成为主流：C/C++ 原子操作与 Rust 的 `Ordering` 把平台差异封装，鼓励用 acquire/release 取代裸 `mfence`。
- 内核侧规范化：Linux 用 `smp_mb()/smp_rmb()/smp_wmb()/READ_ONCE()/WRITE_ONCE()` 表达意图，避免直接写平台指令。
- 弱化趋势：随着 Arm 与 RISC-V 在服务器端崛起，跨平台代码必须以最弱模型为安全下界，x86 的强约束不再是「免费午餐」。
- 形式化验证工程化：litmus 测试与模型检查工具（如 herd7）已被用于验证内核同步原语与编译器优化。
- 持久内存带来的新排序维度：NT 存储与 `clwb/clflush` 的持久化顺序，扩展了传统 TSO 讨论的边界。

## 十、小结

x86-TSO 是「性能与易用性」的历史折中：保留 FIFO 写缓冲与 store-to-load 前递以换取写吞吐，同时只放弃 StoreLoad 一项顺序。理解这一点，就能解释为什么 x86 上的双线程发布—订阅在缺少屏障时仍会失败，也能明白为什么可移植的并发代码必须在所有共享同步点显式表达 acquire/release 语义——TSO 只是特例，不是标准。
