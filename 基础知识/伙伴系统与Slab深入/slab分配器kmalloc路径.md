# slab分配器kmalloc路径

> 对应 Linux 内核 Documentation 与 Silberschatz《Operating System Concepts》。

## 一、背景与挑战
内核频繁分配大量小对象（描述符、缓冲），若每次都向伙伴系统取整页既浪费又慢。slab 分配器在页之上切分同尺寸对象，缓存已初始化对象以加速。

## 二、核心原理
slab 由一或多个连续页组成，切成若干同尺寸对象，按状态（已满/部分/空）挂在 kmem_cache 的链表。kmalloc 根据尺寸选择最近尺寸的通用 cache，从部分满 slab 取对象；释放归还对象并在 slab 全空时可能释放回伙伴系统。

## 三、形式化与数学基础
设 cache 含对象尺寸 $s$，每 slab 对象数 $n = \lfloor \text{pagesize} \times k / s \rfloor$。分配命中：

$$ \text{alloc}: \text{pop free object from partial slab} $$

命中率随局部性提高。slab 利用着色错开对象 cache line 偏移以减少冲突：

$$ \text{color}_i = (i \times \text{align}) \bmod \text{leftover} $$

## 四、代码实现
kmalloc 路径（概念）：

```c
void *kmalloc(size_t size, gfp_t flags) {
    struct kmem_cache *c = kmalloc_slab(size, flags);
    return slab_alloc(c, flags);
}

// slab_alloc 从本地或共享 partial slab 取空闲对象
void *slab_alloc(struct kmem_cache *c, gfp_t flags) {
    if (c->cpu_cache)
        return get_from_cpu_cache(c);
    return get_from_partial(c, flags);
}
```

## 五、与其他技术对比
伙伴系统分配页，slab 在其上切对象，二者分层；SLUB 是现代默认实现，用自由对象链表替代复杂 slab 元数据，更简洁；SLOB 面向极小内存嵌入式。

## 六、常见误区
认为 kmalloc 直接找伙伴系统，实际走 slab cache；认为 slab 无碎片，着色与对齐仍留内部碎片；忽略 GFP 标志决定能否睡眠与回收。

## 七、与开源书/权威来源对应
Linux 内核 mm/slub.c 与 Documentation/vm/slub.rst；Silberschatz 论对象分配；Hennessy & Patterson 论缓存着色。

## 八、面试题
kmalloc 如何选 cache；slab 与伙伴关系；着色目的；SLUB 与 SLAB 区别。

## 九、演进与趋势
SLUB 成为主流，合并了 slab/slob 思路；每 CPU 部分 slab 减少锁；内存标签（kasan）在 slab 上做越界检测。

## 十、小结
slab 分配器在伙伴系统之上提供同尺寸对象的高效缓存，kmalloc 借助它把小对象分配降到接近无锁的本地路径。
