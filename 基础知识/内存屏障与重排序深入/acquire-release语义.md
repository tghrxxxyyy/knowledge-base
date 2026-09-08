# acquire-release语义

> 对应 C++11 内存模型与 Boehm 等人的内存模型论文。

## 一、背景与挑战
全 SC 太贵，弱模型太难用。acquire-release 提供「刚好够用」的同步：release 前的写对随后 acquire 同一变量的线程可见。

## 二、核心原理
release 操作（如存标志）之前的所有写，不会被重排到它之后；acquire 操作（如读标志）之后的所有读/写，不会被重排到它之前。二者配对建立 happens-before。

## 三、形式化与数学基础
若线程 A 执行 `x.store(1, release)`，线程 B 执行 `x.load(acquire)` 读到 1，则：
$$W_A\;\text{sw}\;R_B \Rightarrow \forall w \text{ po-before release}: w\;\text{hb}\; \text{acquire-po-after reads}$$

## 四、代码实现
```c
std::atomic<int> flag{0};
int data = 0;
// 写线程
data = 42;
flag.store(1, std::memory_order_release);
// 读线程
if (flag.load(std::memory_order_acquire)) {
    // 必然看到 data == 42
    assert(data == 42);
}
```

## 五、与其他技术对比
比 SC（seq_cst）弱但比 relaxed 强；acquire/release 不在独立变量间建立顺序，比 seq_cst 更高效。

## 六、常见误区
误以为 acquire/release 自动保证多变量原子性。它们只同步「配对变量」所传递的 happens-before 链。

## 七、与开源书/权威来源对应
C++ 标准 memory_order 章节；Boehm & Adve 2008「Foundations of the C++ Concurrency Memory Model」。

## 八、面试题
问：release/acquire 为何比 seq_cst 快？答：它只约束配对同步点的局部顺序，不要求全局单一顺序，减少屏障。

## 九、演进与趋势
消费（consume）语义因实现困难被多数编译器按 acquire 处理，社区聚焦 release/acquire 与 seq_cst。

## 十、小结
acquire-release 用最小同步成本表达「发布-订阅」模式，是并发编程最常用的内存序。
