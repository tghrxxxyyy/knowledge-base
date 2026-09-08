# 内存池与DMA一致性

> 对应 Intel SDM 卷3 与 ARMv8 手册。

## 一、背景与挑战
设备通过 DMA 直接读写内存，但 CPU 缓存与设备视角可能不一致，且设备有地址与对齐限制。DMA 池需要对齐、可缓存一致性或一致映射的内存。

## 二、核心原理
DMA 一致性分两类：一致性映射（coherent，如通过 IOMMU 或 Non-Cached 内存，CPU 与设备看到同一视图）与流式映射（需显式同步缓存）。DMA 池专门针对小块、对齐要求高的 DMA 缓冲，基于页分配器切分并保证对齐。

## 三、形式化与数学基础
一致性要求 CPU 写对设备可见、设备写对 CPU 可见，即 absence of stale cache：

$$ \forall \text{addr},\ \text{cache}[addr] = \text{memory}[addr] \quad\text{(coherent)} $$

流式映射需在传输前后 flush/invalidate：

$$ \text{before device read}: \text{flush}(addr, len) $$
$$ \text{after device write}: \text{invalidate}(addr, len) $$

## 四、代码实现
内核 DMA 池：

```c
struct dma_pool *p = dma_pool_create("my", dev, size, align, boundary);
void *v = dma_pool_alloc(p, GFP_KERNEL, &dma_handle);
// 设备用 dma_handle 做 DMA
dma_pool_free(p, v, dma_handle);
```

流式映射同步：

```c
dma_addr_t d = dma_map_single(dev, buf, len, DMA_TO_DEVICE);
dma_sync_single_for_cpu(dev, d, len, DMA_FROM_DEVICE);
```

## 五、与其他技术对比
普通 kmalloc 不保证 DMA 对齐与一致性；DMA 池提供对齐与小块；一致性映射简单但可能慢（关缓存），流式映射快但需手动同步。

## 六、常见误区
认为 kmalloc 返回的内存可直接 DMA，对齐与一致性未必满足；忘记同步流式映射导致读到旧数据；忽略 IOMMU 下的地址是总线地址而非虚拟地址。

## 七、与开源书/权威来源对应
Intel SDM 卷3 与 ARMv8 手册描述缓存与内存类型；Linux Documentation/DMA-API.txt；Hennessy & Patterson 论 I/O 与缓存一致性。

## 八、面试题
一致性映射与流式映射区别；为何需对齐；DMA 地址是什么；同步时机。

## 九、演进与趋势
IOMMU 提供设备隔离与地址转换；SWIO/T trace 帮助调试一致性；Coherent 内存在大页上更高效。

## 十、小结
DMA 内存池以对齐与一致性保证设备直接内存访问的正确性，理解一致性与流式映射的同步边界是驱动开发的关键。
