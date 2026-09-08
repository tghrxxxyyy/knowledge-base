> 对应 Linux 内核 Documentation（PREEMPT_RT 相关）与 ARMv8 手册的异常延迟背景。

## 一、背景与挑战
标准内核在关中断区段、不可抢占区段、自旋锁持有时无法及时响应高优先级任务，导致中断/调度延迟可达毫秒级，不满足硬实时。挑战是最大限度缩短「不可抢占、不可中断」窗口，使最坏时延可界定。

## 二、核心原理
PREEMPT_RT 通过多项改造降低时延：(1) 把中断处理线程化（见第 4 子目录），使硬中断区段极短；(2) 把多数自旋锁改为可睡眠的 rt_mutex，关抢占窗口大幅缩短；(3) 使内核几乎全程可抢占；(4) O(1) 或低延迟调度。结果是中断到任务调度的最坏时延从毫秒降到数十微秒级（取决于硬件）。

## 三、形式化与数学基础
最坏响应时延 WCRT 近似：
```
WCRT = max_interrupt_disable_time
     + max_non_preemptible_section
     + max_lock_hold(rt_mutex replaced spinlock)
     + ctx_switch_cost
```
PREEMPT_RT 把各项显著缩小：
```
max_interrupt_disable_time -> 极短（仅 ACK）
max_non_preemptible_section -> 仅剩少数原子区
```

## 四、代码实现
```c
// PREEMPT_RT 下自旋锁定义变化（概念）
// 普通：  spinlock_t = { raw_lock, ... }  关抢占
// RT：    spinlock_t = rt_mutex 语义，可睡眠
// 关键宏
#ifdef CONFIG_PREEMPT_RT
#define spin_lock(lock)        rt_spin_lock(lock)    // 可抢占/睡眠
#else
#define spin_lock(lock)        raw_spin_lock(lock)   // 关抢占
#endif
// 中断线程化：request_irq 默认走 threaded 路径
```

## 五、与其他技术对比
- 非抢占内核：时延最大。
- PREEMPT（自愿/可抢占）：通用低延迟，仍有锁关抢占。
- PREEMPT_RT：硬实时，锁可抢占、中断线程化。
- 独立 RTOS：确定性强但生态割裂。

## 六、常见误区
- 误区：PREEMPT_RT 让一切零延迟。硬件中断控制器、缓存未命中仍引入不可消除的底噪。
- 误区：实时内核更快。它牺牲部分吞吐换确定性时延。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/locking/rt-mutex.rst 与 PREEMPT_RT 文档。
- ARMv8 手册描述异常响应延迟来源。
- GitHub CyC2018/CS-Notes 的「实时」小节背景。

## 八、面试题
1. PREEMPT_RT 通过哪些手段降低时延？
2. 为什么把自旋锁改为 rt_mutex 有助于实时？
3. 实时内核是否意味着更高吞吐？

## 九、演进与趋势
PREEMPT_RT 自 5.15 起大步主线化（6.x 多数功能已入主线），逐渐成为通用内核的可选实时模式，降低了对外部补丁的依赖。

## 十、小结
PREEMPT_RT 通过中断线程化与锁可抢占化，把内核不可抢占窗口压到最小，使 Linux 具备可界定的硬实时响应能力。
