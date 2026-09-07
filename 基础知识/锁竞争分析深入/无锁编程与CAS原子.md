# 无锁编程与CAS原子

> 对应 《CSAPP》第12章 并发 / remzi-arpacidusse/ostep-code (GitHub) / C11 stdatomic。

## 一、背景与挑战
锁有死锁、优先级反转、阻塞风险。无锁(lock-free)用原子原语保证系统级进展，适合高并发低延迟数据结构，但 ABA 与重试复杂度高。

## 二、核心原理
CAS(Compare-And-Swap)原子比较并交换：仅当当前值等于预期才更新。循环 CAS 实现无锁栈/队列。无锁保证至少一个线程前进；wait-free 保证每个线程有限步完成。

## 三、形式化与数学基础
CAS 语义：
$$ CAS(addr, exp, new) = \begin{cases}true & *addr=exp \Rightarrow *addr=new\\ false & \text{否则}\end{cases} $$
ABA：值由 A 变 B 又回 A，CAS 误判未变。版本号/标记指针解决：
$$ ptr' = (version+1) \| address $$

## 四、代码实现
```c
// 无锁栈: CAS 头指针
#include <stdatomic.h>
struct Node { int v; Node* next; };
atomic<Node*> top;
void push(int v) {
    Node* n = new Node{v, nullptr};
    Node* t = atomic_load(&top);
    do { n->next = t; }
    while (!atomic_compare_exchange_weak(&top, &t, n));
}
```

## 五、与其他技术对比
无锁避免死锁但有 ABA 与活锁重试；RCU 读无锁但写复制；自旋锁简单但阻塞。选型和场景强相关。

## 六、常见误区
误以为无锁一定更快——高竞争下 CAS 重试反而慢。忽略 ABA。忘记内存序(acquire/release)。

## 七、与开源书/权威来源对应
《CSAPP》12.7 同步原语；C11 stdatomic；OSTEP 并发章节；15445 的并发控制。

## 八、面试题
CAS 是什么？ABA 问题及解法？memory_order 含义？

## 九、演进与趋势
C++20 原子等待(atomic::wait)、事务内存、hazard pointer 安全回收。

## 十、小结
无锁以原子 CAS 换取无阻塞进展，但需直面 ABA 与内存序，并非银弹。
