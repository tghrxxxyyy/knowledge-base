> 对应 Linux 内核 Documentation（rt-mutex.txt）与 PREEMPT_RT 背景。

## 一、背景与挑战
普通互斥锁（_spinlock/mutex）在实时内核里要么关抢占要么不可睡眠，无法满足「持锁期间可被高优先级抢占者通过 PI 提升」的需求。挑战是提供一套支持优先级继承的实时互斥原语（rt_mutex）及其 boost 链路。

## 二、核心原理
rt_mutex 是内核中实现了完整 PI 的互斥锁。它维护「等待在该锁上的任务按优先级排序的树」。当任务阻塞于 rt_mutex，内核沿「锁→持有者→其等待的锁…」递归提升优先级（boost），直到链条顶端。释放锁时按提升链回退优先级（unboost）。PREEMPT_RT 把大量传统锁改写为 rt_mutex 语义，使实时路径可抢占。

## 三、形式化与数学基础
boost 计算（递归）：
```
boost(task) = max( base_prio(task),
                   max_{lock l held by task}
                       max_{waiter w on l} boost(w) )
```
即任务有效优先级等于其基础优先级与「所有被它阻塞的等待者 boosts」的最大值。回退时重新计算链上各任务，确保只保留仍被需要的提升。

## 四、代码实现
```c
// kernel/locking/rtmutex.c（简化）
static void __rt_mutex_adjust_prio(struct task_struct *task)
{
    int prio = rt_mutex_get_top_task_priority(task);  // 取等待链最高
    rt_mutex_setprio(task, prio);
}
static int rt_mutex_adjust_prio_chain(struct task_struct *task,
                                       enum rtmutex_chainwalk chwalk,
                                       struct rt_mutex *orig_lock, ...)
{
    // 沿锁链递归 adjust，直到无可提升
    do {
        __rt_mutex_adjust_prio(task);
        if (task->pi_blocked_on == NULL) break;
        task = task->pi_blocked_on->task;     // 走到链上持有者
    } while (task);
    return 0;
}
```

## 五、与其他技术对比
- 普通 mutex：无 PI，实时下可能反转。
- rt_mutex：完整 PI + boost 链，实时安全。
- spinlock（传统）：关抢占，实时下改为 rt_mutex 语义（PREEMPT_RT）。

## 六、常见误区
- 误区：所有锁都自动 PI。只有 rt_mutex（及基于此的 rt 自旋锁）支持，普通锁不保证。
- 误区：boost 一次就够。需沿整条等待链递归，否则中间节点仍可能被抢占。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/rt-mutex.txt 权威描述 boost 链。
- PREEMPT_RT 补丁文档解释锁语义改造。
- Silberschatz《Operating System Concepts》讨论 PI 的连锁提升。

## 八、面试题
1. rt_mutex 相比普通 mutex 多了什么能力？
2. boost 为什么需要沿整条等待链递归？
3. PREEMPT_RT 为何把自旋锁改为 rt_mutex 语义？

## 九、演进与趋势
rt_mutex 持续作为 PREEMPT_RT 主线化核心；与 futex 的 PI（FUTEX_PI）协同，使用户态实时锁也能获得内核 PI 保障。

## 十、小结
rt_mutex 以完整优先级继承与递归 boost 链，为实时内核提供「持锁可抢占、等待可提升」的安全互斥原语。
