# slab缓存cpu局部性slab

> 对应 Linux 内核 Documentation 与 Hennessy & Patterson《Computer Architecture》。

## 一、背景与挑战
多核下所有核共享一个 slab 缓存会引入锁竞争与缓存行乒乓。把部分 slab 缓存到每 CPU 可显著提速，但需处理不均衡与回收。

## 二、核心原理
每个 CPU 维护一个本地活跃 slab（或对象 freelist），分配优先在本地完成无需锁。本地用尽时从每 CPU 的部分满列表或共享节点列表补充。释放优先归还本地，减少跨核缓存行无效化。

## 三、形式化与数学基础
设 CPU $i$ 本地 freelist $L_i$，共享 $S$。本地分配：

$$ \text{if } |L_i|>0:\ \text{pop } L_i \quad\text{(无锁)} $$
$$ \text{else}:\ L_i \gets \text{refill from } S \text{ (加锁)} $$

缓存局部性提升使对象更可能落在本地 cache：

$$ \text{miss\_rate} \downarrow \text{ as } L_i \text{ 命中} $$

## 四、代码实现
每 CPU 缓存（SLUB 风格概念）：

```c
struct kmem_cache_cpu {
    void **freelist;
    struct page *page;
    int tid;
};

void *kmem_cache_alloc(struct kmem_cache *c) {
    struct kmem_cache_cpu *cpu = this_cpu_ptr(c->cpu_slab);
    if (cpu->freelist)
        return fast_pop(cpu);
    return slow_path(c, cpu);   // 加锁从 node 补充
}
```

## 五、与其他技术对比
无每 CPU 缓存的 slab 需全局锁，扩展性差；对象池按尺寸、TLAB 按线程，slab cpu 局部性可视为内核版 TLAB；NUMA 进一步把 node 本地 slab 优先给同节点 CPU。

## 六、常见误区
认为每 CPU 缓存越多越好，会掩盖全局回收压力；忽略 CPU 迁移导致 tid 校验；认为本地对象永远本地，回收时仍回共享。

## 七、与开源书/权威来源对应
Linux mm/slub.c 的 kmem_cache_cpu；Hennessy & Patterson 论缓存局部性与多核；内核 Documentation 描述 per-cpu。

## 八、面试题
每 CPU slab 为何快；什么时候走慢路径；tid 作用；NUMA 如何配合。

## 九、演进与趋势
每 CPU 部分列表与本地回收优化；内存 cgroup 对 slab 计费的精细化。

## 十、小结
slab 的每 CPU 局部性把常见分配路径去锁化并提升缓存命中，是内核在多核下保持分配性能的关键设计。
