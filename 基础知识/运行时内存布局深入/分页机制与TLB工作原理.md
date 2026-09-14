# 分页机制与TLB工作原理

> 对应 Arpaci-Dusseau《OSTEP》第 18–19 章（Paging 与 TLB）、Silberschatz《Operating System Concepts》第 8 章、Bryant & O'Hallaron《Computer Systems: A Programmer's Perspective》第 9 章虚拟内存，以及 Hennessy & Patterson《Computer Architecture》缓存与地址转换部分。

## 一、背景与挑战
连续内存分配会产生外部碎片，且难以共享与保护。分页把虚拟地址空间与物理内存都切成固定大小的页／帧，用页表建立映射：任何虚拟页都可放在任意物理帧，从而消除外部碎片并让共享与保护变得自然。代价是每次访存都要先查表，把一次内存访问变成两次甚至多次。TLB 就是把这笔开销压回去的关键。

## 二、核心原理
地址转换：虚拟地址拆为虚拟页号（VPN）与页内偏移。页表以 VPN 为索引给出物理帧号（PFN），拼接偏移得到物理地址。页大小通常 4 KiB，故偏移占 12 位。

多级页表：单级页表需为整个地址空间预留表项，稀疏时浪费巨大。多级页表把 VPN 再分层，只分配被使用的分支，空间开销与实际使用量成比例，代价是未命中 TLB 时需多级串联访问。

TLB：一个小的、全相联或组相联的转换缓存，缓存近期 VPN→PFN 映射及权限位（读、写、执行、用户／内核、脏位）。
- 命中：转换开销接近零，但仍在关键路径上有几拍延迟。
- 未命中：走页表遍历；较新的处理器有页表遍历缓存（paging-structure caches）加速，首次仍可能付出多次内存访问。
- 填充：x86 由硬件遍历完成，部分架构由软件填充。

三个关键机制：
- **上下文切换与 TLB**：不同进程的同一虚拟地址含义不同，若不区分会读到错误映射。传统做法是切换时刷新，代价是丢缓存；现代硬件用地址空间标识（PCID/ASID）在同一 TLB 中区分进程，避免全刷。
- **大页**：2 MiB 或 1 GiB 的大页使单个 TLB 条目覆盖更多内存，显著提高覆盖率，适合数据库与大内存应用。
- **权限与失效**：翻译与保护合并在同一结构中，越权访问触发缺页异常；修改某页映射后必须让旧 TLB 条目局部失效（如 `invlpg`）以保证一致性。

## 三、形式化与数学基础
地址拆分与物理地址计算（页大小 $P = 2^p$）：

$$\mathrm{VPN} = \lfloor VA / P \rfloor,\quad \mathrm{offset} = VA \bmod P,\quad PA = \mathrm{PT}[VPN] \cdot P + \mathrm{offset}$$

多级页表的位数约束（$L$ 级，各级索引位数 $b_i$，地址位宽 $W$）：

$$\sum_{i=1}^{L} b_i + p = W$$

未命中 TLB 的额外访存次数即级数 $L$，故有效访存时间为：

$$\mathrm{EMAT} = h \cdot t_{mem} + (1-h) \cdot (L+1) t_{mem} = t_{mem}\big(1 + (1-h)L\big)$$

两点结论：命中率 $h$ 越接近 1，EMAT 越接近单次访存；级数 $L$ 越大，未命中惩罚成比例上升。

TLB 覆盖率与命中率的经验估计：

$$\mathrm{Reach} = n_{tlb} \cdot P,\qquad h \approx \min\left(1,\ \frac{\mathrm{Reach}}{\mathrm{WS}}\right)$$

当工作集 $\mathrm{WS} > \mathrm{Reach}$ 时必然出现 TLB 抖动。大页把 $P$ 提高若干数量级，覆盖率同比例提升，这正是它对随机访问负载有效的原因。

## 四、代码实现
```c
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>

/* 简化二级页表：展示 VPN 拆分与逐级索引 */
#define PAGE_BITS 12
#define L1_BITS   10
#define L2_BITS   10
#define PAGE_SIZE (1u << PAGE_BITS)

typedef struct { uint32_t pfn; uint32_t flags; } pte_t;
static pte_t *l1[1 << L1_BITS];

static uint32_t translate(uint32_t va) {
    uint32_t k1  = (va >> (PAGE_BITS + L2_BITS)) & ((1u << L1_BITS) - 1);
    uint32_t k2  = (va >> PAGE_BITS) & ((1u << L2_BITS) - 1);
    uint32_t off = va & (PAGE_SIZE - 1);
    pte_t *l2 = l1[k1];
    if (!l2) return UINT32_MAX;              /* 分支未分配：缺页 */
    if (!(l2[k2].flags & 1)) return UINT32_MAX;
    return (l2[k2].pfn << PAGE_BITS) | off;
}

static void map(uint32_t va, uint32_t pa) {
    uint32_t k1 = (va >> (PAGE_BITS + L2_BITS)) & ((1u << L1_BITS) - 1);
    uint32_t k2 = (va >> PAGE_BITS) & ((1u << L2_BITS) - 1);
    if (!l1[k1]) l1[k1] = calloc(1u << L2_BITS, sizeof(pte_t));
    l1[k1][k2].pfn = pa >> PAGE_BITS;
    l1[k1][k2].flags = 1 | 4;                /* 存在 + 可写 */
}
/* 大页映射可另行用 mmap(MAP_HUGETLB) 申请，减少 TLB 条目压力 */
```

## 五、与其他技术对比

| 维度 | 分页 | 分段 | 段页式 | 单级页表 | 多级页表 |
|---|---|---|---|---|---|
| 分配粒度 | 固定大小页 | 可变长逻辑段 | 先分段再分页 | 固定大小页 | 固定大小页 |
| 外部碎片 | 无 | 严重 | 无 | 无 | 无 |
| 稀疏支持 | 差 | 天然 | 好 | 差 | 好 |
| 共享粒度 | 页级，细 | 段级，粗 | 灵活 | 页级 | 页级 |
| 表空间开销 | 与地址空间成正比 | 段表很小 | 适中 | 大 | 与实际使用成正比 |
| 查找成本 | 1 次查表（TLB 命中为 0） | 段基址加偏移 | 两次 | 1 次 | $L$ 次未命中 |

## 六、常见误区
误区一：认为 TLB 命中是零成本。命中仍有固定延迟且在访存关键路径上，高频随机访问下也是开销。
误区二：认为上下文切换必然全刷 TLB。以 PCID/ASID 区分地址空间时可保留跨进程条目，取决于实现与内核策略。
误区三：忽略大页对 TLB 覆盖率的提升。覆盖率与页大小成正比，大页能让超出 TLB 范围的工作集重新落入覆盖。
误区四：把页表项只当地址映射。它同时携带权限与状态位，保护检查与地址翻译在同一次访问完成。
误区五：认为多级页表只是省空间。它还影响未命中 TLB 时的遍历成本，是空间与时间的联合权衡。

## 七、与开源书·权威来源对应
- Arpaci-Dusseau《OSTEP》第 18–19 章：分页、TLB、多级页表与 TLB 命中率的定量分析，附教学代码。
- Silberschatz《Operating System Concepts》第 8 章：页表结构、分页硬件与地址转换流程。
- Bryant & O'Hallaron《CSAPP》第 9 章：从程序员视角看地址翻译、TLB 与缺页，含 Intel 架构描述。
- Hennessy & Patterson《Computer Architecture》：缓存层次与地址转换的交互，以及大页与 TLB 覆盖率的性能分析。

## 八、面试题
1. TLB 未命中的代价如何量化？
   要点：需 $L$ 次级页表访问，EMAT 为 $t_{mem}(1 + (1-h)L)$，级数与命中率共同决定惩罚。
2. 多级页表解决了什么问题？
   要点：单级页表需为整个地址空间预留表项，稀疏时浪费极大；多级只按需分配分支。
3. 大页的收益从何而来？
   要点：TLB 覆盖率与页大小成正比，大页让工作集重回覆盖范围，减少抖动。
4. PCID 是什么，解决什么问题？
   要点：地址空间标识，用于在 TLB 中区分不同进程的条目，避免上下文切换全刷丢失缓存。
5. 页表项中的权限位起什么作用？
   要点：把保护检查与地址翻译合并到一次访问，越权访问触发缺页异常而非返回错误地址。

## 九、演进与趋势
地址位宽持续增长，页表级数随之增加，同时硬件引入更多缓存层级来抑制遍历成本。大页从显式申请扩展到内核透明大页，在吞吐、延迟与碎片之间动态权衡。虚拟化与机密计算场景出现嵌套页表与内存加密，使转换路径更复杂，也带来新的性能考量。硬件与内核的具体能力以官方最新文档为准。

## 十、小结
分页用固定粒度映射消除外部碎片并让共享与保护自然落地，代价是引入地址转换这层间接。多级页表在空间上按需分配，TLB 在时间上把转换成本压到接近零：命中率 $h$ 与级数 $L$ 通过 $t_{mem}(1+(1-h)L)$ 直接影响 EMAT，覆盖率 $n_{tlb} \cdot P$ 则决定大页是否必要。理解这条公式链，就理解了内存性能调优的起点。
