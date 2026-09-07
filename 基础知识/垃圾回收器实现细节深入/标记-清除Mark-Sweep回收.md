# 标记-清除 Mark-Sweep 回收

> 对应 Jones 1959（Lisp 标记-清除）；Jones & Lins《Garbage Collection: Algorithms for Automatic Memory Management》。

## 一、背景与挑战
手动 free 易漏（内存泄漏）或误（悬空指针）。自动回收需在不知程序员意图下识别并回收不可达对象，Mark-Sweep 是最早方案。

## 二、核心原理
分两阶段：标记从根（栈、全局）出发，沿指针图遍历，标记可达对象；清除扫描堆，把未标记对象归还空闲表。对象头存 mark 位。回收后存活对象不移动，故需应对外部碎片。

## 三、形式化与数学基础
可达集：
$$Reach = fixpoint(\{roots\} \cup \bigcup_{o\in Reach} ptrs(o))$$
存活率 $\rho = |Reach|/|Heap|$，清除开销 $O(|Heap|)$ 与存活无关。

## 四、代码实现
```c
void gc() {
    mark_roots();          // 标记根可达
    sweep();               // 清未标记
}
void sweep() {
    for (obj *o = heap_start; o; o = o->next)
        if (!o->marked) free_obj(o);
        else o->marked = 0; // 清标记备下次
}
```

## 五、与其他技术对比
Mark-Sweep 不移动对象、实现简单，但产生外部碎片、暂停长；Mark-Compact 消除碎片但需移动；复制式用空间换时间。

## 六、常见误区
1. 循环引用不影响可达性判定——根不可达即回收。
2. 清除开销与存活无关，大堆长暂停。
3. 保守标记易漏标（见 Boehm GC）。

## 七、与开源书/权威来源对应
Jones 1959 原始论文；Jones & Lins 全书 ch1-3；McCarthy 1960 Lisp GC。

## 八、面试题
问：如何判定可达？Mark-Sweep 缺点？为何有碎片？

## 九、演进与趋势
增量/并发标记把长暂停拆小；三色标记支持并发回收（见 Bacon 2004）。

## 十、小结
Mark-Sweep 以可达性遍历加全堆扫描实现自动回收，是 GC 家族的范式起点。
