# Linux等待队列wait_queue_head

> 对应 Linux 内核 Documentation 与 Silberschatz《Operating System Concepts》。

## 一、背景与挑战
内核中大量代码需「等某事件」（IO 完成、信号、资源可用）。若每个子系统自造等待机制会重复且易错，wait_queue_head 提供统一的阻塞等待抽象。

## 二、核心原理
wait_queue_head 是一个自旋锁保护的链表，节点 wait_queue_entry 代表一个等待者，含回调（默认 autoremove_wake_function）。等待者调用 wait_event 宏，它在 while 谓词不成立时 schedule() 让出 CPU；唤醒者调用 wake_up 遍历队列调用回调。

## 三、形式化与数学基础
队列 $Q$ 为等待者链表，谓词 $P$。等待：

$$ \text{while } \neg P:\ \text{add}(self, Q);\ \text{schedule()};\ \text{remove}(self, Q) $$

唤醒：

$$ \text{wake\_up}(Q): \forall e \in Q:\ e.\text{callback}(e) $$

默认回调唤醒对应任务并自移除。

## 四、代码实现
内核等待队列用法：

```c
wait_queue_head_t wq;
init_waitqueue_head(&wq);
int cond = 0;

// 等待者
wait_event(wq, cond != 0);
use_data();

// 唤醒者
cond = 1;
wake_up(&wq);
```

底层等价于：

```c
prepare_to_wait(&wq, &entry, TASK_UNINTERRUPTIBLE);
while (!cond) schedule();
finish_wait(&wq, &entry);
```

## 五、与其他技术对比
wait_event 类似条件变量的 while 谓词循环，但运行在内核且可中断/不可中断；completion 是一次性语义特化；poll_wait 把等待队列挂到文件轮询表以支持多路复用。

## 六、常见误区
认为 wait_event 不持锁也安全，谓词与唤醒需正确内存屏障；在原子上下文用会睡眠的 wait_event；忘记把条件置位后再 wake_up。

## 七、与开源书/权威来源对应
Linux 内核 include/linux/wait.h 与 Documentation/ 的等待队列说明；Silberschatz 讨论阻塞与唤醒；OSTEP 涉及等待。

## 八、面试题
wait_queue_head 结构；wait_event 等价逻辑；为何条件变更后需 wake_up；可中断与不可中断区别。

## 九、演进与趋势
wait/wound 互斥与互斥等待队列扩展；EPOLL 在用户态复用内核等待队列思想。

## 十、小结
wait_queue_head 是内核统一的阻塞等待机制，以链表决等待者与谓词循环实现事件等待，是驱动与文件系统阻塞操作的基础。
