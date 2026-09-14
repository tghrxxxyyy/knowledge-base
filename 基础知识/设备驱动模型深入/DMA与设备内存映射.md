# DMA与设备内存映射

> 对应 Corbet、Rubini & Kroah-Hartman《Linux Device Drivers》（LDD3）第 15 章 Memory Mapping and DMA 与 Bovet & Cesati《Understanding the Linux Kernel》第 13 章 The Block I/O Layer / PCI；并参考内核文档 `Documentation/core-api/dma-api.rst` 与 `Documentation/DMA-API-HOWTO.txt`。

## 一、背景与挑战

若 CPU 逐字节搬运网卡/磁盘数据，总线与 CPU 被占用、吞吐受限，且占用宝贵的计算周期。

DMA（直接内存访问）让设备直接读写内存，CPU 仅设置描述符与发起传输。

但 DMA 引入三类难题：缓存一致性（CPU 缓存可能与设备看到的内存不一致）、物理连续性（设备常需连续物理页）、以及隔离（恶意/错误设备越权访问内存）。

IOMMU 与 DMA API 正是为系统化处理这三者而设。

## 二、核心原理

驱动用 `dma_alloc_coherent` 分配设备可访问的一致映射内存（硬件保证或关闭缓存，使 CPU 与设备看到同一值），或用 `dma_map_single` 流式映射普通内存并做缓存回写/失效。

IOMMU 把设备看到的 IOVA（I/O 虚拟地址）翻译为物理地址，提供隔离与分散/聚集（scatter-gather）能力。

流式映射须遵循「所有权模型」：某时刻缓冲区要么归 CPU 要么归设备，用 `dma_sync_single_for_device/cpu` 在直线切换方向时维护。

`dma_map_sg` 处理分散的物理页，设备经 DMA 描述符表一次传输多段非连续内存。

## 三、形式化与数学基础

一致性映射保证无窗口不一致：

$$\forall t,\; dev\_read(addr) = cpu\_write(addr)$$

即缓存与设备视角恒等。

流式映射需显式方向性所有权切换：映射后归设备，sync-for-cpu 后才归 CPU 读。

吞吐提升来自绕开 CPU 搬运：

$$BW \approx \min(BW_{dev}, BW_{mem}) \gg BW_{cpu\_copy}$$

## 四、代码实现

```c
// 一致性映射：分配对设备可见且缓存一致的内存
void *cpu = dma_alloc_coherent(dev, len, &dma_handle, GFP_KERNEL);
// 把 dma_handle 写入设备描述符，设备直接读写 cpu 所指内存
device_start_xfer(dma_handle, len);
// 完成中断后释放
dma_free_coherent(dev, len, cpu, dma_handle);

// 流式映射单页缓冲（遵循所有权模型）
dma_addr_t da = dma_map_single(dev, buf, len, DMA_TO_DEVICE);
device_tx(da, len);                 // 设备写入期间 CPU 不得碰 buf
dma_unmap_single(dev, da, len, DMA_TO_DEVICE);
```

`swiotlb`（bounce buffer）在设备不支持 64 位地址或 IOMMU 缺失时，用低端内存做中转，保证可达性。

## 五、与其他技术对比

| 方式 | 吞吐 | 缓存管理 | 隔离 |
| --- | --- | --- | --- |
| PIO（CPU 搬运） | 低 | 无需 | 无需 |
| DMA 流式 | 高 | 需 sync | IOMMU 可选 |
| DMA 一致 | 高 | 硬件一致 | IOMMU 可选 |
| 无 IOMMU DMA | 高 | 需 sync | 无（设备可越权） |

PIO 简单但慢；DMA 高吞吐但需缓存/IOMMU 管理。相较无 IOMMU，IOMMU 防恶意/错误设备越权访问内存。

## 六、常见误区

1. 误以为 `virt_to_bus` 可用：现代用 DMA API 而非裸物理地址，因总线地址≠物理地址（经 IOMMU）。
2. 误以为映射后 CPU 与设备可同时写：须遵循所有权模型，并发访问致撕裂/不一致。
3. 误以为一致映射无需对齐：有最小对齐（如 cache line）要求，否则回写破坏邻居。
4. 误以为所有设备支持 64 位 DMA：老设备仅 32 位，需用 `dma_set_mask` 协商，否则 `swiotlb` 兜底。
5. 误以为 `dma_map_single` 可缓存复用：每次映射/解映射都需 sync，不能假设地址稳定。

## 七、与开源书·权威来源对应

- Corbet LDD3 第 15 章讲 DMA API、一致性映射与 `dma_map_sg` 分散/聚集。
- Bovet & Cesati 第 13 章讲 PCI/ DMA、总线地址与 `pci_dma_*` 历史接口。
- 内核 `DMA-API-HOWTO.txt` 详述流式/一致性映射、sync 与对齐约束。
- `Documentation/core-api/iommu.rst` 说明 IOMMU 的 IOVA 翻译与隔离语义。

## 八、面试题

1. 为什么 DMA 需要缓存一致性处理？要点：CPU 缓存可能与设备写的内存不一致，须 sync 或一致映射。
2. IOMMU 作用？要点：把 IOVA 翻译为物理地址，提供隔离与 scatter-gather，防设备越权。
3. 流式与一致映射区别？要点：一致硬件保证无窗口；流式需显式 sync 切换所有权方向。
4. `swiotlb` 何时介入？要点：设备地址位不足或无 IOMMU 时，用低端 bounce buffer 中转。

## 九、演进与趋势

- IOMMU 成为服务器标配，支持 SVM（共享虚拟内存）让设备直接访问进程地址空间。
- DMA-BUF 实现跨设备缓冲共享（GPU/显示器/编解码器），统一 exporter/importer 接口。
- `dma-buf heaps` 与 `IOMMUFD` 把 DMA 缓冲管理从设备驱动抽象到用户态框架。

## 十、小结

DMA 把数据搬运交给设备，配合 DMA API 与 IOMMU 解决一致性、连续性与隔离，是高速 I/O 的基础。

现代系统进一步用 SVM 与 DMA-BUF 把设备内存纳入统一虚拟地址空间与跨设备共享。
