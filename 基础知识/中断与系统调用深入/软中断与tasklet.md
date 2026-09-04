# 软中断与tasklet

> 对应 Linux `kernel/softirq.c` 与 `kernel/softirq.c`(tasklet) 及 Love《Linux Kernel Development》。

## 一、背景与挑战
硬件中断上半部不能久留，耗时工作需延后到可睡眠/可抢占的上下文。软中断（softirq）与 tasklet 提供不同优先级的延后执行机制。

## 二、核心原理
- 软中断：静态有限种（如 NET_RX、NET_TX、TIMER），在中断返回或 ksoftirqd 中运行，可并发于多 CPU。
- tasklet：建立在软中断之上（TASKLET_SOFTIRQ），同一 tasklet 不会跨 CPU 并发，简化可重入。
- workqueue：可睡眠的线程上下文延后工作。

## 三、形式化 / 数学基础
软中断触发计数 $pending$ 位图；每 CPU 在 `local_bh_disable` 外时于 `irq_exit` 检查并运行。ksoftirqd 在软中断占比过高时接管，防止饿死用户态。

## 四、代码实现
定义与调度 tasklet（示意）：

```c
void my_tasklet_fn(unsigned long d) { /* 延后工作 */ }
DECLARE_TASKLET(my_tl, my_tasklet_fn, 0);
/* 在 ISR 中: */
tasklet_schedule(&my_tl);   /* 标记 pending, 软中断上下文运行 */
```

## 五、与其他技术对比
软中断并发度高但需自身保证同步；tasklet 同体不并行更易写；workqueue 能睡眠但延迟更大。选择取决于是否需睡眠与并行度需求。

## 六、常见误区
- 在软中断/tasklet 中睡眠：它们运行在原子上下文，不可睡眠。
- 认为 tasklet 多 CPU 并行：同一 tasklet 串行。
- 滥用软中断导致 ksoftirqd 软锁。

## 七、与开源书 / 权威来源对应
- CS-Notes：https://github.com/CyC2018/CS-Notes
- 参考 Love《Linux Kernel Development》、Wolf《Linux Kernel Programming》。

## 八、面试题
1. 软中断、tasklet、workqueue 的区别？
2. 为何软中断不能睡眠？
3. ksoftirqd 何时被唤醒？

## 九、演进与趋势
NAPI 在网络收包中用轮询减少软中断风暴； threaded IRQ 把部分延后工作移到可抢占线程。

## 十、小结
延后执行分三层：软中断（高并发、原子）、tasklet（同体串行、易写）、workqueue（可睡眠）；按是否需睡眠与并行度选择。
