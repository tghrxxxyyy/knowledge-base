# 复制式 GC 半空间回收

> 对应 McCarthy 1960（Lisp 递归 GC）；Cheney 1970《A Nonrecursive List Compacting Algorithm》；Jones, Hosking & Moss《The Garbage Collection Handbook》。

## 一、背景与挑战

标记-清除的暂停与堆大小成正比，且回收后留下外部碎片。复制式 GC 换一个思路：不区分"垃圾"与"存活"，只把存活对象搬到另一块空间，旧空间整体丢弃——移动成本只与**存活数据量**成正比。

代价是空间：需要一块等大的空闲区用于接收，理论上堆利用率上限只有 50%（半空间方案）。

## 二、核心原理

堆分成 from-space 与 to-space 两半，分配永远只在 from-space 的顶部做**指针碰撞（bump allocation）**：`free += size`，一条加法指令即可完成分配。

GC 时从根出发，把可达对象逐个拷贝到 to-space 并在原对象里留下**转发指针（forwarding pointer）**；遇到已转发的对象直接返回新地址，从而自然处理共享与环。Cheney 算法用"扫描指针 + 自由指针"在 to-space 内做广度优先遍历，用迭代替代递归，栈开销降为 $O(1)$。全部处理完后交换两块空间角色。

## 三、形式化与数学基础

回收时间只与可达集大小相关：

$$T_{copy} = O(|Reach| + |Edges_{Reach}|)$$

而标记-清除是 $O(|Heap|)$。当存活率 $\rho = |Reach|/|Heap|$ 很低时，复制式显著占优。三空间（Appel）变体把利用率从 50% 提升到约 2/3：两块大空间与一块小空间，小空间充当 to-space，只处理"幸存次数少"的对象。

$$Utilization_{2space} = 0.5,\qquad Utilization_{3space} \approx 0.667$$

指针翻转后所有引用必须重写：若某字段指向已转发对象，则更新为转发地址；这就是复制式"必须修正全部引用"的来源。

## 四、代码实现

```c
/* Cheney 广度优先复制：scan 与 free 两个指针推进 */
static char *scan, *free_ptr;

void *forward(obj *o) {
    if (o->forwarded) return o->to;          /* 已复制，直接返回新址 */
    char *n = free_ptr;                       /* bump 分配 */
    free_ptr += o->size;
    memcpy(n, o, o->size);                    /* 浅拷贝字段 */
    o->to = n; o->forwarded = 1;
    return n;
}

void cheney(void) {
    scan = free_ptr = to_space;
    for (each root r) {
        obj *n = forward(r);
        *r = n;                              /* 根也要修正 */
    }
    while (scan < free_ptr) {                /* to-space 自身的字段 */
        obj *cur = (obj *)scan;
        for (each ref f in cur) { *f = forward(*f); }
        scan += cur->size;
    }
}
```

`scan < free_ptr` 这个循环条件是关键：被复制进来的对象也会被当作扫描对象，等价于用队列实现了工作列表。

## 五、与其他技术对比

| 维度 | 复制式（半空间） | Mark-Sweep | Mark-Compact |
| --- | --- | --- | --- |
| 成本 | $O(\text{存活量})$ | $O(\text{堆大小})$ | $O(\text{堆大小})$ |
| 分配速度 | 极快（bump） | 需查空闲表 | 需查空闲表 |
| 碎片 | 无 | 有外部碎片 | 无 |
| 空间利用率 | 约 50%（三空间约 67%） | 接近 100% | 接近 100% |
| 局部性 | 好（按遍历序紧凑） | 差 | 好 |
| 前提 | 存活率低 | 无 | 无 |

## 六、常见误区

1. **以为复制不花钱**：需要遍历并改写所有指向存活对象的引用，边数多时成本上升。
2. **大对象直拷**：巨型数组/缓冲逐字节拷贝代价高，实际实现常把大对象单独分配，直接"晋升"而不拷贝。
3. **忽略 50% 浪费**：长存活数据为主的负载（如常驻缓存）成本极高，必须与分代/标记方案结合。
4. **忘记根也要更新**：栈上的根引用若不修正，翻转后立即指向旧空间。

## 七、与开源书·权威来源对应

- McCarthy 1960 关于 Lisp 的符号表达式与递归垃圾回收。
- Cheney 1970 的非递归压缩算法（即 Cheney 算法原型）。
- 《The Garbage Collection Handbook》复制式回收章节；Wilson 1992 综述的 copying collectors 部分。
- Appel 1989 关于多空间复制与实时 GC 的工作（用于三空间利用率分析）。

## 八、面试题

1. **为什么复制式分配极快？** 要点：只需移动自由指针（bump），无需查找空闲链表，前后分配在空间上连续。
2. **半空间为什么浪费 50%？** 要点：需要等价大小的 to-space 接收存活对象；三空间/分代方案可部分缓解。
3. **Cheney 算法相比递归复制优势？** 要点：用扫描指针迭代代替递归栈，深度与对象图无关，缓存局部性更好。
4. **复制式为何要求"转发指针"？** 要点：对象可能被多条边引用，必须用旧地址找到新地址，避免重复拷贝并保证引用一致。

## 九、演进与趋势

复制式成为年轻代回收的默认形态：分代 GC 只在 Eden/Survivor 间复制，老年代改用标记类算法。Apple 的 Appel 式多空间收集器、以及现代 JVM 的 Young GC 都延续这一思路；同时大对象走独立区域（如 G1 的 humongous region）以避免昂贵拷贝。

## 十、小结

复制式 GC 用一半空间换取"只搬活对象"的时间收益与零碎片、极速分配。它以存活率低为前提，也正是分代 GC 年轻代回收的理论基础。
