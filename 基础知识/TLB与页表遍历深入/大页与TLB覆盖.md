# 大页与 TLB 覆盖

> 对应 Bryant & O'Hallaron《CSAPP》第 9 章；Arpaci-Dusseau《Operating Systems: Three Easy Pieces》TLB 章；Linux 内核 `Documentation/admin-guide/mm` 大页文档。

## 一、背景与挑战

TLB 项数受限于面积与相联度，典型只有数十到数千项。以 4 KB 小页计算，可覆盖的工作集只有几百 KB 到几 MB；而数据库缓冲池、科学计算数组、虚拟机内存动辄数十 GB。一旦工作集超出覆盖范围，几乎每次访存都触发 TLB 未命中与页表遍历，CPI 明显恶化。

提高覆盖有两条路：增大 TLB（硬件面积代价高，收效有限），或**增大页大小**。后者用"更粗的映射粒度"把覆盖量线性放大。

## 二、核心原理

x86-64 支持两级大页：

- **2 MB 页**：在 PD 级表项置 PS 位，跳过 PT 一级；
- **1 GB 页**：在 PDPT 级表项置 PS 位，跳过 PD 与 PT 两级。

AArch64 对应支持 64 KB、2 MB、1 GB 等粒度（取决于翻译粒度配置）。大页同时带来三个收益：单 TLB 项覆盖范围按倍数放大、页表遍历层数减少、页表本身内存占用下降。

Linux 提供两种用法：

- **显式大页（hugetlbfs）**：由 `nr_hugepages` 预留专用池，用 `MAP_HUGETLB` 或挂载 hugetlbfs 使用，分配可靠但有预留成本；
- **透明大页（THP）**：由内核自动把连续 4 KB 页合并为 2 MB，策略为 `always`/`madvise`/`never`，后台 `khugepaged` 负责折叠。

## 三、形式化与数学基础

TLB 覆盖量定义为：

$$Coverage = N_{TLB} \times PageSize$$

在固定 $N_{TLB}$ 下，页大小翻 512 倍（4 KB → 2 MB）则覆盖量翻 512 倍。设工作集为 $W$，可粗略估计免遍历比例：

$$\eta \approx \min\!\left(1,\ \frac{Coverage}{W}\right)$$

平均访存时间相应为

$$EAT = t_{hit} + (1-\eta)\,t_{walk}$$

代价侧有两项值得量化：**内部碎片**期望约 $PageSize/2$（若分配大小随机且远小于页），以及大页映射的**缺页代价**——一次 2 MB 缺页需要清零 2 MB，其成本约为 4 KB 页的 512 倍，因此"随机小访问"负载下 THP 反而可能增加总代价。

## 四、代码实现

```c
/* 显式大页：需预留在 hugetlbfs 池中 */
#include <sys/mman.h>
void *p = mmap(NULL, 2UL << 20, PROT_READ | PROT_WRITE,
               MAP_PRIVATE | MAP_ANONYMOUS | MAP_HUGETLB, -1, 0);
if (p == MAP_FAILED) { /* 池空或未配置：回退小页 */ }

/* 透明大页：以 madvise 方式按需启用（推荐在延迟敏感进程中使用） */
void *q = mmap(NULL, 1UL << 30, PROT_READ | PROT_WRITE,
               MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
madvise(q, 1UL << 30, MADV_HUGEPAGE);   /* 提示内核可使用 THP */
```

配套检查手段：`/proc/meminfo` 的 `HugePages_*`、`AnonHugePages`，`/sys/kernel/mm/transparent_hugepage/enabled`，以及 `perf stat` 中 dTLB 事件的 miss 率。

## 五、与其他技术对比

| 维度 | 4 KB 小页 | 2 MB 大页 | 1 GB 大页 |
| --- | --- | --- | --- |
| 单 TLB 项覆盖 | 4 KB | 2 MB | 1 GB |
| 页表遍历层数 | 4 级 | 3 级（跳 PT） | 2 级（跳 PD/PT） |
| 内部碎片 | 小 | 中（期望约 1 MB） | 大 |
| 缺页代价 | 低 | 高（需清零 2 MB） | 很高 |
| 分配成功率 | 高 | 需要连续物理块 | 很低 |
| 典型用途 | 通用 | 数据库、虚拟机、大数组 | 超大内存数据库、HPC |

## 六、常见误区

1. **认为大页总是更快**：小随机访问、稀疏访问的负载下，大页的缺页与清零开销可能超过收益。
2. **忽略物理碎片**：2 MB 大页需要连续物理页框，长期运行的系统可能找不到，需内存规整（compaction）配合。
3. **把 THP 等同于 hugetlbfs**：前者自动、可回收、可能引入后台开销；后者预留、可靠、性能更可预测。
4. **忽略 NUMA 影响**：大页分配把整块放在同一节点，跨节点访问的带宽差异被放大。
5. **忘记混合页表的遍历语义**：同一地址空间可同时存在小页与大页，遍历器必须在 PS 位置位时提前终止。

## 七、与开源书·权威来源对应

- Bryant & O'Hallaron《CSAPP》第 9 章 TLB 与页大小讨论。
- Arpaci-Dusseau《Operating Systems: Three Easy Pieces》TLB 章节（覆盖范围与页大小权衡）。
- Linux 内核文档中 hugetlbfs、THP（`Documentation/admin-guide/mm/transhuge.rst`）与 NUMA 相关说明。
- Intel《Software Developer's Manual》Vol.3 中 PSE、PSE-36 与 1 GB 页位定义；Intel 优化手册中 TLB 相关建议。
- 具体 TLB 项数与 THP 默认策略随型号与内核版本变化，以官方最新文档为准。

## 八、面试题

1. **TLB 覆盖为什么重要？** 要点：覆盖范围决定多大工作集可以免除页表遍历，是访存延迟的关键决定项。
2. **大页为什么减少遍历？** 要点：PS 位置位后跳过下级页表，2 MB 省一次访存、1 GB 省两次。
3. **THP 的风险是什么？** 要点：缺页时清零大块内存、可能引入内存膨胀与规整停顿，故常建议用 `madvise` 模式。
4. **大页分配的瓶颈在哪？** 要点：需要连续物理页框，需伙伴系统规整或预留池，碎片化系统上易失败。
5. **如何判断是否该用大页？** 要点：看 TLB miss 率、工作集是否远大于小页覆盖率、访问是否以大块顺序为主。

## 九、演进与趋势

THP 从 `always` 逐步转向按需与更细粒度的策略（例如多级 THP 粒度、按 VMA 提示），减少长尾停顿；hugetlbfs 在虚拟化与大内存数据库中仍是低抖动首选。硬件侧出现"可变页大小"与 TLB 压缩技术，把多个相邻小页项合并为一个大项，兼得覆盖与灵活；此外，CXL/分层内存也促使页大小策略与迁移策略协同设计。

## 十、小结

大页以"更粗粒度映射"直接放大 TLB 覆盖，是缓解页表遍历瓶颈最有效的手段之一。它的收益取决于访问模式是否为大块连续，代价则是内部碎片、分配成功率与更高的缺页成本——透明大页正是为自动权衡这两者而生。
