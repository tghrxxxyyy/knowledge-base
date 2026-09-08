# RCU链表与发布订阅语义

> 对应 remzi-arpacidusseau/ostep-code 与 Linux 内核 Documentation/RCU/。

## 一、背景与挑战
链表是内核最常见的 RCU 保护结构：读者遍历，写者插入/删除。若写者直接改指针，读者可能看到半更新状态或悬空指针。RCU 用发布-订阅保证读者要么看到旧完整版本要么新完整版本。

## 二、核心原理
插入时用 INIT_LIST 与 rcu_assign_pointer 把新节点发布为可见；删除时从链表摘除但延迟 kfree，期间读者仍可安全遍历旧链接。读者用 rcu_dereference 订阅指针并在临界区内遍历，完整性由宽限期保证。

## 三、形式化与数学基础
发布-订阅保证指针读取的地址依赖顺序：

$$ \text{subscribe}: p = \text{rcu\_dereference}(g) \implies \text{dependent loads see } *p \text{ 一致} $$

插入的线性化点：

$$ \text{publish}: g \gets \text{new} \quad \text{对所有后续读者可见} $$

删除时旧节点在 $t \ge GP$ 后回收，故读者在 GP 前取的引用仍有效。

## 四、代码实现
RCU 链表删除：

```c
// 写者
next = rcu_dereference_protected(p->next, lock_held);
prev->next = next;            // 摘除
synchronize_rcu();            // 等宽限期
kfree(p);                     // 安全回收

// 读者
rcu_read_lock();
list_for_each_rcu(pos, head) {
    if (match(pos)) use(pos);
}
rcu_read_unlock();
```

## 五、与其他技术对比
普通链表删除需锁保护读者；引用计数复杂且缓存不友好；RCU 链表让读者完全无锁，但写者必须复制（更新）或延迟释放（删除），且不支持对节点的原地修改。

## 六、常见误区
认为删除后立刻 kfree 安全，读者可能正持有；认为可原地修改节点字段，必须复制；忽略 rcu_dereference 的地址依赖屏障作用。

## 七、与开源书/权威来源对应
OSTEP 的 RCU 章节与 ostep-code 示例演示链表遍历；Linux include/linux/rculist.h；Documentation/RCU/whatisRCU.rst。

## 八、面试题
RCU 链表为何删除后不能立即释放；rcu_assign_pointer 作用；读者如何保持一致性；何时必须复制而非删除。

## 九、演进与趋势
SLAB_TYPESAFE_BY_RCU 让对象可 RCU 安全复用；结合 hazard pointers 作为用户态替代。

## 十、小结
RCU 链表通过发布-订阅与延迟回收，使读者在无锁下遍历一致的结构，写者以摘除后等宽限期的代价换取读侧极致并发。
