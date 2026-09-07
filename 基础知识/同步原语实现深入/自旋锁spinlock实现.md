# 自旋锁spinlock实现

> 对应 Love《Linux Kernel Development》第 10 章自旋锁与 Bryant & O'Hallaron《CSAPP》第 12 章。

## 一、背景与挑战
内核临界区很短且不可睡眠（中断上下文），用互斥锁睡眠代价高。自旋锁让抢锁失败的 CPU 忙等（自旋）而非阻塞，适合短临界区与不能睡眠场景，但空转浪费 CPU。

## 二、核心原理
基于原子 CAS/Exchange：抢到 `locked==0` 则置 1 进入临界区，否则循环读 `locked` 自旋。x86 用 `LOCK BTS`/`XCHG`；现代加 `PAUSE` 降低自旋功耗并提示超线程。关抢占/中断防止死锁（同核重入）。

## 三、形式化与数学基础
获取条件：
$$acquire \iff CAS(locked,0,1)=true$$
临界区长度 $L$ 与自旋开销权衡：总等待 $\approx N_{contend}\cdot L$。适用准则：
$$L_{crit} \ll context\_switch\_cost$$
否则应改睡眠锁。

## 四、代码实现
```c
// 简化自旋锁（x86）
void spin_lock(spinlock_t *l) {
    while (__sync_lock_test_and_set(&l->v, 1)) {
        asm volatile("pause");     // 降低功耗、提示自旋
    }
}
void spin_unlock(spinlock_t *l) { __sync_lock_release(&l->v); }
```

## 五、与其他技术对比
自旋锁忙等、不睡眠、适短临界区；互斥锁睡眠、适长临界区。相较 RCU，自旋锁写者互斥。单核下自旋锁常退化为禁抢占。

## 六、常见误区
误以为自旋锁一定快：长临界区下严重空转。误以为用户态可随意自旋：可能饿死其他线程，应 futex。误以为自旋锁可睡眠：睡眠会死锁。

## 七、与开源书/权威来源对应
Love LKD 第 10 章 spinlock 与 bottom half；CSAPP 12.x 锁实现。

## 八、面试题
问：为什么中断上下文只能用自旋锁？答：不能睡眠，互斥锁阻塞会死锁。问：PAUSE 作用？

## 九、演进与趋势
qspinlock（排队自旋锁）减少 cache line 抖动；MCS 锁使自旋本地化降低广播。

## 十、小结
自旋锁用原子 CAS+忙等保护短不可睡临界区，是内核并发最基础工具。
