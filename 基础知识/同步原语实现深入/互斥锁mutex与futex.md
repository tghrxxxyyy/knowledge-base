# 互斥锁mutex与futex

> 对应 Bryant & O'Hallaron《CSAPP》第 12 章与 Kerrisk《The Linux Programming Interface》第 30 章。

## 一、背景与挑战
用户态线程既要互斥又要避免忙等。纯自旋浪费 CPU，纯内核锁每次操作都陷入昂贵。futex（快速用户态互斥）把"无竞争走用户态、有竞争才陷入内核"结合，是 pthread_mutex 的基石。

## 二、核心原理
futex 是整数与内核队列关联：无竞争时 `mutex.lock` 用原子 CAS 直接改用户态值，零陷入；争用时 CAS 失败，调用 `FUTEX_WAIT` 陷入内核睡眠；释放者 `FUTEX_WAKE` 唤醒。从而快路径免系统调用。

## 三、形式化与数学基础
快路径（无竞争）：
$$CAS(state,0,1)=true \Rightarrow 进入,\; 无 syscall$$
慢路径：$CAS$ 失败 $\Rightarrow FUTEX\_WAIT(state,1)$ 睡眠，唤醒后重试。期望快路径成本 $\approx$ 原子指令，慢路径 $\approx$ 上下文切换。

## 四、代码实现
```c
// glibc pthread_mutex 简化：无竞争用户态 CAS
if (__atomic_compare_exchange(&m->state, &zero, &one, 0,
                               __ATOMIC_ACQUIRE, __ATOMIC_RELAXED))
    return 0;                      // 快路径
// 慢路径：futex_wait(&m->state, 1)
syscall(SYS_futex, &m->state, FUTEX_WAIT, 1, NULL, NULL, 0);
```

## 五、与其他技术对比
futex 快路径零陷入、慢路径睡眠；自旋锁全忙等；信号量（见下）允许多。相较 Windows SRWLOCK，语义相近。用户态 mutex 不可用于中断上下文。

## 六、常见误区
误以为 mutex 总是睡眠：无竞争走用户态。误以为 futex 是锁：它只是等待/唤醒原语，锁逻辑在用户态。误以为递归加锁安全：默认非递归会死锁。

## 七、与开源书/权威来源对应
CSAPP 12.5 线程与锁；Kerrisk 第 30/31 章 pthreads 与 futex；OSTEP 锁章。

## 八、面试题
问：无竞争时 pthread_mutex 会陷入内核吗？答：不会，CAS 成功走用户态。问：futex 为何快？

## 九、演进与趋势
`FUTEX_PRIVATE` 标志优化同进程锁；`FUTEX_WAIT_BITSET` 支持优先级唤醒； robust mutex 处理持有者崩溃。

## 十、小结
futex 以"用户态 CAS + 内核等待"兼得快路径与无忙等，是现代线程互斥的底层机制。
