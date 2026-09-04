# slab分配器

> 对应 Linux `mm/slab.c`/`mm/slub.c` 与《Understanding the Linux Kernel》。

## 一、背景与挑战
内核频繁分配/释放如 `task_struct`、`inode` 等固定大小对象，若每次走伙伴系统（页级）开销大且碎片多。slab 在页块上按对象尺寸缓存复用。

## 二、核心原理
- 每个“缓存（kmem_cache）”对应一种对象大小。
- slab 由若干连续页组成，内部切成等长对象槽；维护 free list。
- 分配直接取 free list 头；释放归还槽，避免反复伙伴分配。

## 三、形式化 / 数学基础
对象大小 $s$，每 slab 页数 $k$，则每 slab 对象数 $n = \\lfloor k\\cdot page\\_size / s \\rfloor$。着色（coloring）通过对齐偏移错开，改善缓存行冲突。

## 四、代码实现
SLUB 快速分配路径（示意）：

```c
void *kmem_cache_alloc(struct kmem_cache *c) {
    struct slab *s = c->cpu_slab;
    if (s && s->freelist) {
        void *obj = s->freelist;
        s->freelist = *(void **)obj;   /* 取下个空闲 */
        return obj;
    }
    return __slab_alloc(c);            /* 慢速：向伙伴要页 */
}
```

## 五、与其他技术对比
伙伴系统管页（2 的幂），slab 管对象（任意尺寸），二者层级配合；用户态 glibc 的 ptmalloc 思路类似但不基于物理页。

## 六、常见误区
- 混淆 slab/slub/slob：三者实现，SLUB 为默认。
- 认为 slab 解决外部碎片：主要减小对象分配开销与内碎片。
- 忽略着色对缓存命中的正面作用。

## 七、与开源书 / 权威来源对应
- CS-Notes：https://github.com/CyC2018/CS-Notes
- 参考 Love《Linux Kernel Development》、Wolf《Linux Kernel Programming》。

## 八、面试题
1. slab 为何比直接伙伴分配快？
2. free list 的作用？
3. SLAB/SLUB/SLOB 区别？

## 九、演进与趋势
SLUB 成为主流，去除复杂队列；引入 objcg（memcg 对象记账）与回收（shrink）机制适配容器场景。

## 十、小结
slab 在伙伴系统之上按对象尺寸建立缓存与 free list，把“页级分配”降为“槽位复用”，显著降低内核小对象分配开销。
