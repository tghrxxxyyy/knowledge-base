# 大页与 TLB 覆盖

> 对应 CSAPP 第9章与大页相关厂商文档（Intel 透明大页）。

## 一、背景与挑战
TLB 项数少（常 64-2048），小页（4 KB）下只能覆盖几 MB，大型工作集（数据库、科学计算）TLB 缺失频繁，页表遍历成为瓶颈。

## 二、核心原理
大页（x86 2 MB / 1 GB）合并多级页表末级，单个 TLB 项覆盖更大连续物理范围。覆盖量 = TLB项数 × 页大小，线性提升。

## 三、形式化与数学基础
TLB 覆盖：
$$Coverage = N_{TLB} \times PageSize$$
4 KB 页、1024 项覆盖 4 MB；2 MB 页则覆盖 2 GB。缺页/遍历次数随覆盖上升而下降：
$$WalkRate \approx AccessRate \times \max(0, 1 - \frac{WorkingSet}{Coverage})$$

## 四、代码实现
```c
// 用mmap申请大页(需挂载hugetlbfs或开启THP)
#include <sys/mman.h>
void *p = mmap(NULL, 1<<21, PROT_READ|PROT_WRITE,
               MAP_PRIVATE|MAP_ANONYMOUS|MAP_HUGETLB, -1, 0);
// 若成功, 单TLB项覆盖2MB连续内存
```

## 五、与其他技术对比
小页灵活省内存但 TLB 覆盖小；大页提覆盖却易产生内存碎片与分配延迟。透明大页（THP）试图自动折中。

## 六、常见误区
误以为大页总是更快：碎片与 NUMA 布局不当可能反噬。误以为 TLB 项数可无限增加。

## 七、与开源书/权威来源对应
CSAPP 9.x；Linux 内核 Documentation/vm/hugetlb；Intel 优化手册。

## 八、面试题
问：TLB 覆盖为何重要？答：决定多大工作集免页表遍历。

## 九、演进与趋势
透明大页、libhugetlbfs、以及可伸缩 TLB（如基于 RADMUX）持续演进。

## 十、小结
大页以"更粗粒度映射"放大 TLB 覆盖，是缓解页表遍历瓶颈的直接手段。
