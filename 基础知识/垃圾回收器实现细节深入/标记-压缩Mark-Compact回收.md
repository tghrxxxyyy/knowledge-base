# 标记-压缩 Mark-Compact 回收

> 对应 Jones & Lins《Garbage Collection》第 4 章；Wilson 1992（GC 综述）。

## 一、背景与挑战
Mark-Sweep 后堆碎片化，连续大对象难分配。Mark-Compact 在清除同时把存活对象紧凑到一端，消除外部碎片。

## 二、核心原理
两遍：标记后，第一遍计算每个存活对象的新地址（依顺序紧凑），更新引用；第二遍移动对象到新址并修正指针。经典 Lisp 2 算法用 forwarded 指针记录新位置，保证引用一致。

## 三、形式化与数学基础
新地址由前缀和：
$$new(o) = base + \sum_{p < o,\ p\ alive} size(p)$$
移动后所有指向 $o$ 的指针更新为 $new(o)$。总移动量 $\propto \sum alive\_size$。

## 四、代码实现
```c
// Lisp2 紧凑
size_t off = heap_base;
for (o = start; o; o = o->next)
    if (o->marked) { o->forward = off; off += o->size; }
for (o = start; o; o = o->next)
    if (o->marked) move_and_fix(o, o->forward);
```

## 五、与其他技术对比
Mark-Compact 消除碎片、局部性好，但移动需暂停与指针修正，开销高于不移动的 Sweep；复制式 GC 也移动但分代不同。

## 六、常见误区
1. 移动对象必须同时修所有引用，否则悬空。
2. 误以为紧凑免费——指针更新成本高。
3. 忽略对象内部指针（ interior pointers）修正。

## 七、与开源书/权威来源对应
Jones & Lins ch4；Wilson 1992 综述；Lisp 2 算法原始文献。

## 八、面试题
问：为何要压缩？Lisp2 算法两遍做什么？移动为何要修指针？

## 九、演进与趋势
并行紧凑（如 Parallel Scavenge）多线程移动；标记-整理与分代结合提升吞吐。

## 十、小结
Mark-Compact 以移动存活对象消除碎片，代价是暂停与全量指针修正。
