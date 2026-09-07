# C++ 内存模型与原子操作

> 对应 C++11 标准内存模型（ISO/IEC 14882）及 cppreference 文档。

## 一、背景与挑战
C++11 首次在语言层定义多线程与原子语义，统一了 x86/ARM/POWER 差异。程序员用 memory_order 显式表达同步意图，编译器/硬件据此插入最少屏障。

## 二、核心原理
提供 relaxed、consume、acquire、release、acq_rel、seq_cst 六档序。seq_cst 等同 SC；acquire/release 构成 RC；relaxed 仅保证原子性不保序。原子 RMW（fetch_add 等）可带 acq_rel。

## 三、形式化与数学基础
happens-before 关系由同步操作建立：
$$release(x) \text{ 与 } acquire(x) \text{ 同值配对} \Rightarrow write \xrightarrow{hb} read$$
data race 自由程序（DRF）在 seq_cst 下等价于 SC 执行。

## 四、代码实现
```c
#include <atomic>
std::atomic<int> flag{0};
std::atomic<int> data{0};
void writer() {
    data.store(42, std::memory_order_relaxed);
    flag.store(1, std::memory_order_release); // 释放
}
void reader() {
    while (!flag.load(std::memory_order_acquire)) {} // 获取
    int v = data.load(std::memory_order_relaxed);     // 读到42
}
```

## 五、与其他技术对比
裸 volatile 不保证跨线程顺序与原子性；C++ 原子在语言层给出可移植保证。相比手写 asm fence，内存序更精确、可移植。

## 六、常见误区
误以为 atomic 默认 seq_cst 最优：release/acquire 常足够且更快。误以为 relaxed 访问线程安全：不建立 happens-before。

## 七、与开源书/权威来源对应
C++ 标准内存模型；cppreference；Linux 内核 RCU 文档类比。

## 八、面试题
问：data race free 为何重要？答：DRF 程序 seq_cst 等价于 SC，可推理。

## 九、演进与趋势
C++20 引入 atomic_ref、可停顿原子，进一步细化。

## 十、小结
C++ 内存模型把硬件差异抽象为六种序，是用最少同步成本换取可移植并发正确性的标准方案。
