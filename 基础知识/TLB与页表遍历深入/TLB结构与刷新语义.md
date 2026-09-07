# TLB 结构与刷新语义

> 对应 Tanenbaum《Modern Operating Systems》内存管理章与 Intel SDM。

## 一、背景与挑战
每次访存都走页表遍历代价高昂（4 次内存访问）。TLB（转译后备缓冲）缓存近期 VA→PA 映射，命中则零额外延迟；但刷新语义错误会导致安全或一致性 bug。

## 二、核心原理
TLB 多为全相联或组相联的小容量高速缓存，按 VA 标签查找。进程切换时需刷新（flush）TLB 以免地址空间混淆，但全刷代价大——故引入 ASID/PCID 避免全刷。

## 三、形式化与数学基础
TLB 平均访存时间：
$$AMAT_{VA} = HitTime + MissRate_{TLB} \times PageWalkTime$$
若页游走触发缺页，则再加 $PageFaultTime$（可达百万周期）。

## 四、代码实现
```c
// TLB查找模拟(全相联)
struct tlb_e { unsigned long va_tag; unsigned long pa; int valid; };
struct tlb_e tlb[64];
unsigned long tlb_lookup(unsigned long va) {
    unsigned long tag = va >> 12;
    for (int i=0;i<64;i++)
        if (tlb[i].valid && tlb[i].va_tag==tag)
            return (tlb[i].pa<<12)|(va&0xFFF);
    return 0; // miss -> 页表遍历
}
```

## 五、与其他技术对比
TLB 是页表的硬件缓存，类比 L1 之于内存。软件管理 TLB（如 MIPS/SPARC）需 OS 显式填装，x86 为硬件遍历。

## 六、常见误区
误以为修改页表后 TLB 自动失效：需显式 TLB shootdown（跨核 IPI）。误以为只读 TLB 命中即可：权限/脏位也参与。

## 七、与开源书/权威来源对应
Modern Operating Systems 内存章；OSTEP 页表与 TLB；CSAPP 9.6。

## 八、面试题
问：为何多核下修改页表需 TLB shootdown？答：其他核 TLB 仍缓存旧映射，需 IPI 失效。

## 九、演进与趋势
PCID/ASID、大页、以及虚拟机下嵌套 TLB（EPT/NPT）成为标配。

## 十、小结
TLB 是虚拟内存性能关键，刷新与跨核一致性是其正确性的难点。
