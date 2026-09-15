# 内存屏障与 fence 语义

> 对应 Linux 内核 Documentation/memory-barriers.txt（真实内核文档）与 Intel SDM 卷 3 内存排序章节，以及 Adve & Gharachorloo 1996 弱内存模型教程。

## 一、背景与挑战

编译器和 CPU 都会为了提高性能而重排访存指令：编译器做指令调度与公共子表达式消除，CPU 做乱序执行与写缓冲。绝大多数情况下重排是不可见的，但并发算法依赖「先写数据、后置旗标」这类顺序假设，一旦被重排，其他核就可能看到「旗标已置而数据未就绪」的中间状态。

内存屏障（memory barrier / fence）就是用来强制部分顺序的指令：它本身不搬运数据，只约束「屏障之前的哪些访问必须对屏障之后的哪些访问有序」。难点在于三层重排来源必须分别处理——编译器的优化重排、CPU 的乱序与缓冲、以及缓存一致性协议带来的可见性延迟；屏障只解决前两者中的顺序问题，无法单独解决「数据何时真正到达其他核缓存」的问题（那由一致性协议与缓存层次决定）。

## 二、核心原理

从「两个方向 × 两类访问」出发，共有四类基本屏障：

- LoadLoad：前面的读对后面的读有序。
- LoadStore：前面的读对后面的写有序。
- StoreStore：前面的写对后面的写有序。
- StoreLoad：前面的写对后面的读有序，通常是四类中代价最高的（需要排空写缓冲，甚至等待失效确认）。

x86 的对应指令：`lfence`（LoadLoad 与调度串行化）、`sfence`（StoreStore，主要针对写合并/非临时存储）、`mfence`（全四类）。由于 x86 只在 StoreLoad 上放松，大多数场景下 `lfence`/`sfence` 并非必需，只有 `mfence`（或等价的 LOCK 前缀指令）才带来实质性约束。

ARM 的 `DMB` 按「方向 + 共享域」细分（如 DMB ISH 全方向、DMB ISHLD 偏读方向、DMB ISHST 偏写方向），`DSB` 则额外等待之前的访存真正完成（更强，常用于页表修改、缓存维护），`ISB` 是流水线同步（用于指令流变更后的重新取指）。POWER 的对应指令包括 `lwsync`（轻量同步，覆盖除 StoreLoad 外的组合）、`hwsync`（全屏障）与 `eieio`（有序 I/O 访问）。

编译器屏障与 CPU 屏障必须分开看：`__asm__ __volatile__("" ::: "memory")` 只阻止编译器跨它重排访存，不生成任何 CPU 指令；反过来，CPU 屏障指令对编译器通常也是不可跨越的（编译器会保守处理），但在 Linux 内核里这两者被显式区分（`barrier()` 与 `smp_mb()`）。因此正确写法是「编译器屏障 + CPU 屏障」匹配具体需求。

## 三、形式化与数学基础

设可重排关系为 $\prec_{ro}$（硬件与编译器可观察到的乱序），屏障 $B$ 把访问序列切分为 $A$ 与 $C$：

$$A;\, B;\, C \;\Longrightarrow\; \neg\left(a \prec_{ro} c\right) \quad \forall a \in A,\, c \in C \text{（受该屏障方向约束的组合）}$$

对具体屏障的语义（以 x86 为例，$\prec_m$ 为全局内存序）：

$$\text{lfence: } load(a) \prec_{po} load(b) \Rightarrow a \prec_m b$$
$$\text{sfence: } store(a) \prec_{po} store(b) \Rightarrow a \prec_m b$$
$$\text{mfence: } a \prec_{po} b \Rightarrow a \prec_m b \quad \text{（对所有访问组合）}$$

弱化到「获取—释放」语义时，需要的顺序大幅减少。对锁实现，只需：

$$W_{data} \prec_{po} \text{release}(lock) \;\Rightarrow\; \text{release 前的写对获取者可见}$$
$$\text{acquire}(lock) \prec_{po} R_{data} \;\Rightarrow\; \text{获取后的读不早于获取}$$

即栅栏只需单向（释放只约束前面的写，获取只约束后面的读），这就是 acquire/release 比全屏障便宜的原因：在全屏障下需要「排空写缓冲 + 等待失效确认」的双向代价，而单向栅栏在很多微架构上只需本地重排约束。

## 四、代码实现

```c
/* Linux 内核风格的屏障使用：
   1) 编译器屏障：阻止编译器重排，不生成 CPU 指令
   2) smp_* 屏障：多核场景下的 CPU 屏障，单核编译时退化为编译器屏障
   3) READ_ONCE/WRITE_ONCE：防止撕裂读与编译器"刻意"的访问优化 */
#define barrier()        __asm__ __volatile__("" ::: "memory")
#define smp_mb()         __atomic_thread_fence(__ATOMIC_SEQ_CST)
#define smp_rmb()        __atomic_thread_fence(__ATOMIC_ACQUIRE)
#define smp_wmb()        __atomic_thread_fence(__ATOMIC_RELEASE)

static int data;
static int ready;

void publish(void) {
    WRITE_ONCE(data, 42);
    smp_wmb();             /* StoreStore：data 必须先于 ready 可见 */
    WRITE_ONCE(ready, 1);
}

int consume(void) {
    while (!READ_ONCE(ready)) { }   /* 自旋等待发布 */
    smp_rmb();                      /* LoadLoad：ready 的读先于 data 的读 */
    return READ_ONCE(data);         /* 必然读到 42 */
}
```

```c
/* 常见的"双屏障"场景：一端写完后置旗标，另一端看到旗标后读数据。
   若希望两侧都无懈可击，跨端需要互相匹配的一对屏障：
   生产者用 wmb（或 release store），消费者用 rmb（或 acquire load）。
   若生产者只做普通 store 而消费者只做普通 load，则任何一侧的单独屏障
   都不足以建立跨线程的 happens-before。 */
typedef struct { int buf[8]; int seq; } msg_t;

void producer_release(msg_t *m) {
    for (int i = 0; i < 8; i++) m->buf[i] = i;
    __atomic_store_n(&m->seq, 1, __ATOMIC_RELEASE);   /* 释放：一次性建立顺序 */
}

int consumer_acquire(msg_t *m) {
    if (__atomic_load_n(&m->seq, __ATOMIC_ACQUIRE) != 1) return -1;
    return m->buf[7];                                  /* 保证读到 7 */
}
```

实践要点：屏障必须「成对且同向」才有意义——一个 release 必须与某个 acquire 配对（读取同一原子变量且读到该 release 写入的值），否则不建立 happens-before；自愿插入的「多余屏障」不会增加正确性，只会降低性能。另外，屏障只能排序，不能替代原子性：对超过机器字宽的数据结构，仍需锁或其他原子手段保证不撕裂。

## 五、与其他技术对比

| 机制 | 约束对象 | 生成 CPU 指令 | 主要用途 | 代价 |
| --- | --- | --- | --- | --- |
| `asm volatile("" ::: "memory")` | 仅编译器 | 否 | 阻止编译器跨点重排 | 极低 |
| `volatile` 变量 | 仅编译器（不保证多核顺序） | 否 | MMIO、信号处理 | 极低但语义被误用 |
| acquire / release 原子操作 | 单向顺序 | 是（轻量） | 锁、发布订阅 | 低 |
| LoadLoad/StoreStore 屏障 | 单向 | 是 | 无锁队列入队/出队 | 低—中 |
| 全屏障 MFENCE / DMB ISH | 双向全部 | 是 | 通用正确性兜底 | 高 |
| DSB / 缓存维护 | 等待完成 | 是 | 页表修改、DMA 同步 | 很高 |

## 六、常见误区

1. 认为一个屏障能解决所有重排：必须匹配具体方向（读—读、写—写、写—读），语义不匹配等于没加。
2. 认为屏障保证「时间上的先后」：屏障只保证顺序，不保证速度；数据可见性仍需一致性协议完成失效与转发。
3. 混淆编译器屏障与 CPU 屏障：前者不产生指令，无法阻止 CPU 乱序；后者不阻止编译器优化，二者必须配套。
4. 用 `volatile` 代替原子与屏障：`volatile` 不保证原子性、不建立 happens-before，也不能阻止 CPU 重排。
5. 在锁内部还大量插入全屏障：这是典型的性能反模式，屏障只应在必要的同步边界出现。
6. 忽视「屏障必须配对」：单方面的 wmb 若无对应的 rmb/acquire 读取同一变量，无法建立跨线程顺序。

## 七、与开源书·权威来源对应

- Linux 内核 Documentation/memory-barriers.txt：屏障分类、配对规则与大量反例（最实用的权威材料之一）。
- Intel SDM 卷 3：LFENCE/SFENCE/MFENCE 的语义与排序保证。
- ARM ARM 与 ARM 架构参考：DMB/DSB/ISB 的方向与共享域语义。
- Adve & Gharachorloo, Shared Memory Consistency Models: A Tutorial（1996）：弱模型下屏障的角色与形式化分类。
- Bryant & O'Hallaron《CSAPP》：并发与存储层次的行为基础。
- Herlihy & Shavit《The Art of Multiprocessor Programming》：正确同步原语的构造与推理。

## 八、面试题

1. 问：为什么有时需要两个屏障？答：生产者侧需约束「写数据 → 置旗标」（写—写方向），消费者侧需约束「读旗标 → 读数据」（读—读方向），方向不同，必须各加一个对应的屏障或使用 release/acquire 配对。
2. 问：屏障能保证数据立刻可见吗？答：不能。屏障只建立顺序约束；数据能否被读到还取决于缓存一致性协议是否完成失效与转发，屏障保证的是「不会出现顺序颠倒的观察」。
3. 问：`volatile` 与原子操作的区别？答：`volatile` 只禁止编译器优化该访问，不保证原子性与跨线程顺序；原子操作同时提供原子性、内存序控制与（在 C/C++ 中的）可移植语义。
4. 问：全屏障为什么昂贵？答：它通常需要排空写缓冲并等待此前写的失效确认（StoreLoad 方向），抑制了流水线与内存级并行，在争用路径上代价尤其明显。
5. 问：内核里 `smp_mb()` 在单核编译时做什么？答：退化为编译器屏障，因为单核场景下不存在跨核观察问题，无需生成硬件屏障指令。

## 九、演进与趋势

- 语言级内存序取代手写指令：C/C++ 的 `memory_order` 与 Rust 的 `Ordering` 让屏障从「写汇编」变为「声明意图」，编译器负责映射到最优指令序列。
- 内核规范化：`READ_ONCE/WRITE_ONCE`、`smp_load_acquire/smp_store_release` 等接口把常见模式固化为不可误用的小 API。
- 形式化与自动检测：litmus 测试、模型检查与编译器测试（如把内存模型编译结果与公理模型对比）成为验证屏障正确性的标准手段。
- 硬件弱化与依赖序：ARM/POWER 提供地址依赖、数据依赖与控制依赖的天然顺序，语言层面通过「依赖序」类语义尝试利用，但工程上普遍建议保守使用 acquire/release。
- 持久内存与新屏障需求：`clwb/clflush` 与持久化栅栏（如 sfence 配合）把屏障讨论扩展到「持久化顺序」维度。

## 十、小结

内存屏障是并发正确性的「胶水」：它不搬运数据，只规定哪些访问不能互相跨越。掌握三点即可避免绝大多数错误——区分编译器屏障与 CPU 屏障、按方向选择屏障类型（优先用 acquire/release 而非全屏障）、确保屏障成对且作用于同一原子变量。至于可见性、原子性与一致性，仍分别由缓存一致性协议、原子指令与内存模型来保障，屏障只是把它们正确串起来的那一环。
