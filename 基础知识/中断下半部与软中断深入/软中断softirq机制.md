> 对应 Intel SDM 卷3「Interrupt and Exception Handling」与 Linux 内核 Documentation（core-api/irq/）。

## 一、背景与挑战
硬件中断处理（top half）要求极快返回，否则会屏蔽后续中断、增加延迟。但很多后续工作（如协议栈收包、定时器）较繁重。挑战是把「必须立刻做」与「可以稍后做」分开，且后半部能在多 CPU 上并行、可重入。

## 二、核心原理
Linux 把中断处理分为 top half（硬中断，关中断执行）与 bottom half。softirq 是最底层、最不可阻塞的 bottom half 机制，由一组静态编号的类型（如 NET_RX_SOFTIRQ、TIMER_SOFTIRQ、BLOCK_SOFTIRQ）构成。softirq 在中断返回路径、ksoftirqd 线程、及显式 raise_softirq 时被检查执行；它可重入，同一 softirq 可在多个 CPU 同时运行，因此处理函数必须无锁或自同步。

## 三、形式化与数学基础
设 pending 软中断位图 S（每 CPU 一份），触发：
```
raise_softirq(n):  S |= (1 << n)
run_softirq():      for n in set_bits(S): handler_n(); S &= ~(1<<n)
```
执行时机：硬件中断返回到内核态前，若 TIF_NEED_RESCHED 与软中断 pending，则 do_softirq。若软中断持续高频（如网络洪泛），则转交 ksoftirqd 以避免饥饿用户态。

## 四、代码实现
```c
// kernel/softirq.c（简化）
void raise_softirq(unsigned int nr)
{
    local_irq_save(flags);
    __raise_softirq_irqoff(nr);   // 置 pending 位
    local_irq_restore(flags);
}
asmlinkage __visible void do_softirq(void)
{
    pending = local_softirq_pending();
    while (pending) {
        h = softirq_vec[nr];
        h->action(h);             // 无进程上下文，不可睡眠
        pending = local_softirq_pending();
    }
}
```

## 五、与其他技术对比
- 硬中断 top half：关中断、最快、不可阻塞。
- softirq：可多 CPU 并行、不可睡眠、静态注册。
- tasklet：基于 softirq（TASKLET_SOFTIRQ），但同类型串行，使用更简单。
- workqueue：运行于进程上下文，可睡眠，最灵活。

## 六、常见误区
- 误区：softirq 处理函数可以睡眠。它运行在中断上下文，睡眠会崩溃。
- 误区：softirq 与具体设备绑定。它是按「类型」而非「设备」触发的全局机制。

## 七、与开源书/权威来源对应
- Intel SDM 卷3 描述中断/异常处理与 EOI。
- Linux 内核 Documentation/core-api/irq/softirqs.rst 解释 softirq。
- GitHub CyC2018/CS-Notes 的「中断」小节概括上下半部。

## 八、面试题
1. softirq 与硬中断的主要区别？
2. 为什么 softirq 处理函数不能睡眠？
3. 软中断为何会被转交 ksoftirqd？

## 九、演进与趋势
早期 2.4 软中断种类少；随网络/块设备多队列发展，软中断并行度提升，但因其不可睡眠与重入复杂性，新功能更倾向 tasklet/workqueue，softirq 仅留给性能极敏感路径。

## 十、小结
softirq 是内核最底层、可并行、不可睡眠的 bottom half，为网络收包等高频路径提供低延迟的延迟处理机制。
