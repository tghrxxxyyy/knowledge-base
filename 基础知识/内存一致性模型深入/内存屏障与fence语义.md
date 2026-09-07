# 内存屏障与 fence 语义

> 对应 Linux 内核 Documentation/memory-barriers.txt 与 Intel SDM。

## 一、背景与挑战
编译器与 CPU 都会重排指令以提升性能，但并发算法依赖特定顺序。内存屏障（fence/barrier）是强制部分顺序的指令，阻止跨屏障的重排。

## 二、核心原理
四类基本屏障：LoadLoad、StoreStore、LoadStore、StoreLoad。x86 的 lfence/sfence/mfence 分别或组合覆盖；ARM 的 DMB 按方向/域细分。编译器屏障（如 `asm volatile("":::"memory")`）阻止编译器重排。

## 三、形式化与数学基础
设屏障 $B$ 分隔操作序列：
$$A; B; C \Rightarrow A \not\prec_{reorder} C$$
其中 $\prec_{reorder}$ 表示可被硬件/编译器重排。sfence 保证其前 store 全局先于其后 store 可见。

## 四、代码实现
```c
// 双线程握手需要全屏障
volatile int a = 0, b = 0;
// 线程1
a = 1; __atomic_thread_fence(__ATOMIC_SEQ_CST); b = 1;
// 线程2
while (!b) {}
__atomic_thread_fence(__ATOMIC_SEQ_CST);
// 此后 a 必为1 (若b读到1)
int r = a;
```

## 五、与其他技术对比
原子操作自带屏障（acquire/release）更精准；裸 fence 力度粗、易过度约束。编译器屏障不影响 CPU，CPU 屏障不影响编译器。

## 六、常见误区
误以为一个 barrier 解决所有：需匹配重排类型。误以为 barrier 保证可见时序等于程序序（还需缓存一致性）。

## 七、与开源书/权威来源对应
Linux memory-barriers.txt；Intel SDM §8.2.5；C++ 标准 fence。

## 八、面试题
问：为何有时需要两个 barrier？答：读写两侧各需阻止对应方向重排。

## 九、演进与趋势
依赖语言级原子语义减少手工 barrier，降低出错面。

## 十、小结
屏障是并发正确性的"胶水"，理解其方向与粒度才能写出既正确又高效的并发代码。
