> 对应 Linux 内核 Documentation（scheduler/sched-design-CFS.rst）与 Silberschatz《Operating System Concepts》。

## 一、背景与挑战
公平调度需要一种结构，能快速找到「当前最该运行（虚拟时间最小）」的进程，并支持频繁插入/删除/更新。挑战是用 O(log n) 维持有序，同时把「公平」量化为可比较的单一数值。

## 二、核心原理
CFS（Completely Fair Scheduler）以 vruntime（虚拟运行时间）衡量每个调度实体的「已享用时长」。vruntime 增长速率与进程权重成反比：权重越高（nice 越小），vruntime 增长越慢，从而分得更多真实 CPU。所有可运行实体按 vruntime 存入一棵红黑树（rb tree），最左节点即为下一个候选。

## 三、形式化与数学基础
vruntime 更新（每 tick 或调度时）：
```
delta_vruntime = delta_wall_time * (NICE_0_LOAD / weight)
vruntime += delta_vruntime
```
其中 NICE_0_LOAD = 1024，weight 由 nice 值经 sched_prio_to_weight 表得出。理想公平要求所有实体的 vruntime 收敛到同一值；红黑树按 vruntime 排序，min 在 leftmost：
```
next = rb_first_cached(&cfs_rq->tasks_timeline)   // O(1) 取最左
```

## 四、代码实现
```c
// kernel/sched/fair.c（简化）
static void update_curr(struct cfs_rq *cfs_rq)
{
    u64 now = rq_clock_task(rq_of(cfs_rq));
    u64 delta_exec = now - curr->exec_start;
    curr->exec_start = now;
    curr->vruntime += calc_delta_fair(delta_exec, curr);  // 按权重缩放
    update_min_vruntime(cfs_rq);
}
static inline u64 calc_delta_fair(u64 delta, struct sched_entity *se)
{
    if (unlikely(se->load.weight != NICE_0_LOAD))
        delta = __calc_delta(delta, NICE_0_LOAD, &se->load);
    return delta;
}
```

## 五、与其他技术对比
- O(n) 扫描：简单但不可扩。
- 红黑树 CFS：O(log n) 插入/删除，取最左 O(1) 缓存。
- 多级反馈队列：按优先级分层，非严格公平。

## 六、常见误区
- 误区：vruntime 等于真实运行时间。它已被权重缩放，高优先级进程增长更慢。
- 误区：红黑树需要全树平衡扫描。实际只维护最左缓存。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/scheduler/sched-design-CFS.rst 权威解释。
- Silberschatz《Operating System Concepts》讨论公平共享调度。
- GitHub CyC2018/CS-Notes 的「进程调度」小节概括 CFS。

## 八、面试题
1. 为什么用 vruntime 而不是真实运行时间排序？
2. CFS 如何 O(1) 取到下一个运行实体？
3. 权重如何影响 vruntime 增长速度？

## 九、演进与趋势
CFS 早期用普通 rb tree；后引入 rb_first_cached 缓存最左节点加速；与 PELT（负载追踪）结合用于 EAS（能效感知调度）。

## 十、小结
红黑树 + vruntime 把「公平」量化成可比较的虚拟时间，使 CFS 能在 O(log n) 内完成调度决策，兼顾公平与可扩展性。
