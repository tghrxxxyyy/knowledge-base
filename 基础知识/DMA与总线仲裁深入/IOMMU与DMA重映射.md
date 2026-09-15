# IOMMU与DMA重映射

> 对应 Intel SDM 卷 3 中 VT-d（Intel Virtualization Technology for Directed I/O）相关章节与 ARM SMMU 架构规范，以及 Linux 内核 IOMMU 子系统与 Documentation 中的 DMA-API/IOMMU 约定。

## 一、背景与挑战

传统 DMA 使用物理地址：设备被编程写入的目标地址直接被送到内存总线。这带来三个问题。

第一，安全：一个被攻破或被错误编程的设备可以读写任意物理内存，包括内核代码与页表。这在共享的 PCIe 拓扑、虚拟化与租赁场景里是现实的攻击面（被称为 DMA 攻击）。

第二，虚拟化：虚拟机中的客户机驱动只知道「客户机物理地址」（GPA），硬件需要把这些地址翻译到主机物理地址（HPA），且不能让客户机访问到宿主或其他 VM 的内存。

第三，地址空间不足：32 位设备无法访问 64 位系统的高位物理内存，需要内核提供弹跳缓冲（bounce buffer）做拷贝，代价高昂。

IOMMU（x86 上称 VT-d，ARM 上称 SMMU）为 DMA 引入与 CPU MMU 类似的地址翻译与权限检查：设备发出的是 I/O 虚拟地址（IOVA），IOMMU 按页表翻译成物理地址并校验权限，未映射或越权的访问被拒绝并上报故障。它同时充当「设备侧的 MMU」，是安全虚拟化与设备直通（passthrough）的基石。

## 二、核心原理

核心机制与 CPU MMU 高度相似，但有若干关键差异：

- 翻译主体不同：MMU 翻译 CPU 的虚拟地址，IOMMU 翻译设备发出的 IOVA。
- 页表由软件（内核/虚拟机监视器）建立，并通过命令队列（command queue）提交「使页表项失效」「使 TLB 失效」等命令。
- IOMMU 有自己的 TLB（常称 IOTLB），页表更新后必须发送失效命令，否则会出现陈旧翻译。
- 故障通过事件队列（event/fault queue）上报，包含故障地址与原因，由内核记录并（可选）注入到对应进程。
- 隔离域（domain）：同域设备共享地址空间，不同域互相隔离。虚拟化场景下常见「一个 VM 一个域」。

翻译的层次（两阶段翻译，嵌套）：

- 第一阶段（Stage-1 / S1）：把设备/客户机看到的虚拟地址翻译成客户机物理地址（VA→IPA）。在虚拟化下由客户机的页表定义；在裸机 SVA 场景下就是进程的页表。
- 第二阶段（Stage-2 / S2）：把客户机物理地址翻译成物理地址（IPA→PA），由虚拟机监视器控制，用于隔离与内存虚拟化。

两级翻译可以硬件嵌套（一次遍历两套页表），也可以软件影子页表实现；硬件嵌套的性能更好但页表遍历成本更高（最坏情况相当于多次访存）。

重要相关技术：

- ATS（Address Translation Services）：设备侧缓存翻译结果（Device TLB），减少每次 DMA 都走 IOMMU 的开销；配合 PASID 支持按进程地址空间缓存。
- PRI（Page Request Interface）：设备缺页时向软件发起页请求，支撑按需分页（如 GPU 与 CPU 共享进程地址空间 SVA）。
- PASID（Process Address Space ID）：给每个 PCIe 事务打上进程标识，使一个设备能同时访问多个进程的地址空间。
- 中断重映射：不仅重映射 DMA 地址，还把设备中断导向正确的中断门与 VM，防止中断注入攻击。

性能成本的主要来源是 IOTLB 缺失时的页表遍历，因此大页（2MB/1GB）对 IOMMU 性能至关重要——用大页可以把 4 级遍历压缩为很少的几次访存。

## 三、形式化与数学基础

翻译关系：

$$PA = \text{page\_table\_lookup}(IOVA,\ domain\_id)$$

两级翻译的组合（虚拟化场景）：

$$VA \xrightarrow{S1} IPA \xrightarrow{S2} PA$$

权限检查可写成谓词：对访问 $acc \in \{R, W, X_{dev}\}$，

$$Allowed(IOVA, acc) \iff \exists \text{ 映射项 } (IOVA, PA, perms):\ acc \in perms$$

未通过时产生故障而非静默返回（与 CPU 缺页类似，但设备侧无法自动重试）。

页表遍历成本：设页表级数为 $d$、每级访存的延迟为 $L_{mem}$、IOTLB 命中率为 $h$，则平均翻译延迟：

$$L_{trans} = h \cdot L_{TLB} + (1-h)\cdot d \cdot L_{mem}$$

大页把有效级数降低到 $d' < d$，故：

$$L_{trans}^{huge} = h\cdot L_{TLB} + (1-h)\cdot d' \cdot L_{mem}, \qquad d' \ll d$$

以一个映射 2MB 的页表项取代 512 个 4KB 项为例，遍历深度可显著减少，IOTLB 覆盖的地址范围也扩大数百倍——这是 IOMMU 性能调优最有效的手段。

安全收益可定性表述为：无 IOMMU 时设备可达地址集合为全部物理内存 $U_{all}$；有 IOMMU 且映射正确时，可达集合收缩为已映射集合：

$$U_{dev} = \bigcup_{i} mapped_i \subsetneq U_{all}$$

地址空间收缩的规模直接决定了攻击面的大小。

## 四、代码实现

```c
/* 为设备建立 IOVA -> PA 映射（概念模型，具体 API 以内核文档为准） */
#define PAGE_SIZE 4096UL

struct iommu_domain { /* 页表根、域标识等 */ };

/* 逐页安装映射，并在最后使 IOTLB 失效 */
int iommu_map_range(struct iommu_domain *dom, uint64_t iova,
                    uint64_t pa, uint64_t size, int prot) {
    for (uint64_t off = 0; off < size; off += PAGE_SIZE) {
        if (page_table_install(dom, iova + off, pa + off, prot) != 0)
            return -1;                        /* 失败需回滚已安装项 */
    }
    /* 关键：不失效 IOTLB 则设备可能继续使用旧翻译 */
    iommu_tlb_invalidate(dom, iova, size);
    return 0;
}

int iommu_unmap_range(struct iommu_domain *dom, uint64_t iova, uint64_t size) {
    for (uint64_t off = 0; off < size; off += PAGE_SIZE)
        page_table_remove(dom, iova + off);
    iommu_tlb_invalidate(dom, iova, size);
    return 0;
}

/* 设备 DMA 时由硬件完成的翻译（高层次的等价描述） */
uint64_t device_dma(struct iommu_domain *dom, uint64_t iova, size_t len, int is_write) {
    uint64_t pa = translate(dom, iova, is_write);   /* 无映射则触发故障 */
    return pa;                                     /* 硬件用 PA 访问内存 */
}

/* 故障处理：记录并（可选）通知相关进程 */
void iommu_fault_handler(uint64_t iova, uint32_t reason, int device_id) {
    log_fault(device_id, iova, reason);
    /* 常见原因：未映射、权限不符、页表项无效、ATS 翻译失败 */
}
```

工程要点与边界情况：

- 映射与失效之间必须有序，且失效命令要通过命令队列提交并等待完成（或依赖硬件保证顺序），否则存在「设备用旧翻译访问已释放内存」的窗口。
- 释放映射前必须确保设备不再有在途 DMA（需要驱动层的同步：停止队列、等待完成、再做 unmap）。
- ATS 设备缓存翻译结果，因此页表变更后必须发送 ATS 失效（invalidate）通知，而不仅是本地 IOTLB。
- 大页映射需保证对齐与长度是页大小的整数倍；否则回退小页。
- 故障风暴防护：设备反复访问非法地址会产生大量故障中断，需要限速与降级策略。

## 五、与其他技术对比

| 维度 | 无 IOMMU | IOMMU（S1） | IOMMU（S1+S2 嵌套） |
| --- | --- | --- | --- |
| 设备可见地址 | 物理地址 | IOVA | IOVA（客户机视角） |
| 隔离粒度 | 无 | 域/设备 | 每个 VM 一个域 |
| 虚拟化支持 | 需软件模拟 | 可直通 | 硬件两阶段翻译直通 |
| 大地址支持 | 受限（需弹跳） | 支持 | 支持 |
| 性能开销 | 无 | 翻译 + 失效开销 | 更深的遍历开销 |
| 安全 | 弱（DMA 攻击面大） | 强 | 强（VM 间隔离） |

## 六、常见误区

1. 认为 IOMMU 只服务虚拟化：裸机系统同样靠它抵御恶意或错误设备的 DMA，现代内核普遍默认开启（视平台而定）。
2. 认为开启 IOMMU 没有性能代价：IOTLB 缺失会带来页表遍历，需靠大页与 ATS 缓解。
3. 忘记 TLB 失效：更新映射后不发失效命令，设备可能继续使用旧翻译，导致读写错误内存甚至越权。
4. 认为只要映射了就安全：权限位（只读/读写/执行类属性）必须按设备实际需求最小化配置，否则隔离形同虚设。
5. 忽略在途 DMA 与 unmap 的竞态：驱动必须先停队列、等完成，再释放映射，否则设备可能访问已释放的物理页。
6. 认为 ATS 只是优化：ATS 引入设备侧翻译缓存，必须配套失效通知，否则会导致「已失效映射仍被使用」的正确性问题。

## 七、与开源书·权威来源对应

- Intel SDM 卷 3：VT-d 的 DMA 重映射、中断重映射、ATS/PASID 支持（具体细节以 Intel 官方文档为准）。
- ARM SMMU 架构规范：Stage-1/Stage-2 翻译、命令队列与事件队列语义。
- Linux 内核 IOMMU 子系统与 DMA-API 文档：`dma_map_*`、IOVA 分配与故障处理实践。
- Bryant & O'Hallaron《CSAPP》：虚拟内存与地址翻译的基础概念。
- Silberschatz《Operating Systems Concepts》：内存管理与保护的系统视角。
- Hennessy & Patterson《Computer Architecture: A Quantitative Approach》：I/O、虚拟化与地址翻译的体系结构视角。

## 八、面试题

1. 问：IOMMU 与 MMU 的关系？答：MMU 翻译 CPU 发出的虚拟地址，IOMMU 翻译设备发出的 IOVA；二者结构相似（多级页表 + TLB），但主体、页表所有者与失效机制不同。
2. 问：设备隔离为什么需要 IOMMU？答：没有它，设备可对任意物理地址发起 DMA；有了它，设备只能访问显式映射的地址，越权访问触发故障，攻击面从「全部内存」收缩到「已映射区间」。
3. 问：两阶段翻译解决什么问题？答：S1 由客户机（或进程）页表定义 VA→IPA，S2 由虚拟机监视器定义 IPA→PA，从而在支持直通的同时保持 VM 间隔离。
4. 问：为什么大页对 IOMMU 性能重要？答：减少页表级数与遍历访存次数，同时让单个 IOTLB 项覆盖更大的地址范围，显著提高命中率并降低翻译延迟。
5. 问：ATS 与 PASID 的作用？答：ATS 让设备缓存翻译结果以减少每次 DMA 的翻译开销；PASID 把事务与进程地址空间关联，使一个设备可同时服务多个进程（共享虚拟地址）。

## 九、演进与趋势

- 共享虚拟地址（SVA）普及：设备与进程使用同一地址空间，配合 PASID 与 PRI 支持缺页与按需分页。
- 与 CXL 结合：CXL.mem/cache 让远端内存与设备内存进入统一地址空间，IOMMU 需要覆盖链路对端的内存与一致性语义。
- 大页与预翻译优化：通过大页映射与 ATS 预取降低翻译开销，使 IOMMU 在小包高 IOPS 场景下也能接近原生性能。
- 更细粒度隔离：从「按设备」演进到「按队列/按进程」的隔离与限速，配合 QoS 实现多租户带宽隔离。
- 安全侧加固：中断重映射、故障注入防护与对 DMA 攻击类漏洞的持续修补，使 IOMMU 成为云平台安全基线的一部分。

## 十、小结

IOMMU 把虚拟内存的思想延伸到设备侧：以 IOVA 代替物理地址、以页表与权限位实施隔离、以 IOTLB 与 ATS 缓解性能开销、以故障上报暴露越权访问。它是安全虚拟化、设备直通与共享虚拟地址的基石，也是「无 IOMMU 时代设备能碰任何内存」这一问题的根本解法。工程上要牢记三条：映射变更必须伴随失效、unmap 前必须确保无在途 DMA、大页与 ATS 是控制性能开销的主要手段。
