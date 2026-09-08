> 对应 Linux 内核 Documentation（core-api/irq/softirqs.rst）与 Tanenbaum《Modern Operating Systems》。

## 一、背景与挑战
若 softirq 处理持续高频（如网络洪泛），中断返回路径会不断陷入 do_softirq，导致用户态进程长期得不到调度（饥饿）。挑战是在「低延迟处理 softirq」与「不饿死进程」之间取得平衡。

## 二、核心原理
当 do_softirq 在中断返回时处理的软中断次数/时间超过阈值（如 net.core.netdev_budget 与 time_limit），内核不再在当前上下文继续处理，而是唤醒每 CPU 的 ksoftirqd/n 内核线程去消化剩余 softirq。ksoftirqd 运行在进程上下文、可被调度，从而避免软中断长期霸占 CPU。

## 三、形式化与数学基础
设一次中断返回路径处理 softirq 的累计时间 t，阈值 T_max（如 2 jiffies 量级）。决策：
```
if t > T_max or budget_exhausted:
    wakeup(ksoftirqd_cpu);   // 转交线程
    return_to_user;          // 不再本上下文处理
else:
    continue_do_softirq
```
ksoftirqd 以低优先级循环运行 do_softirq 直到 pending 清空，期间若更高优先级任务就绪则让出 CPU。

## 四、代码实现
```c
// kernel/softirq.c（简化）
static void run_ksoftirqd(unsigned int cpu)
{
    local_irq_disable();
    if (local_softirq_pending()) {
        __do_softirq();        // 在进程上下文处理，可被抢占
    }
    local_irq_enable();
}
// do_softirq 中判断是否转交
static inline bool should_wake_ksoftirqd(void)
{
    return (softirq_pending && (time_spent > MAX_SOFTIRQ_TIME));
}
```

## 五、与其他技术对比
- 中断路径内联处理：延迟最低，但可能饥饿用户态。
- ksoftirqd 转交：牺牲少量延迟换回公平调度。
- 完全线程化（threaded IRQ）：更彻底地把处理移出中断上下文。

## 六、常见误区
- 误区：ksoftirqd 是普通用户进程。它是每 CPU 内核线程，专司软中断。
- 误区：softirq 一旦 pending 一定马上处理。超过阈值会推迟到 ksoftirqd。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/core-api/irq/softirqs.rst 描述 ksoftirqd。
- Tanenbaum《Modern Operating Systems》讨论中断处理对吞吐/延迟的影响。
- GitHub remzi-arpacidusse/ostep-code 的「中断」示例类比。

## 八、面试题
1. 什么情况下 softirq 处理会转交 ksoftirqd？
2. ksoftirqd 运行在什么上下文？
3. 为什么需要 ksoftirqd 而非一直中断路径处理？

## 九、演进与趋势
网络多队列与 RPS/RFS 把软中断负载分散到更多 CPU，减轻单核 ksoftirqd 压力；与 busy polling（如 busy_read）形成「延迟 vs CPU 占用」的新权衡。

## 十、小结
ksoftirqd 是 softirq 的「安全阀」，在软中断过载时把处理转交内核线程，避免饿死普通进程，平衡延迟与公平。
