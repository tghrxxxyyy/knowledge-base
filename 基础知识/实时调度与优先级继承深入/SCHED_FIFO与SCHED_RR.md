> 对应 Linux 内核 Documentation（scheduler/sched-rt.rst）与 Silberschatz《Operating System Concepts》「Real-Time Scheduling」。

## 一、背景与挑战
硬实时/低延迟任务要求确定性的调度行为，不被 CFS 的公平逻辑干扰。挑战是提供「严格按优先级、可预测的抢占」策略，同时避免无界饥饿与死循环。

## 二、核心原理
SCHED_FIFO 与 SCHED_RR 属于实时调度类（高于 CFS）。任务有静态优先级 1..99（数字大优先级高）。SCHED_FIFO：同优先级下先到先运行，直到主动让出、阻塞或被更高优先级抢占，无时间片。SCHED_RR：同优先级间按时间片轮转（sched_rr_timeslice），避免同优先级 FIFO 饿死同伴。

## 三、形式化与数学基础
设实时优先级 p ∈ [1,99]。可运行判定：
```
higher_priority(p, q) <-> p > q
```
SCHED_FIFO 切换条件仅：主动 yield / 阻塞 / 出现更高 p。SCHED_RR 附加：
```
if (ran_time(task) >= rr_timeslice) -> 移到同优先级队尾
```
最大优先级数 MAX_RT_PRIO = 100，其中 0 留给 CFS，1..99 为实时。

## 四、代码实现
```c
// kernel/sched/rt.c（简化）
static struct task_struct *pick_next_task_rt(struct rq *rq)
{
    struct rt_rq *rt_rq = &rq->rt;
    if (!rt_rq->rt_nr_running) return NULL;     // 无实时任务则下沉 CFS
    return rt_rq->curr ? : __pick_next_rt_entity(rt_rq);  // 取最高优先级队首
}
// 入队按优先级位图
static void enqueue_task_rt(struct rq *rq, struct task_struct *p)
{
    struct rt_rq *rt_rq = &rq->rt;
    rt_rq->rt_nr_running++;
    __set_bit(p->rt_priority, rt_rq->active.bitmap);  // O(1) 选最高优先级
}
```

## 五、与其他技术对比
- CFS：公平、按比例，非确定性实时保证。
- SCHED_FIFO：确定、无时间片，但同优先级可能饿死。
- SCHED_RR：FIFO + 同优先级轮转，防同伴饥饿。
- SCHED_DEADLINE：基于 EDF，有正式可调度性保证。

## 六、常见误区
- 误区：实时优先级越高数字越小。Linux 实时优先级是数字越大越高（1..99）。
- 误区：SCHED_FIFO 有默认时间片。它没有，会一直跑到让出。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/scheduler/sched-rt.rst 权威描述。
- Silberschatz《Operating System Concepts》第 6 章实时调度。
- GitHub CyC2018/CS-Notes 的「实时调度」小节。

## 八、面试题
1. SCHED_FIFO 与 SCHED_RR 的核心区别？
2. Linux 实时优先级的范围与方向？
3. 为什么实时任务能抢占 CFS 任务？

## 九、演进与趋势
RT 调度与 PREEMPT_RT 主线化结合；throttling（见本子目录第 5 篇）防止 RT 任务占满 CPU；与 deadline 调度互补。

## 十、小结
SCHED_FIFO/RR 提供确定的静态优先级实时调度，FIFO 保证无时间片抢占、RR 在同优先级内轮转，是 Linux 软实时主力。
