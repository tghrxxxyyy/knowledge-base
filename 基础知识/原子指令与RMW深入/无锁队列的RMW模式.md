# 无锁队列的RMW模式

> 对应 Maged Michael & Scott 的《Simple, Fast, and Practical Non-Blocking and Blocking Concurrent Queue Algorithms》(1996)。

## 一、背景与挑战
生产者-消费者队列若用锁会限制并发并引入死锁风险。Michael-Scott 无锁队列用 CAS 在头/尾指针上操作，实现无锁（lock-free）推进。

## 二、核心原理
队列用哑元（dummy）节点，head 指向首节点、tail 指向末节点。入队 CAS 尾的 next 指针并推进 tail；出队 CAS head 推进并取数据。每个操作总能由某线程完成，保证系统级进展。

## 三、形式化与数学基础
无锁（lock-free）定义：无限执行中，至少有一个操作在有限步内完成：
$$\forall \text{infinite run } \exists \text{ thread making progress in bounded steps}$$
用 CAS 的比较-交换保证指针更新的原子性。

## 四、代码实现
```c
// 入队核心（简化，单生产者示意）
void enqueue(Node* n){
    n->next = NULL;
    Node* t = tail.load();
    Node* next = t->next;
    if (next == NULL) {
        if (tail->next.compare_exchange_strong(next, n))
            tail.compare_exchange_strong(t, n);
    }
}
```

## 五、与其他技术对比
无锁队列免死锁、抗暂停（某线程挂起他人仍可前进），但实现复杂、需内存回收（如 hazard pointer）避免 ABA/悬垂。

## 六、常见误区
误认为无锁等于无等待（wait-free）。无锁只保证系统级进展，单个线程仍可能饿死；wait-free 才保证每线程有界步完成。

## 七、与开源书/权威来源对应
Michael & Scott 1996 原论文；Maged Michael 的 hazard pointer 解决回收；C++ 标准库无直接无锁队列，但 atomic 提供原语。

## 八、面试题
问：无锁队列为何用哑元节点？答：消除空队列时 head/tail 边界特殊情形，使入队出队逻辑统一为指针 CAS。

## 九、演进与趋势
结合 epoch 回收、无锁栈/队列库（如 Folly、ConcurrentQueue）在工业界广泛使用。

## 十、小结
无锁队列是 RMW（尤其 CAS）的工程巅峰，用指针原子更新换取高并发与死锁免疫，但需配套内存回收。
