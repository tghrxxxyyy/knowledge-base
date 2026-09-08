# SRCU与可睡眠RCU

> 对应 Linux 内核 Documentation/RCU/ 与 Silberschatz《Operating System Concepts》。

## 一、背景与挑战
经典 RCU 读者临界区不能睡眠（否则宽限期可能无限延长，因为静止态迟迟不出现）。有些场景读者需要调用可能阻塞的函数，SRCU（Sleepable RCU）放宽了这一限制。

## 二、核心原理
SRCU 为每个结构体维护一个 srcu_struct，读者用 srcu_read_lock/unlock 递增/递减每 CPU 计数（允许睡眠），写者调用 synchronize_srcu 等待所有读者离开。由于计数是显式的，宽限期检测不依赖 CPU 静止态，因此读者可睡眠。

## 三、形式化与数学基础
设每 CPU 读者计数数组 $C[i]$。活跃读者总数：

$$ N_{active} = \sum_i C[i] $$

宽限期结束条件：

$$ \text{flush} \iff N_{active} \text{ 在 GP 开始后归零并保持} $$

与经典 RCU 不同，归零由计数而非静止态判定，故允许睡眠读者。

## 四、代码实现
SRCU 用法：

```c
struct srcu_struct ss;
int idx;

idx = srcu_read_lock(&ss);
p = rcu_dereference(sptr);
blocking_op(p);          // 允许睡眠
srcu_read_unlock(&ss, idx);

// 写者
newp = update();
rcu_assign_pointer(sptr, newp);
synchronize_srcu(&ss);   // 等待所有读者
kfree(oldp);
```

## 五、与其他技术对比
经典 RCU 读者不可睡眠但零计数开销；SRCU 读者可睡眠但需维护显式计数与每结构体 ss；rwsem 也能睡眠但读者间互斥、并发低于 SRCU。

## 六、常见误区
认为 SRCU 与 RCU 完全一样，SRCU 必须绑定 srcu_struct；认为可混用两种宽限期；忽略 SRCU 内存占用随结构体数增加。

## 七、与开源书/权威来源对应
Linux 内核 Documentation/RCU/ 中 whatisRCU 与 SRCU 说明；Silberschatz 讨论睡眠与互斥；OSTEP 提供 RCU 背景。

## 八、面试题
SRCU 为何允许睡眠；与经典 RCU 区别；srcu_struct 作用；代价是什么。

## 九、演进与趋势
SRCU 被内核广泛用于对文件系统与设备树的睡眠读；与死锁检测工具结合验证宽限期正确性。

## 十、小结
SRCU 通过显式每结构体读者计数，在允许读者睡眠的同时保留 RCU 的发布-订阅更新模型，填补了经典 RCU 不能睡眠的空白。
