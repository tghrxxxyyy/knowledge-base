# 实时Linux

> 对应 Linux PREEMPT_RT 补丁（已逐步合入主线）与 SCHED_DEADLINE，及 Wolf《Linux Kernel Programming》。

## 一、背景与挑战
标准 Linux 为吞吐优化，关抢占/关中断临界区与不可抢占内核使最坏延迟达毫秒甚至更差，难满足硬实时。实时 Linux 通过内核全面可抢占化压低延迟。

## 二、核心原理
- PREEMPT_RT：自旋锁改为可睡眠 rt_mutex、中断线程化（IRQ → 线程）、临界区可抢占。
- SCHED_DEADLINE：EDF + 运行/周期带宽隔离（见实时调度与速率单调调度篇）。
- 优先级继承 rt_mutex 消除优先级反转（见优先级反转篇）。

## 三、形式化 / 数学基础
实时调度类优先级：STOP > DL > RT > FAIR > IDLE。DL 任务以 $(Q,D,P)$ 保证：调度性 $\\sum Q_i/P_i \\le 1$（EDF）。PREEMPT_RT 把内核抢占延迟从毫秒压到数十微秒级。

## 四、代码实现
SCHED_DEADLINE 设置（用户态示意）：

```c
struct sched_attr a = {.size=sizeof(a), .sched_policy=SCHED_DEADLINE,
    .sched_runtime=50000, .sched_deadline=100000, .sched_period=100000};
syscall(SYS_sched_setattr, 0, &a, 0);   /* 50us运行/100us周期 */
```

## 五、与其他技术对比
标准 Linux（PREEMPT 或 PREEMPT_VOLUNTARY）延迟较差；PREEMPT_RT 内核可抢占但需特定内核；专用 RTOS（QNX/VxWorks）确定性更强但生态受限。Linux 实时胜在生态与成本。

## 六、常见误区
- 认为开 PREEMPT 就够硬实时：仍需 RT 补丁级可抢占。
- 忽略用户态也要避免 GC/动态分配破坏确定性。
- 混淆 SCHED_FIFO（无截止）与 SCHED_DEADLINE（有截止保证）。

## 七、与开源书 / 权威来源对应
- CSAPP 中文笔记：https://github.com/Hansimov/csapp
- 参考 Wolf《Linux Kernel Programming》、Love《Linux Kernel Development》。

## 八、面试题
1. PREEMPT_RT 做了哪些关键改造？
2. SCHED_DEADLINE 用何算法？
3. 实时 Linux 能达到硬实时吗？

## 九、演进与趋势
PREEMPT_RT 主线化、SCHED_DEADLINE 成熟、isolcpus/NO_HZ 与内核实时隔离进一步完善确定性；RISC-V 实时扩展兴起。

## 十、小结
实时 Linux 以 PREEMPT_RT 的可抢占内核 + SCHED_DEADLINE 的 EDF 带宽隔离，在保留 Linux 生态的同时把最坏延迟压到微秒级，逼近硬实时。
