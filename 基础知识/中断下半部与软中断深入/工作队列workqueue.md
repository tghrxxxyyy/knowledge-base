> 对应 Linux 内核 Documentation（core-api/workqueue.rst）与 Silberschatz《Operating System Concepts》。

## 一、背景与挑战
许多延迟工作需要睡眠（如分配内存、等待锁、调用可阻塞 API），而 softirq/tasklet 不可睡眠。挑战是提供一个运行在进程上下文、可睡眠、且能按 CPU 亲和/并发限制管理的 bottom half 机制。

## 二、核心原理
workqueue 把工作（work_struct）提交到队列，由 worker 内核线程（kworker）取出执行。现代是「并发管理工作队列（cmwq）」：每个 CPU 有 worker 池，按需增减线程；可创建 unbound 工作队列跨 CPU 调度。提交者用 queue_work / schedule_work，工作者在进程上下文运行，可睡眠、可使用任意内核 API。

## 三、形式化与数学基础
设 CPU c 的 worker 池有活动线程数 A_c 与最大并发 M_c。当待处理工作 W_c > A_c 且 A_c < M_c 时孵化新 worker：
```
spawn if (pending_work > active_workers) and (active_workers < max_active)
```
max_active 限制同一 workqueue 的并发执行数，防止某队列饿死系统线程。unbound 队列由 wq 的 affinity 决定可跑 CPU 集合。

## 四、代码实现
```c
// 典型使用（驱动中）
static DECLARE_WORK(my_work, my_handler);
static void my_irq_top_half(int irq, void *dev)
{
    schedule_work(&my_work);   // 交到系统工作队列，下半部可睡眠
}
static void my_handler(struct work_struct *w)
{
    kmalloc(GFP_KERNEL);        // 允许睡眠/阻塞分配
    // ... 可调用任意可睡眠 API
}
```

## 五、与其他技术对比
- softirq/tasklet：中断上下文、不可睡眠、延迟最低。
- workqueue：进程上下文、可睡眠、延迟略高。
- threaded IRQ：整段 handler 在线程，可睡眠，与 workqueue 互补。

## 六、常见误区
- 误区：workqueue 运行在中断上下文。实际是 kworker 进程上下文。
- 误区：工作项可重入。默认同一 work_struct 若未完成后再次 queue，行为由 max_active 与状态决定，需自行防重入。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/core-api/workqueue.rst 权威描述 cmwq。
- Silberschatz《Operating System Concepts》讨论进程/线程上下文执行。
- GitHub CyC2018/CS-Notes 的「中断」小节概括各 bottom half。

## 八、面试题
1. workqueue 为何可以睡眠而 tasklet 不行？
2. max_active 的作用？
3. unbound 工作队列与 per-CPU 工作队列的区别？

## 九、演进与趋势
从早期单一 keventd 到 cmwq（2.6.36），实现按需线程伸缩、NUMA 亲和与更好的隔离；现代引入 unbound 与 WQ_MEM_RECLAIM 标志处理内存回收路径的特殊需求。

## 十、小结
workqueue 用 kworker 进程上下文承接可睡眠的延迟工作，是中断底半部中唯一能阻塞的机制，配合 cmwq 实现高效伸缩。
