# 写屏障与Store Buffer清空

> 对应 Intel SDM 卷3 SFENCE 与 ARMv8 手册 DMB/DSB 指令。

## 一、背景与挑战
由于 store 可能滞留在写缓冲中，某些同步点（如释放锁、发布数据）必须保证之前的写先对其它核可见。写屏障（store fence, SFENCE）强制清空写缓冲，使之前的 store 全局有序。

## 二、核心原理
SFENCE 保证：在它之前的全部 store 在它之后的任何 store 之前，对其它处理器可见。它不等待读，只排序写。实现上通常等待写缓冲排空到缓存层次。

## 三、形式化与数学基础
对写操作序列 $S_1,S_2,\dots$，插入 SFENCE 于 $S_k$ 后，则对任意外部观察者：
$$\forall i\le k,\; j>k:\; S_i \text{ 可见} \prec S_j \text{ 可见}$$

## 四、代码实现
```c
data = 42;
flag = 1;        // 发布
asm volatile("sfence" ::: "memory"); // x86 写屏障
// 此后其它核若看到 flag，必看到 data
```

## 五、与其他技术对比
SFENCE 只排序写；MFENCE 排序所有访存；LFENCE 排序读。ARM 的 DMB 按方向（load/store）可选，DSB 更强（完成到系统）。

## 六、常见误区
误认为普通赋值带 volatile 就够了。volatile 只阻止编译器优化，不阻止 CPU 重排，跨核同步仍需屏障或原子。

## 七、与开源书/权威来源对应
Intel SDM 卷3 定义 SFENCE/MFENCE 的排序保证；ARMv8 手册定义 DMB 作用域与选项。

## 八、面试题
问：为何释放锁前要 store 后屏障？答：确保临界区内的写先被全局看到，再让锁标志可见，避免其它核拿到锁却读到旧数据。

## 九、演进与趋势
C++ std::atomic 的 release 语义编译为恰当的屏障/原子指令，减少手写汇编。

## 十、小结
写屏障的本质是「强制写缓冲按程序顺序刷出」，它是多核发布-订阅同步正确性的前提。
