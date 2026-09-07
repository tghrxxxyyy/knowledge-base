# 保守式 GC Boehm-Demers-Weiser

> 对应 Boehm & Weiser 1988（保守式垃圾回收）；Jones & Lins《Garbage Collection》第 9 章。

## 一、背景与挑战
C/C++ 无类型信息、可任意位操作指针，难以精确识别哪些字是指针。Boehm GC 不修改编译器，直接在运行时保守地判定可达性。

## 二、核心原理
把每个字当作"可能是指针"对待：若某字的值落在某堆对象地址范围内，则保守认为该对象可达。扫描栈/寄存器/全局与堆内字，标记可达，未达对象回收。因不能移动对象（否则破坏未知指针），只能 Mark-Sweep。

## 三、形式化与数学基础
保守可达：
$$Reach = \{ o \mid \exists w.\ value(w) \in [base(o), end(o)) \}$$
其中 $w$ 为任意可能被当作指针的字。安全性：$\neg Reach \Rightarrow$ 确不可达（可能漏回收但不误回收）。

## 四、代码实现
```c
// 保守扫描一个字
void scan(void *w) {
    word p = *(word*)w;
    obj *o = find_object_containing(p);
    if (o && !o->marked) { mark(o); }
}
// 替换 malloc 为 GC_malloc
```

## 五、与其他技术对比
精确 GC 靠类型信息移动对象、无碎片；保守 GC 零侵入、兼容任意 C 代码但不可移动、可能残留"似指针"致泄漏（float garbage）。

## 六、常见误区
1. 整数恰巧等于某地址会被当指针——保守误留。
2. 不能压缩/移动，长期碎片。
3. 与 mmap 自定义分配器混用会破坏堆元数据。

## 七、与开源书/权威来源对应
Boehm & Weiser 1988（PLDI）；Jones & Lins ch9；GitHub boehm-gc 实现。

## 八、面试题
问：何为保守式？为何不能移动对象？哪些场景误留？

## 九、演进与趋势
精确栈扫描 + 保守堆扫描的混合模式；C++ 智能指针在语言层替代部分 GC 需求。

## 十、小结
Boehm GC 以"宁可误留不可误收"的保守策略，在不改编译器的前提下为 C 提供自动回收。
