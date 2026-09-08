# 线程本地分配器TLAB概念

> 对应 Hennessy & Patterson《Computer Architecture》与 Silberschatz《Operating System Concepts》。

## 一、背景与挑战
多线程同时从共享堆分配会引起锁竞争与缓存行乒乓。线程本地分配缓冲区（TLAB）让每个线程在私有小区域内快速分配，减少对全局堆的争用。

## 二、核心原理
堆被划分为若干线程本地缓冲区，线程优先在自身 TLAB 内用指针碰撞（bump pointer）分配，无需加锁。TLAB 用尽时再从全局堆批取一块。回收可由各线程独立或全局 GC 处理。

## 三、形式化与数学基础
设 TLAB 区间 $[base, top]$，当前指针 $p$。分配尺寸 $s$：

$$ \text{if } p+s \le top:\ p \gets p+s;\ \text{return old } p $$
$$ \text{else}: \text{refill TLAB from global heap} $$

竞争度随 TLAB 增大而下降，但内存闲置（碎片）上升，是权衡：

$$ \text{contention} \downarrow,\ \text{internal fragmentation} \uparrow \text{ as TLAB size} \uparrow $$

## 四、代码实现
bump-pointer 分配（概念）：

```c
typedef struct { char *cur, *end; } tlab_t;
void *tlab_alloc(tlab_t *t, size_t s) {
    if (t->cur + s > t->end) {
        t->cur = get_block_from_heap(&t->end);  // 加锁批量取
        if (!t->cur) return NULL;
    }
    void *p = t->cur;
    t->cur += s;
    return p;
}
```

## 五、与其他技术对比
全局堆分配需锁，TLAB 把无竞争常见路径去锁化；对象池按尺寸分类，TLAB 按线程分类，二者正交可组合；NUMA 分配器进一步按节点本地化。

## 六、常见误区
认为 TLAB 消除所有竞争， refill 仍需全局锁；认为 TLAB 内对象一定同线程回收，GC 场景需扫描；忽略 TLAB 浪费的尾部空间。

## 七、与开源书/权威来源对应
Hennessy & Patterson 论缓存与局部性；Silberschatz 论内存分配；JVM 与 Go 运行时的 TLAB 实现佐证概念。

## 八、面试题
TLAB 为何减少竞争；bump pointer 原理；TLAB 大小权衡；与对象池区别。

## 九、演进与趋势
动态 TLAB 尺寸根据线程分配速率调整；与 NUMA 本地分配结合降低跨节点访问。

## 十、小结
TLAB 用线程私有缓冲区把常规分配去锁化，以少量内部碎片换取显著的并发性能提升，是现代运行时分配器的标配。
