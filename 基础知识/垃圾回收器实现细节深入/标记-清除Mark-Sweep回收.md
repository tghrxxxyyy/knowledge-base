# 标记-清除 Mark-Sweep 回收

> 对应 McCarthy 1960（Lisp 的标记-清除式回收）；Jones & Lins《Garbage Collection: Algorithms for Automatic Memory Management》第 2 章。

## 一、背景与挑战

手动 `free` 既容易漏（内存泄漏），也容易错（悬空指针、double free）。自动回收要求在不掌握程序员意图的前提下判定"哪些对象永远不会再被访问"，这在可计算性上是不可判定问题的近似——GC 只能退而求其次，用**可达性**作为存活的保守近似。

Mark-Sweep 是最早实现的方案：它不移动对象，因此与"指针可被程序随意保存"的 C 风格语言天然兼容；但也正因不移动，它必须面对外部碎片与全堆扫描带来的长暂停。

## 二、核心原理

两个阶段：

- **标记（mark）**：从根集合（线程栈、寄存器、全局/静态区）出发，沿指针图做图遍历，把可达对象打标。可用显式标记栈、指针反转（Deutsch-Schorr-Waite）或 Cheney 式扫描指针来控制辅助空间。
- **清除（sweep）**：线性扫描整个堆，把未标记对象归还空闲表（或按大小分类的 segregated free list），并清除存活对象的标记位以备下轮。

标记位通常放在对象头；若对象头空间紧张，可用**位图（mark bitmap）**单独记录，好处是可按位批量扫描、提升 cache 利用率，也是并行/并发标记常用的布局。清除不移动对象，因此回收后需要分配器按大小匹配空闲块，必要时做块合并（coalescing）以对抗碎片。

## 三、形式化与数学基础

可达集是不动点：

$$Reach = \mathrm{fixpoint}\Big(\{roots\} \cup \bigcup_{o \in Reach} ptrs(o)\Big)$$

设存活率 $\rho = |Reach|/|Heap|$，则标记阶段成本为 $O(|Reach| + |Edges|)$，而清除阶段成本恒为 $O(|Heap|)$，与 $\rho$ 无关——这正是大堆下暂停难以压缩的根源。

碎片可用"空闲块大小分布"刻画。若空闲块大小服从经验分布，则一次大小为 $s$ 的分配失败概率近似

$$P_{fail}(s) \approx 1 - F_{free}(s)$$

即使 $\sum free \gg s$ 也可能失败，这就是外部碎片的量化表达。合并策略把相邻空闲块合并后，$F_{free}$ 的尾部显著变厚。

## 四、代码实现

```c
/* 用显式标记栈避免递归爆栈 */
static obj **mstack; static size_t mtop;

static void mark(obj *o) {
    if (!o || o->marked) return;
    o->marked = 1;
    for (obj **f = refs_of(o); f; f = next_ref(f))
        if (is_heap_ptr(*f)) mstack[mtop++] = *f;   /* 灰对象入栈 */
}

void gc(void) {
    mtop = 0;
    for (obj **r = roots(); r; r = next_root(r)) mark(*r);
    while (mtop) mark(mstack[--mtop]);              /* 广度/深度皆可 */
    sweep();
}

void sweep(void) {
    for (obj *o = heap_start; o < heap_end; o = next_obj(o))
        if (!o->marked) free_obj(o);                /* 归还空闲表 */
        else o->marked = 0;                         /* 清位备下轮 */
}
```

注意 `sweep` 中"未标记即回收"的前提是标记阶段完整且无并发修改；一旦引入并发，就必须用三色不变式与写屏障来补漏。

## 五、与其他技术对比

| 维度 | Mark-Sweep | Mark-Compact | 复制式 |
| --- | --- | --- | --- |
| 是否移动对象 | 否 | 是 | 是 |
| 外部碎片 | 有 | 无 | 无 |
| 分配速度 | 慢（空闲表匹配） | 快 | 极快 |
| 空间开销 | 低 | 中（forwarding） | 高（半空间） |
| 与保守式/未知指针兼容 | 好 | 差 | 差 |
| 暂停构成 | 标记 + 全堆扫描 | 标记 + 移动 | 与存活量成正比 |

## 六、常见误区

1. **以为循环引用无法回收**：可达性判定的是"从根是否可达"，环内对象若整体不可达则一并回收；引用计数才需要专门处理环。
2. **忽略清除与存活率无关**：清除必须走完整堆，大堆即使几乎全是垃圾也要扫完。
3. **忘记清除标记位**：漏清会让下一轮所有对象都被当作存活，堆迅速耗尽。
4. **以为碎片会自动消除**：不移动的实现必须靠块合并与分配策略缓解，无法根治。
5. **把保守标记当作精确标记**：若把任意字当指针（保守式），会保留"假活"对象。

## 七、与开源书·权威来源对应

- McCarthy 1960 关于 Lisp 符号表达式与自动存储回收的工作。
- Jones & Lins《Garbage Collection: Algorithms for Automatic Memory Management》标记-清除相关章节。
- 《The Garbage Collection Handbook》标记-清除与标记位图布局章节。
- Wilson 1992《Uniprocessor Garbage Collection Techniques》对 mark-sweep 成本模型的分析。
- 具体分配器与位图实现细节随运行时不同，以官方最新文档为准。

## 八、面试题

1. **如何判定对象可达？** 要点：从根集合做指针图可达闭包（不动点），不可达即视为垃圾。
2. **Mark-Sweep 的缺点？** 要点：外部碎片、清除阶段 $O(|Heap|)$ 的长暂停、分配需空闲表匹配。
3. **为什么会产生碎片？** 因为回收只把对象标记为空闲而原地保留存活对象，空闲区被存活对象切散。
4. **标记位放对象头还是位图？** 要点：对象头省空间但破坏局部性、需触碰对象；位图便于批量扫描与并行，但需额外元数据。
5. **为什么 Mark-Sweep 更适合保守式 GC？** 因为不移动对象，未知/误判的指针不会因搬迁而失效。

## 九、演进与趋势

增量与并发标记把长暂停拆成小步（Dijkstra 增量更新、Yuasa SATB）；位图标记与按页并行清扫让 Mark-Sweep 能多核扩展（如 Parallel/CMS 风格）。现代实现常把 Mark-Sweep 与分代、region 化结合，用"标记-清除 + 周期性压缩"在碎片与暂停之间取得折中。

## 十、小结

Mark-Sweep 以"从根遍历 + 全堆扫描"实现自动回收，是 GC 家族的范式起点。它的不移动特性带来兼容性优势，也带来碎片与长暂停两个结构性代价，后世算法基本都在围绕这两点做改进。
