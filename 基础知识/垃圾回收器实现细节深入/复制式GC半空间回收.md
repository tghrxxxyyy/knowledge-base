# 复制式 GC 半空间回收

> 对应 McCarthy 1960（Lisp 递归 GC）；Jones & Lins《Garbage Collection》第 3 章。

## 一、背景与挑战
标记-清除暂停长且碎片多。复制式 GC 把堆分为 from/to 两半，只复制存活对象，回收即整体翻转，简洁高效。

## 二、核心原理
分配只在 from-space 顺序指针 bump 进行。GC 时把根可达对象复制到 to-space 并转发，更新引用；完成后交换 from/to，整块 from 直接废弃。Cheney 算法用扫描指针免递归栈。

## 三、形式化与数学基础
仅复制存活部分，回收时间：
$$T = O(|Reach|)$$
较 Mark-Sweep 的 $O(|Heap|)$ 更优（存活少时）。空间利用率上限 50%（半空间闲置）。

## 四、代码实现
```c
// Cheney 复制
void *copy(obj *o) {
    if (o->forwarded) return o->to;
    new = to_free; to_free += o->size;  // bump
    memcpy(new, o, o->size);
    o->forwarded = new;
    return new;
}
```

## 五、与其他技术对比
复制式无碎片、分配极快（指针加），但浪费一半空间；适合存活率低的年轻代（分代 GC 之基础）。

## 六、常见误区
1. 以为复制免费——需遍历并修正全部引用。
2. 大对象复制成本高，常需直接晋升。
3. 50% 空间浪费在长存活对象场景不划算。

## 七、与开源书/权威来源对应
McCarthy 1960；Jones & Lins ch3；Wilson 1992 综述。

## 八、面试题
问：为何复制式快？半空间浪费？Cheney 算法优势？

## 九、演进与趋势
分代 GC 仅对年轻代用复制；Appel 1989 式多空间复制提升大对象处理。

## 十、小结
复制式 GC 以空间换时间，用半空间翻转实现无碎片、极速分配。
