# 读写锁与RCU

> 对应 Love《Linux Kernel Development》第 10 章 RCU 与 Bryant & O'Hallaron《CSAPP》第 12 章。

## 一、背景与挑战
很多数据结构读多写少（路由表、配置）。普通互斥让读也互斥，吞吐受限。读写锁允许多读并发、写独占；RCU（read-copy-update）则进一步让读者零同步、写者延迟回收。

## 二、核心原理
rwlock：多个读者持读锁并发，写者需独占且无读者。`rcu_read_lock()` 仅禁止抢占、读者无锁读指针；写者复制并更新指针（`rcu_assign_pointer`），旧版本等所有读者退出宽限期（grace period）后回收。读侧近乎零成本。

## 三、形式化与数学基础
rwlock 并发：
$$readers \ge 0,\; writer \Rightarrow readers=0$$
RCU 宽限期：$GP$ 结束当且仅当所有在 `rcu_read_lock` 前的读者已完成：
$$reclaim(old) \iff \forall r\in readers_{before},\; r\; done$$
读者无原子操作，故读吞吐 $\approx$ 无锁。

## 四、代码实现
```c
// RCU 发布新版本
struct route *new = copy(old);
new->dst = x;
rcu_assign_pointer(g_route, new);   // 原子指针切换
synchronize_rcu();                  // 等宽限期
free(old);                          // 安全回收
```

## 五、与其他技术对比
RCU 读者零开销但写者复制+延迟回收；rwlock 简单但写者饿读、读自旋。相较 seqlock，RCU 不需读者重试。用户态 RCU（urcu）库提供类似能力。

## 六、常见误区
误以为 RCU 读者无代价意味着写快：写需复制与等待宽限期。误以为可立刻释放旧版：须过 GP。误以为 RCU 替代所有锁：只适合读多写少、可延迟回收。

## 七、与开源书/权威来源对应
Love LKD 第 10 章 RCU 与 rculist；OSTEP RCU 章；CSAPP 12 章并发。

## 八、面试题
问：RCU 读者为何不用锁？答：读只解引用稳定指针，写切换指针后旧版延迟回收。问：宽限期含义？

## 九、演进与趋势
RCU 多 flavor（sched/bh/task）；树形宽限期扩展至多核；用户态 urcu 成熟。

## 十、小结
读写锁与 RCU 针对读多写少优化，RCU 以"复制+延迟回收"把读者开销降到近零。
