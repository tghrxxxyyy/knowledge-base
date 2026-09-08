# IOMMU与DMA重映射

> 对应 Intel SDM 卷3（VT-d）与 ARMv8 手册（SMMU）。

## 一、背景与挑战
恶意或错误的设备 DMA 可越权读写任意物理内存，构成安全与稳定性威胁。IOMMU 为 DMA 提供类似 MMU 的地址翻译与保护。

## 二、核心原理
IOMMU/SMMU 将设备发出的 DMA 虚拟地址（IOVA）经页表翻译成物理地址，并依据上下文检查权限。未经映射的地址访问被拒绝，实现设备隔离。

## 三、形式化与数学基础
翻译关系：

    PA = page_table_lookup(IOVA, domain_id)

其中 domain_id 标识设备所属隔离域。无效映射返回错误并触发 faults。

## 四、代码实现
```c
/* 概念: 为设备建立 IOVA->PA 映射 */
void iommu_map(struct iommu_domain *dom, uint64_t iova,
               uint64_t pa, uint64_t size, int prot) {
    for (uint64_t off = 0; off < size; off += PAGE)
        page_table_install(dom, iova + off, pa + off, prot);
    iommu_tlb_invalidate(dom);
}
```

## 五、与其他技术对比
无 IOMMU 时设备直接操作物理地址，隔离差；IOMMU 增加少量延迟换取强隔离与虚拟化支持。

## 六、常见误区
误以为 IOMMU 只用于虚拟化；它同样保护原生系统的设备 DMA。误以为开启 IOMMU 无性能代价。

## 七、与开源书/权威来源对应
Intel VT-d 规范（SDM 卷3 附录）描述 DMA 重映射；ARM SMMU 规范定义 Stage 翻译。

## 八、面试题
1. IOMMU 与 MMU 的关系？答：前者翻译设备 DMA 地址，后者翻译 CPU 虚拟地址。
2. 设备隔离为何需要 IOMMU？

## 九、演进与趋势
CXL 与 PASID 让设备共享进程地址空间，IOMMU 支持更细粒度翻译。

## 十、小结
IOMMU 通过 DMA 重映射与权限检查隔离设备，是安全虚拟化与系统稳定的重要防线。
