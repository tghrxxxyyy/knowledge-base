# 写屏障与Store Buffer清空

> 对应 Intel SDM 卷3 中 SFENCE/MFENCE/LFENCE 的定义与 ARMv8 手册的 DMB/DSB/ISB。

## 一、背景与挑战

由于 store 可能滞留在写缓冲中，某些同步点——释放锁、发布初始化好的数据、通知完成——必须保证「此前所有写」先于「此后的同步动作」对其它核可见。若缺少排序，订阅方可能看到新标志却读到旧数据，产生难以复现的并发缺陷。

写屏障（store fence）就是为了强制写缓冲按程序顺序刷出，给这类「发布-订阅」协议提供正确性保证。

## 二、核心原理

x86 三类屏障各司其职：

- `SFENCE`：只排序写。保证在它之前的全部 store 在它之后的任何 store 之前，对其他处理器可见；不等待读完成。
- `LFENCE`：只排序读（在多数 Intel 实现中同时具有抑制推测的作用）。
- `MFENCE`：排序所有访存，是读写的全屏障。

实现上，`SFENCE` 通常等待写缓冲排空到缓存层次（store 进入缓存一致性域即可见），并不要求数据真正落到 DRAM。ARM 对应的 `DMB` 可按方向与作用域限定，`DSB` 更强，要求此前访存真正完成。

## 三、形式化与数学基础

设写序列 $S_1, S_2, \dots$，在 $S_k$ 之后插入写屏障，则对任意外部观察者，屏障前的写都排在屏障后的写之前可见：

$$\forall i \le k,\; \forall j > k:\quad visible(S_i) \prec visible(S_j)$$

用「全局可见」谓词 $V(\cdot)$ 表达即：

$$V(S_i) \prec_{hb} V(S_j) \quad \text{对一切 } i \le k < j$$

这并不约束屏障前的写之间的相对顺序（它们本就按 FIFO 刷出），也不等待 load 完成。

## 四、代码实现

发布-订阅模式中，数据先写、标志后写，并以屏障保证顺序。

```c
#include <stdatomic.h>

int data = 0;
atomic_int flag = 0;

// 发布方
void publish(void) {
    data = 42;                                    // 1. 数据
    atomic_thread_fence(memory_order_release);    // 2. 写屏障，x86 上编译为 SFENCE
    atomic_store_explicit(&flag, 1, memory_order_relaxed); // 3. 标志
}

// 订阅方
int subscribe(void) {
    while (atomic_load_explicit(&flag, memory_order_relaxed) == 0) {}
    atomic_thread_fence(memory_order_acquire);    // 4. 读屏障，x86 上常为编译屏障
    return data;                                  // 保证读到 42
}
```

在 x86 上 release 屏障常退化为编译器屏障，因为 TSO 已保留 store→store 顺序；而 acquire 侧才可能引入 `LFENCE` 或依赖 load 的天然顺序。

## 五、与其他技术对比

| 屏障 | 排序范围 | 是否等待写刷出 | 典型架构 |
| --- | --- | --- | --- |
| SFENCE | 写→写 | 是 | x86 |
| LFENCE | 读→读（含抑制推测） | 否 | x86 |
| MFENCE | 全部访存 | 是 | x86 |
| DMB | 可选方向/作用域 | 部分 | ARMv8 |
| DSB | 全部且要求完成 | 是（更强） | ARMv8 |

语言层的 release/acquire 会按架构编译为最省的屏障组合，避免手写汇编的可移植性问题。

## 六、常见误区

- 误区一：普通赋值加 `volatile` 就够了。`volatile` 只阻止编译器优化，不阻止 CPU 重排，跨核同步仍需屏障或原子。
- 误区二：屏障要越多越好。多余屏障显著拖慢流水线；应只在真实的顺序约束点插入。
- 误区三：`SFENCE` 也保证读的顺序。它只排序写，读顺序需要 `LFENCE` 或依赖数据依赖。

## 七、与开源书·权威来源对应

- Intel SDM 卷3「Memory Ordering」中 SFENCE/MFENCE/LFENCE 的排序保证。
- ARM Architecture Reference Manual 中 DMB/DSB/ISB 的作用域与选项。
- Boehm & Adve (2008)《Foundations of the C++ Concurrency Memory Model》。
- Sorin, Hill & Wood《A Primer on Memory Consistency and Cache Coherence》对 fence 的建模。

## 八、面试题

1. 为什么释放锁前需要写屏障？答：确保临界区内的写先被全局看到，再让锁标志可见，避免他人拿到锁却读到旧数据。
2. SFENCE 与 MFENCE 的区别？答：SFENCE 只排序写且不等读，MFENCE 排序全部访存。
3. 为何 release 在 x86 上可近似无操作？答：TSO 已保证 store→store 顺序，只留编译屏障即可。
4. 屏障能否替代原子？答：不能，屏障解决顺序，不解决读-改-写的原子性。

## 九、演进与趋势

C++ `std::atomic` 的 release/acquire 语义让屏障选择交给编译器与架构后端，减少手写汇编出错。ARM 的弱序模型配合 acquire/release 指令（如 `LDAR`/`STLR`）进一步减少全屏障使用；同时学术界在探索可组合、可验证的细粒度内存序，具体行为以各架构官方最新文档为准。

## 十、小结

写屏障的本质是「强制写缓冲按程序顺序刷出」，它是多核发布-订阅正确性的前提。用语言级原子语义表达意图、把屏障留给编译器，比直接编写 `SFENCE`/`DMB` 更安全。
