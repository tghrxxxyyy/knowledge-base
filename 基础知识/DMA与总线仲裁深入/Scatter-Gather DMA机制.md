# Scatter-Gather DMA机制

> 对应 Tanenbaum《Modern Operating Systems》I/O 章节、ARM AMBA AXI 规范中基于描述符的 DMA 设计，以及 Linux 内核 DMA-API 与网络驱动（scatterlist / dma_map_sg）的实践约定。

## 一、背景与挑战

应用数据往往天然分散：网络包的头部与各层载荷可能在不同缓冲；文件 I/O 的页在物理内存中不连续；加密/校验流水线的输入输出常被切成定长块。若每段都单独启动一次 DMA，就要付出两类代价：一是每段的配置开销（写寄存器、发门铃），二是每段一次完成中断。当段数很多时，CPU 会被中断与配置淹没。

Scatter-Gather DMA（SG-DMA）用一个描述符链表（或环）把「多段不连续」表达成一个逻辑传输：控制器自动遍历描述符逐段搬运，只在全部完成（或每批完成）时中断一次。这把 CPU 的参与次数从 $O(n)$ 降到 $O(1)$。

新的挑战随之而来：描述符本身也要被控制器读取，因此它的内存必须对设备可见且同步正确；链表的深度、描述符粒度直接影响访存开销与延迟；地址必须经 IOMMU 校验，否则一个被篡改的描述符就能让设备读写任意物理内存（这是真实存在的安全攻击面）。

## 二、核心原理

描述符的典型字段：源地址、目的地址（或仅单向）、长度、标志位、指向下一个描述符的指针（链式）或隐含在数组索引中（环式）。三种常见组织方式：

1. 链式（linked list）：每个描述符显式给出 next 指针，末项置 END。灵活、易于动态增删，但指针追逐带来额外访存。
2. 环式（ring）：描述符放在固定大小数组里，控制器通过索引递增遍历，回到头部形成环。访存局部性好、可预测，Linux 网络驱动普遍采用。
3. 环 + 链混合：环内描述符指向链表的头，兼顾固定开销与不定长数据的灵活性。

控制流的关键设计是「拥有位」（OWN/valid 位）：描述符的有效性由某一方拥有，写入方填好内容后置位交棒，读取方处理完清位归还。这样双方可以无锁地流水：CPU 填多个描述符后一次性敲门，控制器连续处理，处理完按批次中断（interrupt coalescing）以减少中断次数。

与上层功能的结合：

- 网络发送：SG 让头部与各层载荷免于拷贝（零拷贝），配合校验和卸载（checksum offload）与分段卸载（TSO/LSO），由网卡按 MSS 切分成多个包。
- 网络接收：多缓冲接收（如把包头与载荷收到不同缓冲）依赖 SG 收集（gather）。
- 存储：块层把请求切分为若干页，SG 让一次命令覆盖多页，减少命令数量。

描述符的对齐与边界：描述符缓冲本身应按缓存行对齐；单段传输不应跨越协议的地址译码边界（例如 4KB 页边界），否则硬件可能拒绝或产生跨设备访问。

## 三、形式化与数学基础

一次 SG 传输是分段集合的并：

$$Transfer = \bigcup_{i=0}^{n-1} \left[addr_i,\ addr_i + len_i\right)$$

总字节数与所需描述符数（设最大段长为 $L_{max}$）：

$$Bytes = \sum_{i=0}^{n-1} len_i, \qquad n \ge \left\lceil \frac{Bytes}{L_{max}} \right\rceil$$

与逐段 DMA 的 CPU 开销对比：设每次启动与中断的处理成本为 $C_{setup}$ 与 $C_{irq}$，则

$$Cost_{per\_segment} = n \cdot (C_{setup} + C_{irq}), \qquad Cost_{SG} \approx C_{setup} + \left\lceil \frac{n}{k} \right\rceil \cdot C_{irq}$$

其中 $k$ 为每批处理的描述符数（由中断合并参数决定）。当 $n$ 较大时，SG 的 CPU 开销可降低一到两个数量级。

链式描述符的访存代价：设描述符大小为 $D$ 字节、步长为 $S$，则遍历 $n$ 项的描述符元数据流量为

$$Traffic_{desc} = n \cdot \frac{D}{S} \cdot B_{line}^{-1} \cdot B_{line} = n \cdot D \quad \text{（按缓存行取整成本更高）}$$

即元数据流量与段数线性相关，因此段数过多时元数据会挤占有效带宽——这也是「聚合大段」（如 GRO/LRO 合并小包）的动机之一。

判定性能是否被描述符拖累，可比较：

$$\eta = \frac{Bytes}{Bytes + n \cdot D_{eff}} \quad (D_{eff} \text{ 为含缓存行放大的有效元数据成本})$$

## 四、代码实现

```c
/* 环式 SG 描述符（概念模型），配合 ownership 位实现无锁流水 */
#include <stdint.h>

struct sg_desc {
    uint64_t addr;      /* 数据缓冲的总线地址 */
    uint32_t len;       /* 本段字节数 */
    uint32_t flags;     /* OWN / END / IRQ / 校验和与卸载标志 */
    uint64_t next;      /* 链式时有效；环式可忽略 */
};

#define DESC_OWN    (1u << 0)   /* 1: 归设备所有；0: 归 CPU 所有 */
#define DESC_END    (1u << 1)   /* 链表末项 */
#define DESC_IRQ    (1u << 2)   /* 本段完成后中断 */

/* CPU 侧提交一批段：先写内容，再写 OWN 位，最后敲门铃 */
int sg_submit(struct sg_desc *ring, int head, int nseg,
              const uint64_t *addr, const uint32_t *len, int ring_size) {
    for (int i = 0; i < nseg; i++) {
        int idx = (head + i) % ring_size;
        struct sg_desc *d = &ring[idx];
        if (d->flags & DESC_OWN) return -1;      /* 环满，需回压处理 */
        d->addr  = addr[i];
        d->len   = len[i];
        d->flags = (i == nseg - 1) ? (DESC_END | DESC_IRQ) : 0;
    }
    dma_wmb();                                   /* 内容对设备可见之后 */
    for (int i = 0; i < nseg; i++) {
        int idx = (head + i) % ring_size;
        ring[idx].flags |= DESC_OWN;             /* 交棒给设备 */
    }
    dma_wmb();
    dma_ring_doorbell(head, nseg);               /* MMIO 门铃 */
    return 0;
}

/* 完成处理：回收 OWN=0 的描述符，统计已发送字节 */
int sg_reap(struct sg_desc *ring, int tail, int budget, int ring_size) {
    int done = 0;
    for (; done < budget; done++) {
        struct sg_desc *d = &ring[(tail + done) % ring_size];
        if (d->flags & DESC_OWN) break;          /* 设备还没处理完 */
        if (d->flags & DESC_END) { /* 一个逻辑传输结束 */ }
    }
    return done;
}
```

实现细节与边界情况：

- 门铃是 MMIO 写，必须保证「描述符写」先于「门铃写」被设备观察到（写屏障，必要时用 `mmiowb()` 类原语）。
- 环满时必须能回压（返回忙并稍后重试），否则会覆盖设备尚未处理的描述符造成数据损坏。
- 每个数据缓冲在被设备读取或写入前要做正确的 DMA 同步（发送前 clean，接收后 invalidate），并按缓存行对齐。
- 中断合并（coalescing）参数需要在延迟与 CPU 占用之间调优：合并过度会让小包场景延迟骤增。

## 五、与其他技术对比

| 方案 | CPU 配置开销 | 中断次数 | 支持不连续缓冲 | 元数据成本 | 典型场景 |
| --- | --- | --- | --- | --- | --- |
| 单次 DMA（逐段） | $O(n)$ | $O(n)$ | 否 | 低 | 简单外设、小块传输 |
| 阻塞式块 DMA | $O(n)$ | $O(n)$ | 否 | 低 | 早期 DMA 控制器 |
| 链式 SG-DMA | $O(1)$ | $O(n/k)$ | 是 | 中（指针追逐） | 存储、通用传输 |
| 环式 SG-DMA | $O(1)$ | $O(n/k)$ | 是 | 低（顺序访存） | 高速网络、NVMe |
| 描述符 + 卸载（TSO/LRO） | $O(1)$ | $O(n/k)$ 甚至更少 | 是 | 低 | 高吞吐网络栈 |

## 六、常见误区

1. 认为 SG 只用于发送：接收侧同样可以用「收集」把分散缓冲拼成一个逻辑包，或把包头与载荷分到不同缓冲。
2. 认为描述符不需要缓存同步：描述符也是内存，同样需要方向性同步与屏障，否则设备可能读到半成品。
3. 忽略描述符环的容量与回压：环满时若无处理，会覆盖未处理描述符导致静默数据损坏。
4. 认为段数越多越好：段数增加会线性增加元数据流量与描述符访存，超过一定粒度后有效带宽反而下降。
5. 忘记 IOMMU 校验：描述符中的地址必须经 IOMMU 翻译与权限检查，否则被篡改的描述符可读写任意物理内存。
6. 用无限长链表规避环管理：无界链表虽灵活，但难以预分配、难以限流，且尾指针维护复杂，常见于早期的「链上链」设计。

## 七、与开源书·权威来源对应

- Tanenbaum《Modern Operating Systems》：I/O 硬件、DMA 与中断驱动 I/O 的系统描述。
- ARM AMBA AXI 规范：突发与基于描述符的 DMA 设计约定。
- Linux 内核 DMA-API 文档与 DMA 属性说明：`dma_map_sg`、流式映射方向与同步语义。
- Stevens《TCP/IP Illustrated》：网络包在驱动中的缓冲组织与零拷贝实践。
- Hennessy & Patterson《Computer Architecture: A Quantitative Approach》：I/O 与存储层次、DMA 的作用。
- Patterson & Hennessy《Computer Organization and Design》：I/O 接口与 DMA 的入门描述。

## 八、面试题

1. 问：SG-DMA 相比普通 DMA 的优势？答：把多段不连续缓冲聚合为一次逻辑传输，把 CPU 的启动与中断开销从 $O(n)$ 降到 $O(1)$（或 $O(n/k)$），显著提升吞吐并降低延迟抖动。
2. 问：描述符链为什么需要缓存同步？答：描述符存放在普通可缓存内存中，设备读取前必须保证 CPU 的写已到达内存（clean），且「内容写完」与「置有效位」之间需要写屏障。
3. 问：环式与链式描述符如何取舍？答：环式访存局部性好、开销可预测、易于限流，适合高吞吐固定场景；链式灵活、支持动态增删与不定长，代价是指针追逐与预分配困难。
4. 问：为什么段数过多会拖慢传输？答：元数据流量与段数线性相关，且描述符访存仍需带宽；此外小段会削弱突发效率，因此需要聚合（如 GRO/LRO）与合理的最大段长。
5. 问：SG-DMA 与 IOMMU 如何配合？答：每段地址先经 IOMMU 翻译与权限检查，非法映射触发故障而非静默越权访问；同时 IOMMU 允许把物理上不连续的页映射成连续的 IOVA，简化描述符组织。

## 九、演进与趋势

- 与 IOMMU 深度结合：描述符地址校验 + IOVA 映射，既提升安全性又减少弹跳缓冲拷贝。
- 零拷贝网络栈：SG 与卸载（TSO/LRO/校验和）配合，让数据尽量不经过 CPU 拷贝路径。
- 多队列与按核分环：每个 CPU 核维护独立的描述符环，避免跨核锁竞争并提升缓存局部性。
- 存储侧的 NVMe 与 SR-IOV：多队列 + SG 描述符成为高 IOPS 设备的标准数据通路。
- 设备侧的描述符预取与深度流水：控制器预取描述符以掩盖访存延迟，软件侧需要保证预取安全性（不同步的 OWN 位读写次序）。

## 十、小结

Scatter-Gather DMA 用描述符链把「分散缓冲」表达为一个逻辑传输，把 CPU 的配置与中断开销压到常数级，是高效 I/O 的关键机制。正确实现依赖三个不可省略的细节：描述符内容与有效位之间的写屏障、数据缓冲的方向性缓存同步、以及环满时的回压与回收。理解环式与链式的取舍、段数与元数据成本的量化关系、以及与 IOMMU 的配合方式，就掌握了现代高速 I/O 数据通路的核心。
