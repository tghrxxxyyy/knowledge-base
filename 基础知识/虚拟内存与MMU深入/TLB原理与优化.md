# TLB原理与优化

> 对应 CSAPP 中文笔记 https://github.com/Hansimov/csapp 第9章；OSTEP https://github.com/remzi-arpacidusse/ostep-code 。

## 一、背景与挑战

每次访存若都走多级页表要 4 次内存访问，太慢。TLB(转译后备缓冲)缓存近期 VPN→PFN，将转换降到 1 拍。

## 二、核心原理

TLB 是硬件相联缓存，全相联/组相联，命中则直接得 PFN；缺失触发页表遍历(由 MMU 硬件或软件)。ASID 标签区分进程，免切换刷新。多级 TLB(L1/L2)与共享末级常见。

## 三、形式化 / 数学基础

有效访问时间：

$$EAT = h \times t_{hit} + (1-h) \times (t_{walk} + t_{hit})$$

$h$ 为 TLB 命中率，$t_{walk}$ 为页表遍历(多级访存)。

## 四、代码实现

```c
// 用大页减少 TLB 压力：1GB 页覆盖更多地址
// 内核映射时设 PS 位，一级索引直接得 1GB 框
// 用户态：mmap(..., MAP_HUGETLB)
```

## 五、与其他技术对比

- TLB 命中极快，缺失昂贵；大页降低缺失率。
- ASID 避免进程切换刷新全 TLB。

## 六、常见误区

- 误以为 TLB 属页表：它是独立缓存。
- 忽视 TLB 抖动(随机大数组遍历)致性能崩。

## 七、与开源书 / 权威来源对应

- CSAPP 中文笔记：https://github.com/Hansimov/csapp
- OSTEP：https://github.com/remzi-arpacidusse/ostep-code

## 八、面试题

- TLB 缺失代价？答：多级页表遍历数次内存访问。
- ASID 作用？答：进程标识，免切换刷 TLB。

## 九、演进与趋势

更大 TLB、PCID(进程上下文标识)减少刷新，访存标记。

## 十、小结

TLB 是地址转换的性能闸门，命中率主导实际访存延迟。
