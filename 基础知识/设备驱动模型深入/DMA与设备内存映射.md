# DMA与设备内存映射

> 对应 Corbet《Linux Device Drivers》第 15 章DMA 与 Bovet & Cesati《Understanding the Linux Kernel》第 13 章。

## 一、背景与挑战
若 CPU 逐字节搬运网卡/磁盘数据，总线与 CPU 被占用、吞吐受限。DMA（直接内存访问）让设备直接读写内存，CPU 仅设置描述符。但涉及 IOMMU、缓存一致性与物理连续性问题。

## 二、核心原理
驱动用 `dma_alloc_coherent` 分配设备可访问的一致映射内存（关闭缓存或硬件保证一致），或用 `dma_map_single` 流式映射普通内存并做缓存回写/失效。IOMMU 把设备看到的 IOVA 翻译为物理地址，提供隔离与分散/聚集。

## 三、形式化与数学基础
一致性映射保证：
$$\forall t,\; dev\_read(addr) = cpu\_write(addr)$$
即无缓存不一致窗口。流式映射需显式 `dma_sync_single_for_device/cpu` 维护方向性所有权。吞吐提升：
$$BW \approx \min(BW_{dev}, BW_{mem}) \gg BW_{cpu\_copy}$$

## 四、代码实现
```c
void *cpu = dma_alloc_coherent(dev, len, &dma_handle, GFP_KERNEL);
// 把 dma_handle 写入设备描述符，设备直接读写 cpu 所指内存
device_start_xfer(dma_handle, len);
// 完成中断后 dma_free_coherent(dev, len, cpu, dma_handle);
```

## 五、与其他技术对比
PIO（CPU 搬运）简单但慢；DMA 高吞吐但需缓存/IOMMU 管理。相较无 IOMMU，IOMMU 防恶意/错误设备越权访问内存。

## 六、常见误区
误以为 `virt_to_bus` 可用：现代用 DMA API 而非裸物理地址。误以为映射后 CPU 与设备可同时写：须遵循所有权模型。误以为一致映射无需考虑对齐：有最小对齐要求。

## 七、与开源书/权威来源对应
Corbet LDD 第 15 章 DMA API 与一致性；Bovet & Cesati 第 13 章 PCI/ DMA。

## 八、面试题
问：为什么 DMA 需要缓存一致性处理？答：CPU 缓存可能与设备写的内存不一致。问：IOMMU 作用？

## 九、演进与趋势
IOMMU 成为服务器标配，支持 SVM（共享虚拟内存）让设备直接访问进程地址空间；DMA-BUF 实现跨设备缓冲共享。

## 十、小结
DMA 把数据搬运交给设备，配合 DMA API 与 IOMMU 解决一致性、连续性与隔离，是高速 I/O 的基础。
