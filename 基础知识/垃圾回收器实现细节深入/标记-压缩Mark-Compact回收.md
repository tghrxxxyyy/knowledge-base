# 标记-压缩 Mark-Compact 回收

> 对应 Jones, Hosking & Moss《The Garbage Collection Handbook》标记-整理章；Wilson 1992《Uniprocessor Garbage Collection Techniques》。

## 一、背景与挑战

Mark-Sweep 回收后堆中散布着大小不一的空洞，分配连续大对象时可能"总空闲足够但没有一块足够大"，即外部碎片。Mark-Compact 在标记之后把存活对象整体搬向堆的一端，使空闲区合并为单一连续块。

代价是移动本身必须修复**所有**指向被移动对象的引用，包括栈、寄存器、静态区与堆内字段；且移动过程通常无法与 mutator 并发，容易产生长暂停。如何在有限元数据下正确计算出每个对象的新地址，是这一族算法的核心工程问题。

## 二、核心原理

典型流程分三遍：

1. **标记**：从根出发标记可达对象。
2. **计算新地址**：按地址顺序累加存活对象大小，得到每个存活对象的新位置，写入其对象头的 forwarding 字段。
3. **移动与修正**：按序搬移对象内容，并把所有引用改写为新地址。

经典 **Lisp 2 算法**用"先算地址、再改引用、后移动"的固定顺序避免悬空：任何时刻读到的引用要么指向未移动对象，要么指向已写入 forwarding 的新地址。与之相对，**Threading（穿线）**算法把 forwarding 指针塞进对象内部字段、并沿引用链就地更新，省掉一次堆遍历，但要求修改所有引用槽；**Two-Finger** 算法从两端相向扫描，用滑动指针直接搬迁，无需额外 forwarding 表，但不保持对象原始顺序。

## 三、形式化与数学基础

设堆内对象按地址排序，存活指示函数 $alive(o)\in\{0,1\}$，则新地址由前缀和给出：

$$new(o) = base + \sum_{p < o,\ p\ alive} size(p)$$

搬移后的引用修正规则为：

$$\forall f:\quad *f \leftarrow new(*f) \quad\text{若 } alive(*f)$$

总搬移字节数 $\sum_{o\ alive} size(o)$，因此成本随存活率上升而线性上升（与复制式相同），但它不需要额外半空间，空间利用率接近 100%。碎片度量可用"最大可分配块" $M$ 描述：压缩后 $M = |Heap| - \sum alive$。

## 四、代码实现

```c
/* Lisp2 风格：第一遍算新址，第二遍搬移并修正 */
static char *free_off;

void compute_addresses(void) {          /* pass 1 */
    free_off = heap_base;
    for (obj *o = heap_base; o < heap_end; o = next_obj(o))
        if (o->marked) { o->forward = free_off; free_off += o->size; }
}

void adjust_refs(void) {                /* pass 2: 修正全部引用槽 */
    for (obj *o = heap_base; o < heap_end; o = next_obj(o))
        if (o->marked)
            for (obj **f = refs_of(o); f; f = next_ref(f))
                if (is_heap_ptr(*f) && (*f)->marked)
                    *f = (*f)->forward;
}

void move_objects(void) {               /* pass 3: 真正搬运 */
    for (obj *o = heap_base; o < heap_end; o = next_obj(o))
        if (o->marked) memmove(o->forward, o, o->size);
}
```

注意 `memmove` 必须按地址升序执行：这样目标区（低位）永远先于源区被腾空，不会覆盖尚未搬运的对象。

## 五、与其他技术对比

| 维度 | Mark-Compact | Mark-Sweep | 复制式 |
| --- | --- | --- | --- |
| 外部碎片 | 无 | 有 | 无 |
| 空间开销 | 低（仅 forwarding） | 低（仅标记位） | 高（半空间） |
| 暂停 | 长（含移动与修正） | 长（扫描全堆） | 与存活量成正比 |
| 分配速度 | 快（bump） | 慢（查空闲表） | 极快 |
| 引用修正 | 必须 | 不需要 | 必须 |
| 局部性 | 好 | 差 | 好 |

## 六、常见误区

1. **以为移动是免费的**：改引用槽的代价常高于 `memcpy` 本身，尤其对象图边数多时。
2. **忽略内部指针**：若语言/运行时有指向对象内部的指针（如 C 的 `&s->field`），搬迁后必须一并修正，否则悬空。
3. **忘记根也要更新**：栈、寄存器、静态区的引用与新地址必须同步改写。
4. **搬移顺序错误**：目标区在低位时必须升序搬移，否则会覆盖未处理的源对象。
5. **并发下无转发协议就移动**：mutator 可能读到半搬移状态，必须配合读屏障或短暂 STW。

## 七、与开源书·权威来源对应

- 《The Garbage Collection Handbook》标记-整理章（Lisp 2、Threading、Two-Finger 等算法对比）。
- Wilson 1992 综述中 compacting collectors 小节。
- Jones & Lins《Garbage Collection: Algorithms for Automatic Memory Management》对应章节。
- HotSpot Serial Old / Parallel Old 的标记-整理实现说明（滑动压缩）。
- 各算法具体变体与参数随实现版本不同，以官方最新文档为准。

## 八、面试题

1. **为什么需要压缩？** 要点：消除外部碎片，使大对象分配可行，并改善缓存局部性、支持 bump 分配。
2. **Lisp 2 两遍分别做什么？** 要点：先按地址顺序累加存活大小算出新地址写入 forwarding；再改引用；最后搬移。
3. **Threading 与 Lisp 2 的区别？** 要点：Threading 把 forwarding 塞进对象字段并沿引用链就地更新，省一次堆遍历，但要求能改写所有引用槽。
4. **Two-Finger 算法的特点？** 要点：两端相向扫描、滑动指针搬迁，无需额外 forwarding 表，但不保证对象相对顺序。
5. **移动为何必须修指针？** 要点：引用保存的是旧地址，对象搬走后旧地址可能被复用或成为垃圾，必须改写为新地址。

## 九、演进与趋势

并行/并发压缩成为主流：Parallel Old 用多线程分块搬移；Shenandoah 用 Brooks 转发指针加读屏障实现并发压缩；ZGC 用染色指针把"转发信息"编码进指针本身，配合读屏障自愈，使压缩暂停与存活量解耦。同时 region 化堆让"整堆压缩"变成"选择性压缩若干 region"，进一步控制单次暂停。

## 十、小结

Mark-Compact 以移动存活对象换取零外部碎片与快速分配，代价是暂停期间的全量引用修正。它处于 Mark-Sweep（不移动但碎片化）与复制式（移动且浪费空间）之间，是现代老年代回收与并发压缩方案的基础。
