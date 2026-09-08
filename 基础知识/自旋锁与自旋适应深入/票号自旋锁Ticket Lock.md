# 票号自旋锁Ticket Lock

> 对应 Hennessy & Patterson《Computer Architecture》与 Linux 内核 Documentation。

## 一、背景与挑战
简单测试-设置自旋锁存在严重不公平：后到的 CPU 可能抢先拿到锁，导致有的 CPU 饿死，且缓存行在多核间频繁无效化（cache line bouncing）。票号锁提供先来先服务的公平。

## 二、核心原理
用两个计数器：next（下一个服务号）与 owner（当前持锁号）。加锁时取自己的票号（next++），自旋直到 owner 等于自己票号；释放时 owner++。这样按取号顺序服务，公平且局部性更好（只等一个值）。

## 三、形式化与数学基础
取号与等待：

$$ t_i = \text{atomic\_fetch\_inc}(\text{next}) $$
$$ \text{spin until } \text{owner} = t_i $$
释放：

$$ \text{owner} \gets \text{owner} + 1 $$

公平性：若 $t_i < t_j$ 则线程 $i$ 先于 $j$ 进入。

## 四、代码实现
票号锁实现：

```c
typedef struct { volatile uint16_t owner; volatile uint16_t next; } ticketlock_t;

void ticket_lock(ticketlock_t *l) {
    uint16_t t = __atomic_fetch_add(&l->next, 1, __ATOMIC_RELAXED);
    while (__atomic_load_n(&l->owner, __ATOMIC_ACQUIRE) != t)
        cpu_relax();
}
void ticket_unlock(ticketlock_t *l) {
    __atomic_fetch_add(&l->owner, 1, __ATOMIC_RELEASE);
}
```

## 五、与其他技术对比
简单自旋锁不公平且缓存抖动大；票号锁公平但有「票号跨核传递」的缓存写传播；MCS 锁把等待节点链在本地缓存行，进一步减少竞争。票号锁是 Linux qspinlock 演进中的前身概念。

## 六、常见误区
认为票号锁完全避免缓存竞争，owner 递增仍会广播；认为公平一定更快，公平可能降低聚合吞吐；忽略 16 位回绕（票号会循环复用）。

## 七、与开源书/权威来源对应
Hennessy & Patterson《Computer Architecture》讨论 ticket lock 与缓存；Linux 内核 qspinlock 实现参考；OSTEP 并发章节提供直觉。

## 八、面试题
票号锁如何保证公平；相比简单自旋锁改进在哪；票号回绕问题；为何仍可能有缓存开销。

## 九、演进与趋势
Linux 的 qspinlock 结合 MCS 思想与紧凑编码，在大小核上更优；硬件实现趋向把排队放入缓存一致性协议。

## 十、小结
票号锁用取号-叫号机制把非公平的原子锁变成先来先服务的公平锁，缓解饿死与缓存抖动，是排队锁演化的关键一步。
