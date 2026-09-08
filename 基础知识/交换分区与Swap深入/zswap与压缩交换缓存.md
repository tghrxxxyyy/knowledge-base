> 对应 Linux 内核 Documentation（admin-guide/kernel-parameters.txt 的 zswap）与 ostep-code「paging」。

## 一、背景与挑战
把冷页写到磁盘 swap 延迟高、磨损 SSD。很多换出页之间压缩后远小于原始大小，若先在内存里压缩缓存，能显著减少真实 IO。挑战是管理「压缩池」、处理压缩失败与回退到真实 swap。

## 二、核心原理
zswap 是位于「匿名页回收」与「真实 swap 设备」之间的前端缓存。被换出的页先经压缩算法（默认 zbud/zsmalloc 分配器 + lzo/lz4）压缩，存入内存中的压缩池；只有当池满或压缩比差时，才逐出到真实 swap 设备。读入时优先从压缩池解压，命中则完全避免磁盘 IO。

## 三、形式化与数学基础
设页原始大小 P，压缩后大小 C = P × r（压缩比 r<1）。压缩池可容纳的等效页数：
```
N_eff = (pool_bytes / C) = (pool_bytes / (P × r))
```
相比未压缩的 N_raw = pool_bytes / P，容量提升约 1/r 倍。节省的磁盘 IO 量 ≈ (hits / total) × P × (1 - r)。当 r 接近 1（不可压数据如加密页），zswap 退化为直接送 swap。

## 四、代码实现
```c
// mm/zswap.c（极度简化）
int zswap_store(struct page *page)
{
    if (!zswap_enabled)
        return -EINVAL;
    dst = zswap_comp_op(ZSWAP_COMPOP_COMPRESS, src, PAGE_SIZE, &dlen);
    if (dlen > PAGE_SIZE * max_comp_ratio / 100)
        return -E2BIG;                    // 压不划算，走真实 swap
    entry = zswap_entry_cache_alloc(GFP_KERNEL);
    entry->handle = zswap_pool_alloc_handle(dlen);
    memcpy_to_pool(entry->handle, dst, dlen);
    return 0;                              // 仅存压缩副本
}
```

## 五、与其他技术对比
- 直接 swap：简单但 IO/磨损高。
- zswap：内存换压缩空间，省 IO，需 CPU 压缩。
- zram：把「swap 设备」本身变为内存中压缩块设备，更激进。
- zcache：早期雏形，已被 zswap/zram 取代。

## 六、常见误区
- 误区：zswap 完全不用磁盘。池满时仍回退到真实 swap。
- 误区：压缩永远划算。不可压数据反而浪费 CPU，靠 max_comp_ratio 过滤。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/admin-guide/kernel-parameters.txt 列出 zswap.enabled 等参数。
- ostep-code「paging」讨论页换出成本，为 zswap 动机铺垫。
- GitHub Vonng/ddia 的缓存压缩笔记类比「用 CPU 换 IO」。

## 八、面试题
1. zswap 与 zram 的根本区别？
2. 什么情况下 zswap 会把页送交真实 swap？
3. 压缩比 r 接近 1 时对系统意味着什么？

## 九、演进与趋势
分配器从 zbud 演进到 zsmalloc，压缩算法支持 lz4/zstd 多种；与 zswap writeback 限流结合，避免压缩池回写风暴。

## 十、小结
zswap 用「内存压缩」兑换「磁盘 IO 与磨损」，是匿名页回收路径上的高效前端缓存，本质是以 CPU 换 IO 的缓存层。
