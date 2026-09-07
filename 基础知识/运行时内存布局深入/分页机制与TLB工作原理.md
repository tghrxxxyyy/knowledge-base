# 分页机制与TLB工作原理

> 对应 Arpaci-Dusseau《OSTEP》第 18-19 章；Silberschatz《Operating System Concepts》第 8 章。

## 一、背景与挑战
连续内存分配产生外部碎片且难共享。分页把虚拟与物理都切成固定页，用页表映射，但每次访存多一次查表，需 TLB 缓存加速。

## 二、核心原理
虚拟地址拆为 VPN + offset，页表把 VPN 映射到物理帧号 PFN。多级页表节省稀疏空间。TLB 缓存近期 VPN->PFN，命中则零开销；未命中触发页表遍历（hardware 或 software TLB fill）。

## 三、形式化与数学基础
$$PA = PT[VPN] \times P + offset$$
TLB 命中率 $h$ 下有效访存时间：
$$EMAT = h \times t_{mem} + (1-h) \times (t_{mem} + t_{pt})$$
多级页表遍历需 $L$ 次内存访问（$L$ 为级数）。

## 四、代码实现
```c
// 简化二级页表查表
pde = pgdir[vpn >> 10];
pte = pde.pt[vpn & 0x3FF];
pfn = pte.pfn;
pa = (pfn << 12) | (va & 0xFFF);
```

## 五、与其他技术对比
分段按逻辑单位但碎片多；分页统一粒度好共享；段页式结合二者；TLB 是性能关键，刷新策略影响上下文切换成本。

## 六、常见误区
1. 以为 TLB 命中免费——仍有命中延迟。
2. 上下文切换全刷 TLB 丢缓存，PCID 缓解。
3. 忽略大页对 TLB 覆盖的提升。

## 七、与开源书/权威来源对应
OSTEP ch18-19；Silberschatz ch8；CSAPP 9 章；remzi-arpacidusse/ostep-code。

## 八、面试题
问：TLB 未命中代价？多级页表作用？大页好处？PCID 是什么？

## 九、演进与趋势
5 级页表支持 57 位地址；HugePage 与 TLB 分区提升数据库类负载。

## 十、小结
分页用页表解碎片与共享，TLB 用缓存把查表开销压到可忽略。
