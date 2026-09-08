# DMA控制器与突发传输

> 对应 Tanenbaum《Computer Organization and Design》与 ARM AMBA AXI 规范。

## 一、背景与挑战
若每次 I/O 都由 CPU 搬运数据，将大量占用算力。DMA（直接内存访问）让外设控制器直接读写内存，仅在传输起止时打扰 CPU。

## 二、核心原理
CPU 配置 DMA 控制器（源地址、目的地址、长度、方向），然后释放总线。DMA 控制器在总线上发起突发（burst）传输，完成后以中断通知 CPU。

## 三、形式化与数学基础
总传输时间近似：

    T = ceil(L / B) * t_burst + t_setup

其中 L 为字节数，B 为突发长度，t_burst 为突发周期，t_setup 为配置开销。提升 B 可降低每字节开销。

## 四、代码实现
```c
struct dma_desc { uint32_t src; uint32_t dst; uint32_t len; uint32_t ctrl; };
void start_dma(volatile struct dma_desc *d, void *src, void *dst, uint32_t len) {
    d->src = (uint32_t)src; d->dst = (uint32_t)dst;
    d->len = len; d->ctrl = (1u << 0) | (1u << 31); /* start + irq */
    while (!(d->ctrl & (1u << 1))); /* 等待 done 位 */
}
```

## 五、与其他技术对比
轮询 I/O 浪费 CPU；中断驱动每字节触发开销大；DMA 以突发批量搬运最优，但需处理缓存一致性。

## 六、常见误区
误以为 DMA 完全绕过 CPU 无需同步；CPU 缓存可能持有旧数据，需刷脏或无效化。误以为 DMA 不会与 CPU 争用总线。

## 七、与开源书/权威来源对应
Tanenbaum 第 5 章讲 DMA；AXI 规范定义 burst 类型（FIXED/INCR/WRAP）。

## 八、面试题
1. DMA 完成后为何还要 flush cache？答：保持内存与缓存一致。
2. 突发传输的好处？

## 九、演进与趋势
Scatter-gather、IOMMU 与总线调度让 DMA 更高效安全；PCIe 的 DMA 成为主流。

## 十、小结
DMA 通过控制器代 CPU 批量搬运并用突发降低开销，但缓存一致性与总线仲裁是正确性的关键。
