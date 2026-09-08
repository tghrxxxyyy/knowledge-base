# futex与用户态快速锁

> 对应 Linux 内核 Documentation 与 Silberschatz《Operating System Concepts》。

## 一、背景与挑战
传统互斥每次加锁都陷入内核代价高。futex（fast userspace mutex）让无竞争时完全在用户态完成，仅在真正需要等待/唤醒时才进入内核。

## 二、核心原理
futex 是一个用户态 32 位整数。加锁无竞争时原子地比较并交换即可，不进内核。若发现已被占用，则用 FUTEX_WAIT 系统调用把自己挂在与该地址关联的等待队列；解锁者用 FUTEX_WAKE 唤醒。内核以「地址+mm」为键管理等待者。

## 三、形式化与数学基础
用户态原子操作：

$$ \text{lock}: \text{CAS}(uaddr, 0, 1) = \text{true} \implies \text{acquired} $$

竞争时陷入内核：

$$ \text{FUTEX\_WAIT}(uaddr, expected): \text{if } *uaddr = expected\ \text{then sleep} $$
$$ \text{FUTEX\_WAKE}(uaddr, n): \text{wake up to } n \text{ waiters on } uaddr $$

全部逻辑以用户态值为主，内核仅在必要时介入。

## 四、代码实现
glibc 互斥简化思路：

```c
// 用户态快速路径
if (__atomic_compare_exchange_n(&lock, &zero, tid, 0,
        __ATOMIC_ACQUIRE, __ATOMIC_RELAXED))
    return;  // 无竞争
// 慢路径：陷入内核等待
syscall(SYS_futex, &lock, FUTEX_WAIT, tid, NULL, NULL, 0);
```

解锁：

```c
__atomic_store_n(&lock, 0, __ATOMIC_RELEASE);
syscall(SYS_futex, &lock, FUTEX_WAKE, 1, NULL, NULL, 0);
```

## 五、与其他技术对比
传统 System V 信号量每次都系统调用；futex 把快路径留在用户态，慢路径才进内核，极大降低无竞争开销；内核态 spinlock/mutex 面向不同上下文。

## 六、常见误区
认为 futex 是内核锁，它本质是用户态变量+内核等待；认为 FUTEX_WAIT 一定睡眠，若值已变会立即返回；忽略 robust futex 在进程崩溃时恢复锁状态。

## 七、与开源书/权威来源对应
Linux 内核 Documentation/locking/futex.rst；glibc nptl 实现；Silberschatz 讨论用户态同步；OSTEP 涉及 futex 原理。

## 八、面试题
futex 为何快；WAIT 与 WAKE 作用；为何需传入 expected 值；robust futex 解决什么。

## 九、演进与趋势
futex2 支持多地址等待与更优的优先级继承；用户态 RCU 与 futex 协同构建高效同步库。

## 十、小结
futex 把互斥的快路径放在用户态、慢路径交给内核，以地址为键管理等待者，在保持语义正确的同时将无竞争加锁开销降到最低。
