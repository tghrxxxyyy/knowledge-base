# CAS与ABA问题

> 对应比较并交换（CAS）与 ABA 异常。

## 一、背景与挑战
CAS 是无锁编程的核心，但仅比较"值是否相等"，无法感知"值曾被改过又改回"，导致基于旧假设的更新错误地成功——即 ABA 问题。

## 二、核心原理
- CAS 比较地址上的值，相等则写入；否则失败重试。
- ABA：地址值 A→B→A，线程 T1 读 A 后挂起，T2 把 A 改成 B 再改回 A，T1 的 CAS 仍成功，但中间状态已丢失。
- 危害：无锁栈/队列中节点被复用导致指针错乱、数据损坏。
- 解法：版本号/标记指针（ABA 计数）、hazard pointer 延迟回收。

## 三、形式化 / 数学基础
- CAS 可建模为原子 $\text{CAS}(a,e,n)$：若 $M[a]=e$ 则 $M[a]\leftarrow n$ 返回真。
- ABA 发生当 $\exists t_1<t_2<t_3:\ M[a]_{t_1}=A,\ M[a]_{t_2}=B,\ M[a]_{t_3}=A$。
- 带版本：$\text{CAS}\big((v,e),(v+1,n)\big)$，值相同但版本不同则失败。
- 标记指针：借地址低位（对齐余量）存标记位。

## 四、代码实现
```java
// AtomicStampedReference 以 (value, stamp) 双字段 CAS，防 ABA
AtomicStampedReference<Node> head =
    new AtomicStampedReference<>(null, 0);
int[] stamp = new int[1];
Node cur = head.get(stamp);
Node nxt = cur.next;
// CAS 同时校验值与版本号，避免 A->B->A 误判
head.compareAndSet(cur, nxt, stamp[0], stamp[0]+1);
```

## 五、与其他技术对比
- 普通 CAS：简单但有 ABA；带戳 CAS：安全但有额外字段/双字原子。
- 互斥锁：天然无 ABA 但牺牲并发。
- DCAS/MCAS：一次原子比较多字，简化某些无锁结构。

## 六、常见误区
- 认为"值没变就安全"，忽略中间被改回。
- 在链表无锁结构复用已删除节点而不防 ABA。
- 忽视 128 位 CAS（双字）的平台可用性。

## 七、与开源书 / 权威来源对应
- 《The Art of Multiprocessor Programming》ABA 与 stamped reference。
- CS-Notes：https://github.com/CyC2018/CS-Notes （CAS/Atomic 章节）。

## 八、面试题
- 什么是 ABA？举例说明危害。
- 如何用版本号解决 ABA？
- 为什么无锁栈容易受 ABA 影响？

## 九、演进与趋势
硬件双字 CAS 普及；hazard pointer 标准化（C++26 提案）；epoch 回收简化。

## 十、小结
CAS 的 ABA 源于"只比 value 不比历史"，用版本戳或延迟回收可消除，是无锁正确性的关键细节。
