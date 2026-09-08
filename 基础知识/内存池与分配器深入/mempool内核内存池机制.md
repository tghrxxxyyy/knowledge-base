# mempool内核内存池机制

> 对应 Linux 内核 Documentation 与 Silberschatz《Operating System Concepts》。

## 一、背景与挑战
某些路径（如块设备 IO 错误处理）在内存极度紧张时仍必须分配成功，否则系统可能死锁。mempool 预先保留一批对象，保证在紧急情况下也能拿到内存。

## 二、核心原理
mempool 初始化时预分配 $min$ 个对象并维护空闲栈。分配时优先从底层分配器取，失败则从保留池取；释放时若池未满则归还池，否则归还底层。这样保证至少有 $min$ 个对象随时可用。

## 三、形式化与数学基础
设池容量 $M$，当前空闲 $F$，底层可用 $B$。分配可成功条件：

$$ \text{success} \iff (B > 0) \lor (F > 0) $$

且保留不变量：

$$ F \ge 0,\quad \text{已分配出自池的数量} \le M $$

因此最坏情况下仍有 $M$ 个对象可应急。

## 四、代码实现
内核 mempool 用法：

```c
mempool_t *pool = mempool_create(min, alloc_fn, free_fn, NULL);

void *obj = mempool_alloc(pool, GFP_NOIO);
// 使用 obj
mempool_free(obj, pool);
```

alloc_fn 通常基于 kmalloc 或页分配器，free_fn 对应释放。

## 五、与其他技术对比
普通 kmalloc 在内存紧张时可能失败；mempool 以预保留牺牲一些内存换取确定性成功；伙伴系统与 slab 是底层提供者，mempool 是上层保障层。

## 六、常见误区
认为 mempool 能无限分配，预保留量有限；认为它替代 slab，实际建在 slab/页之上；过度使用会浪费内存。

## 七、与开源书/权威来源对应
Linux 内核 mm/mempool.c 与 Documentation/；Silberschatz 讨论内存管理；Hennessy & Patterson 论层次化存储。

## 八、面试题
mempool 解决什么；与普通分配器区别；为何用于 IO 错误路径；代价。

## 九、演进与趋势
mempool 在存储与网络子系统持续用于保证前向进展；与内存回收压力区分结合。

## 十、小结
mempool 通过预保留对象为关键路径提供确定性分配保障，是内核在「省内存」与「保活」之间的工程折中。
