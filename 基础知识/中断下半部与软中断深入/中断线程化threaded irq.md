> 对应 Linux 内核 Documentation（core-api/irq/）与 ARMv8 手册的异常/中断背景。

## 一、背景与挑战
传统中断 handler 运行在关中断上下文，若 handler 需耗时或调用可睡眠 API，会拉长中断关闭时间、增大系统延迟，且难以用锁保护。挑战是把 handler 移到进程上下文以获得可调度性与睡眠能力，同时保留对「必须立即响应」部分的硬处理。

## 二、核心原理
threaded IRQ 把中断处理拆为两部分：一个极短的 hardirq（可选，做清中断/ACK），主体则在一个专用内核线程（irq/N-device）中运行。request_threaded_irq 注册两者；硬部分返回 IRQ_WAKE_THREAD 唤醒线程执行 thread_fn。线程可睡眠、可被调度、可用常规锁，且优先级可调（实时线程更高）。

## 三、形式化与数学基础
执行模型：
```
hardirq():  ack_device(); mask_if_needed(); return IRQ_WAKE_THREAD;
thread_fn():  process_event();  // 可睡眠
              unmask();
              return IRQ_HANDLED;
```
线程优先级 P 影响调度延迟 L：提高 P 降低 L，但过高会挤占其他实时任务。实时系统中常把 irq 线程设为 SCHED_FIFO 高优先级。

## 四、代码实现
```c
// 驱动注册（简化）
static irqreturn_t my_hard(int irq, void *dev)
{
    /* 仅做必要硬件ACK，尽快返回 */
    writel(ACK, reg);
    return IRQ_WAKE_THREAD;          // 唤醒线程处理
}
static irqreturn_t my_thread(int irq, void *dev)
{
    process_data();                  // 可睡眠、可用锁
    return IRQ_HANDLED;
}
request_threaded_irq(irq, my_hard, my_thread,
                     IRQF_ONESHOT, "mydev", dev);
```

## 五、与其他技术对比
- 传统 handler：关中断、快、不可睡眠。
- threaded IRQ：主体可睡眠、延迟略增、实时友好。
- workqueue：更通用，但无「每中断一线程」的硬实时语义。
- softirq：最快但最受限。

## 六、常见误区
- 误区：threaded IRQ 完全不在中断上下文。hardirq 部分仍在中断上下文，只有 thread_fn 在进程上下文。
- 误区：threaded 一定更慢。对可睡眠/复杂处理，它降低关中断时间，整体更稳。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/core-api/irq/handling.rst 讲 threaded IRQ。
- ARMv8 手册描述异常级别与中断路由，为线程化提供硬件背景。
- GitHub CyC2018/CS-Notes 的「中断」小节概括。

## 八、面试题
1. IRQ_WAKE_THREAD 返回值的作用？
2. threaded IRQ 的 hardirq 部分能否睡眠？
3. 为什么实时系统偏好 threaded IRQ？

## 九、演进与趋势
PREEMPT_RT 把大量中断强制线程化（forced threading），使内核几乎全程可抢占；这是实时 Linux 降低不可抢占区间的关键手段。

## 十、小结
threaded IRQ 把繁重中断处理移入内核线程，获得睡眠与调度能力，是实时化与可维护性的重要机制。
