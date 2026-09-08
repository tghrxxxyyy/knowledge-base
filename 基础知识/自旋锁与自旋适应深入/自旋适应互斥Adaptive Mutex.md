# 自旋适应互斥Adaptive Mutex

> 对应 Silberschatz《Operating System Concepts》与 Linux 内核 Documentation。

## 一、背景与挑战
纯自旋在持锁者正睡眠时不划算（白白空转），纯睡眠在持锁者马上释放时又多一次切换。自适应互斥根据「持锁者当前是否在运行」动态决定自旋还是睡眠。

## 二、核心原理
尝试获取时若锁被占，检查持有者线程是否正在某 CPU 上运行：若是，则短自旋等待（很可能很快释放）；若持有者不在运行（被抢占或睡眠），则直接睡眠避免空转。该策略由 Solaris 与后续系统（包括 Linux 的 futex 与 rt_mutex 启发）采用。

## 三、形式化与数学基础
定义持有者状态 $S \in \{\text{running}, \text{sleeping}\}$。决策函数：

$$ \text{action} = \begin{cases} \text{spin} & S = \text{running} \\ \text{sleep} & S = \text{sleeping} \end{cases} $$

期望代价比较：自旋成本 $C_s$ 与切换成本 $C_c$，当估计 $T_{hold} < C_c$ 时自旋更优。

## 四、代码实现
简化的自适应决策（概念）：

```c
int adaptive_lock(mutex_t *m) {
    while (__atomic_test_and_set(&m->owned, __ATOMIC_ACQUIRE)) {
        thread_t *owner = m->owner;
        if (owner && owner->state == RUNNING)
            cpu_relax();              // 持有者在跑，稍等
        else
            return sleep_on(&m->waitq); // 持有者没跑，去睡
    }
    m->owner = current;
    return 0;
}
```

## 五、与其他技术对比
普通自旋锁不关心持有者状态；普通互斥直接睡眠；自适应互斥综合二者，在持锁者运行态可见时尤其有效。它需要能查询持有者状态，故多与线程调度器协同。

## 六、常见误区
认为自适应一定更快，错误探测持有者状态会适得其反；认为自适应锁可替代 RCU，二者适用场景不同；忽略自旋上限以避免活锁。

## 七、与开源书/权威来源对应
Silberschatz《Operating System Concepts》讨论互斥与自适应自旋；Solaris 内核文档描述 adaptive mutex；Linux futex 实现有类似自适应等待思想。

## 八、面试题
自适应互斥何时自旋何时睡眠；为何要查持有者运行状态；与 spinlock 区别；潜在缺陷。

## 九、演进与趋势
Linux 的 futex2 与优先级继承 rt_mutex 融入自适应等待；用户态与内核态协作（futex）减少不必要的系统调用。

## 十、小结
自适应互斥通过观测持锁者是否运行，在自旋与睡眠间动态抉择，兼顾短临界区的低延迟与长临界区的低空转，是工程上折中的优秀范例。
