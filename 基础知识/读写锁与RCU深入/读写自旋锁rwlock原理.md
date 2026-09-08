# 读写自旋锁rwlock原理

> 对应 Silberschatz《Operating System Concepts》与 Linux 内核 Documentation。

## 一、背景与挑战
许多共享结构读多写少，若读者间也互斥会浪费并发。读写锁允许多读者并发，但写者需独占，从而提升读密集负载吞吐。

## 二、核心原理
rwlock 维护读者计数与写者标志。读者加锁时若无写者则递增计数；写者加锁时等待读者归零并置写标志，阻止新读者。经典的读优先实现可能饿死写者，需谨慎使用。

## 三、形式化与数学基础
设 $R$ 为活跃读者数，$W \in \{0,1\}$ 为写者占用。不变量：

$$ \text{invariant}: (W=1 \implies R=0) \land (R>0 \implies W=0) $$

读者进入条件：

$$ \text{enter\_read} \iff W = 0 $$
写者进入条件：

$$ \text{enter\_write} \iff R = 0 \land W = 0 $$

## 四、代码实现
读写锁核心（自旋版概念）：

```c
typedef struct { volatile int readers; volatile int writer; } rwlock_t;

void read_lock(rwlock_t *l) {
    for (;;) {
        while (l->writer) cpu_relax();
        int r = __atomic_add_fetch(&l->readers, 1, __ATOMIC_ACQ_REL);
        if (!l->writer) return;
        __atomic_sub_fetch(&l->readers, 1, __ATOMIC_ACQ_REL);
    }
}
void write_lock(rwlock_t *l) {
    while (__atomic_test_and_set(&l->writer, __ATOMIC_ACQUIRE)) cpu_relax();
    while (l->readers) cpu_relax();
}
```

## 五、与其他技术对比
mutex 不论读写都独占；rwlock 提升读并发但写者可能饿死；RCU 把读侧降到几乎无锁但要求特殊更新协议；seqlock 适合极短写、读者容忍重试。

## 六、常见误区
认为读者间绝对并发安全，若读操作修改统计字段仍需原子；认为 rwlock 不会饿死写者，默认读优先常会；在多核高读下写者长期等待。

## 七、与开源书/权威来源对应
Silberschatz《Operating System Concepts》第 6 章讲读者写者问题；Linux 内核 Documentation 与 include/linux/rwlock.h；Tanenbaum 讨论同样经典问题。

## 八、面试题
读写锁不变量；写者饿死原因；读者是否需原子；与 RCU 对比。

## 九、演进与趋势
Linux 趋向用 RCU 替代读多写少场景的 rwlock；seqlock 与 per-CPU 计数减少争用；qrwlock 改进公平与扩展性。

## 十、小结
读写锁通过区分读者与写者提升读并发，但以写者潜在饿死与实现复杂度为代价，适合写极少且持锁短的读密集结构。
