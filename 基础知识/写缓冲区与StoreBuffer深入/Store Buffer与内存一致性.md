# Store Buffer与内存一致性

> 对应 Lamport 1979「How to Make a Multiprocessor Computer That Correctly Executes Multiprocess Programs」与 Intel SDM 卷3「Memory Ordering」。

## 一、背景与挑战

写缓冲（store buffer）让 store 的全局可见性被延迟：本核的 store 一旦进入缓冲即算「完成」，流水线继续执行，但其它核对同一地址仍可能读到旧值。这直接破坏了顺序一致性（sequential consistency, SC）所要求的「所有处理器看到同一个全局操作顺序」。

矛盾在于：顺序一致性最符合直觉却最慢；完全放松又让编程困难。于是各架构定义了自己的内存模型，在性能与可推理的语义之间取折中。

## 二、核心原理

x86 采用总存储有序（TSO, Total Store Order）：

- 允许 store→load 重排：一个核的 load 可以越过尚未刷出的较早 store，先读到别的地址。
- 保留 store→store、load→load、load→store 顺序。
- 每个核有一个 FIFO 写缓冲，store 先入缓冲，读时若命中缓冲中待写条目则前递（store-to-load forwarding）本核最新值。
- 写缓冲深度有限，满时 store 需等待刷出，从而对上游流水线产生反压。

弱内存模型（ARM、POWER）允许更多重排，需要显式屏障才能获得 TSO 级别的顺序。编程语言的 acquire/release 语义即是对这些差异的抽象。

## 三、形式化与数学基础

顺序一致性要求存在一个全序 $\prec$，使所有处理器的操作按程序顺序嵌入其中，且每个读读到全序中最近的同地址写。

TSO 只放松一条：允许较晚的 load 越过较早的 store 的「全局可见」，但本核仍通过前递看到自己的写。

$$S_i \xrightarrow{\text{program order}} L_j \;\Rightarrow\; L_j \text{ 可在 } S_i \text{ 对全局可见前完成}$$

形式化地，TSO 满足：

$$\forall i,j:\; (S_i \prec_{po} S_j) \Rightarrow (S_i \prec_{mem} S_j),\quad (L_i \prec_{po} L_j) \Rightarrow (L_i \prec_{mem} L_j)$$

而唯一的例外是 $L_i \prec_{po} S_j$ 时 $L_i$ 与 $S_j$ 的全局次序可交换。

## 四、代码实现

经典的消息传递（Dekker/Peterson 风格）在 TSO 下必须显式排序，否则 store 可能滞留在写缓冲中，对端读不到。

```c
// 共享变量：int data = 0; atomic_int flag = 0;
// 生产者
data = 42;                       // 普通 store
atomic_store_explicit(&flag, 1, memory_order_release); // 释放语义：此前写先可见

// 消费者
while (atomic_load_explicit(&flag, memory_order_acquire) == 0) {}
// 此处保证能看到 data == 42
```

用 C11/C++11 的 release/acquire 而非裸 `volatile`，才能表达「写缓冲刷出顺序」的意图。

## 五、与其他技术对比

| 内存模型 | 允许的重排 | 典型架构 | 编程负担 |
| --- | --- | --- | --- |
| SC（顺序一致） | 无 | 理论/教学 | 最低 |
| TSO | store→load | x86、SPARC | 中等 |
| 弱序（relaxed） | 读读/读写/写读/写写 | ARM、POWER | 最高 |

C++/Java 的内存模型在语言层给出统一抽象，编译器把它编译为各架构的屏障或带序原子指令。

## 六、常见误区

- 误区一：C 代码的顺序就是内存可见顺序。编译器和 CPU 都可能在模型允许下重排，跨线程共享必须用原子或屏障表达。
- 误区二：`volatile` 能替代原子。`volatile` 只约束编译器，不约束 CPU 重排，也无法保证原子性。
- 误区三：x86 是顺序一致。x86 是 TSO，store 的全局可见可被延迟，只是不重排 store→store。
- 误区四：屏障越多越安全。多余屏障显著拖慢流水线，应只在真实顺序约束点插入。

## 七、与开源书·权威来源对应

- Lamport, L. (1979) 对顺序一致性的经典定义。
- Intel SDM 卷3「Memory Ordering」章节对 TSO 的规定。
- Sorin, Hill & Wood《A Primer on Memory Consistency and Cache Coherence》，系统化讲解 SC 与 TSO。
- ARM Architecture Reference Manual 描述弱序与屏障指令。
- Boehm & Adve (2008) 关于 C++ 内存模型的论述。
- Sewell et al. (2010)「x86-TSO」形式化模型。
- Batty et al. (2011) 关于 C/C++ 内存模型数学化的讨论。

## 八、面试题

1. 为什么 x86 上的消息传递可能失败？答：store 滞留在写缓冲未刷出，对端 load 读到旧值，需释放/获取语义或屏障。
2. TSO 相比 SC 放松了哪一条？答：只放松 store→load，其余顺序保留。
3. store-to-load forwarding 的作用？答：让本核立即看到自己刚写的值，无需等待缓冲刷出。
4. 为什么弱内存模型更需要屏障？答：它允许多方向重排，必须显式声明哪些顺序不可破。
5. C++ 的 relaxed 原子能替代屏障吗？答：不能，relaxed 不提供顺序，需配 fence 或升级为 acquire/release。

## 九、演进与趋势

语言级内存模型（C11/C++11 的 relaxed/acquire/release/seq_cst、Java JMM）把架构差异抽象为可移植语义，程序员不再直接面对 SFENCE/DMB 的细节。硬件侧则在 TSO 之上叠加更细粒度的序控制，并研究在保证可推理性的同时进一步提性能，具体细节以各架构官方最新文档为准。

## 十、小结

Store buffer 提升写吞吐，却以放松全局一致性为代价。理解 SC 与 TSO 的差异、理解「写缓冲延迟可见」这一根因，是判断何时需要屏障、何时需要原子操作的基础。

实践上，跨线程共享优先使用语言级原子语义表达意图，把具体屏障的选择交给编译器与架构后端。
