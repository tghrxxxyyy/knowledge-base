> 对应 Linux 内核 Documentation（core-api/irq/tasklets.rst）与 Tanenbaum《Modern Operating Systems》。

## 一、背景与挑战
softirq 虽快但需静态注册、可重入、编写复杂。多数驱动的后半部工作并不要求极致并行，反而希望「同一 tasklet 不会在两个 CPU 同时跑」以简化同步。挑战是提供比 softirq 易用、又比进程上下文轻量的机制。

## 二、核心原理
tasklet 建立在 TASKLET_SOFTIRQ（与 HI_SOFTIRQ）之上。每个 tasklet 由 tasklet_struct 描述（含函数与数据），被挂入每 CPU 的 tasklet 链表。调度 tasklet_schedule 会触发对应 softirq；运行时，同一 tasklet 被保证在任一时刻仅在一个 CPU 上执行（通过 TASKLET_STATE_SCHED 标志防止重复入队与并发）。它仍运行在中断上下文，不可睡眠。

## 三、形式化与数学基础
设 tasklet t 的状态位：
```
SCHED  : 已在某 CPU 队列中（防止重复排队）
RUN    : 正在某 CPU 执行（保证单 CPU 并发）
```
调度约束：
```
tasklet_schedule(t): if (!test_and_set(SCHED)) enqueue(t)
run(t):              set(RUN); t->func(t->data); clear(RUN); clear(SCHED)
```
同一 t 因 SCHED/RUN 互斥，不会跨 CPU 并行执行 func。

## 四、代码实现
```c
// kernel/softirq.c（简化）
void tasklet_schedule(struct tasklet_struct *t)
{
    if (!test_and_set_bit(TASKLET_STATE_SCHED, &t->state)) {
        unsigned long flags;
        local_irq_save(flags);
        __this_cpu_write(tasklet_vec.head, t);  // 入本 CPU 链表
        raise_softirq_irqoff(TASKLET_SOFTIRQ);
        local_irq_restore(flags);
    }
}
static void tasklet_action(struct softirq_action *a)
{
    while ((t = list_pop())) {
        if (!test_and_set_bit(TASKLET_STATE_RUN, &t->state)) {
            t->func(t->data);                  // 不可睡眠
            clear_bit(TASKLET_STATE_RUN, &t->state);
        }
    }
}
```

## 五、与其他技术对比
- softirq：最底层、可并行、复杂。
- tasklet：基于 softirq，同任务串行、易用、仍不可睡眠。
- workqueue：进程上下文、可睡眠、按 CPU 或 unbound 队列。
- threaded IRQ：把整个 handler 放线程，可睡眠（见本子目录第 4 篇）。

## 六、常见误区
- 误区：tasklet 完全串行。不同类型 tasklet 可并行，只有同一 tasklet 被串行化。
- 误区：tasklet 能睡眠。它仍在中断上下文，睡眠非法。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/core-api/irq/tasklets.rst 权威说明。
- Tanenbaum《Modern Operating Systems》论中断底半部分层。
- GitHub youngyangyang04/leetcode-master 不涉及，但 CyC2018/CS-Notes 有中断图解。

## 八、面试题
1. 同一 tasklet 能否在两个 CPU 同时执行？
2. tasklet 为何比裸 softirq 易用？
3. tasklet 与 workqueue 在睡眠能力上的区别？

## 九、演进与趋势
因 tasklet 仍不可睡眠且难以调试，现代驱动倾向使用 threaded IRQ 或 workqueue；tasklet 多保留在遗留高性能路径。

## 十、小结
tasklet 以「同任务串行、仍不可睡眠」的折中，降低了 softirq 的编写复杂度，是中断底半部的经典易用层。
