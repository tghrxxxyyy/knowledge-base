# RCU基本原理与宽限期Grace Period

> 对应 Remzi Arpaci-Dusseau《Operating Systems: Three Easy Pieces》(ostep-code) 与 Linux 内核 Documentation。

## 一、背景与挑战
读多写少且读者不可睡眠的场景下，任何锁都会限制读并发。RCU（Read-Copy-Update）让读者在不获取任何锁的情况下安全遍历，写者通过复制新副本再一次性发布来更新。

## 二、核心原理
读者进入临界区时通过 rcu_read_lock 仅作编译/内存屏障标记，不做原子操作。写者更新时复制旧数据、修改副本，然后用 rcu_assign_pointer 发布，使新读者看到新版本。旧版本在经历一个宽限期（Grace Period，即所有已存在的读者都退出临界区）后才能回收。

## 三、形式化与数学基础
宽限期定义为所有在更新前开始的读者都结束的时刻：

$$ GP = \min\{ t \mid \forall r \text{ started before update}: r \text{ ended by } t \} $$

回收条件：

$$ \text{reclaim}(old) \iff t \ge GP $$

读者与写者的并发由发布-订阅语义保证：

$$ \text{publish}: \text{pub} = \text{atomic\_store}(ptr, new) $$
$$ \text{subscribe}: \text{local} = \text{atomic\_load}(ptr) $$

## 四、代码实现
典型 RCU 用法（Linux 风格）：

```c
// 读者
rcu_read_lock();
p = rcu_dereference(gptr);
use(p);
rcu_read_unlock();

// 写者
newp = kmalloc(...);
*newp = *gptr;
newp->field = newval;
rcu_assign_pointer(gptr, newp);
synchronize_rcu();   // 等待宽限期
kfree(oldp);
```

## 五、与其他技术对比
mutex/rwlock 读者也要同步；seqlock 读者可能重试；RCU 读者零同步开销但写者需复制且延迟回收。RCU 在读远多于写、读者不可阻塞时无可替代。

## 六、常见误区
认为 RCU 读者完全无成本，实际有屏障与不能睡眠的限制；认为写后可立即释放旧内存，必须等宽限期；在读者临界区内调用可能睡眠的函数会破坏 RCU。

## 七、与开源书/权威来源对应
Remzi《OSTEP》第 9 章「locking」与后续 RCU 讨论，仓库 remzi-arpacidusseau/ostep-code 含示例；Linux 内核 Documentation/RCU/ 为权威；Paul McKenney 的 RCU 文章。

## 八、面试题
RCU 读者为何无需锁；宽限期含义；为何写后不能立刻 kfree；rcu_dereference 作用。

## 九、演进与趋势
SRCU 支持睡眠读者；Tasks RCU 用于跟踪空闲任务；用户态 RCU（userspace RCU）把模式带到应用层。

## 十、小结
RCU 以发布-订阅与宽限期实现了读者零竞争的并发更新，代价是写者复制与延迟回收，是读多写少内核数据结构的基石。
