# DMA控制器与突发传输

> 对应 Tanenbaum《Modern Operating Systems》I/O 章节、ARM AMBA AXI 规范中的突发（burst）定义，以及 Patterson & Hennessy《Computer Organization and Design》的 I/O 与 DMA 讨论。

## 一、背景与挑战

若所有 I/O 数据都由 CPU 逐字节搬运（程序控制 I/O），CPU 会被大量浪费在「读寄存器—写内存」的循环上。中断驱动 I/O 虽然避免了轮询，但每个字节或每小批数据都要进出中断，上下文开销仍然巨大。DMA（Direct Memory Access）的思路是让一个独立控制器代替 CPU 完成搬运：CPU 只配置「源、目的、长度、方向」，随后总线交给 DMA 控制器，搬运完成后再以中断通知。

难点有四个。第一，DMA 与 CPU 争用同一内存带宽，必须仲裁，否则会拖慢 CPU 的访存延迟。第二，DMA 访问的内存可能被 CPU 缓存持有旧副本，需要缓存同步（见缓存一致性对 DMA 的影响）。第三，小批量搬运的效率极低——每次都要付出总线获取、地址译码、握手开销，因此需要突发（burst）把开销摊薄到多个数据拍上。第四，多通道 DMA 控制器之间也需要仲裁与优先级，且必须防止任一路长期饿死。

## 二、核心原理

DMA 控制器内部通常包含：寄存器组（源/目的/长度/控制/状态）、地址生成单元、数据 FIFO（吸收总线反压与时钟域差异）、突发引擎（按总线协议发起 INCR/WRAP/FIXED 突发）以及中断逻辑。多个通道共享一条数据通路，通道之间按优先级仲裁。

工作模式的历史演进与典型分类：

- 周期窃取（cycle stealing）：每个总线周期「偷」一个周期搬运一个字，CPU 几乎无感，但吞吐低。
- 突发模式（burst mode）：连续占用总线搬运一整块，吞吐高，但会短时阻塞 CPU。
- 块/成组模式（block / demand mode）：在 FIFO 水位满足时按块搬运，兼顾吞吐与公平。
- 总线主设备（bus master）：DMA 控制器本身就是总线主设备，按 AXI 等协议发起读写事务，可与 CPU 一致地竞争总线仲裁。

总线层面的突发类型（AXI 为例）：INCR 地址递增（最常用）、WRAP 在固定窗口内回绕（适合环形缓冲）、FIXED 地址固定（适合 FIFO 式外设寄存器）。突发长度通常有上限（例如 AXI3 的单次突发受限较短，AXI4 的 INCR 可更长，具体以规范为准），且单次突发不得跨越 4KB 边界，以避免打乱从设备的地址译码与权限边界。

关键设计取舍：突发越长，每字节的协议开销越低，但（1）单次占线时间变长，影响其他主设备的延迟；（2）需要更大的 FIFO 与更深的缓冲；（3）失效粒度变大时缓存同步的边界处理更复杂。因此实际设计普遍采用「中等长度突发 + 多通道交织 + 中断合并」的组合。

FIFO 的作用常被低估：它让 DMA 引擎可以在总线暂时不可用时继续接受上游数据，从而解耦源与目的的速度差异；同时 FIFO 水位（低/高水位）决定何时发起突发，直接影响突发利用率。

## 三、形式化与数学基础

总传输时间的近似模型。设数据量 $L$ 字节、单次突发承载 $B$ 字节、一次突发的总线占用时间为 $t_{burst}$、配置与启动开销为 $t_{setup}$、完成中断处理为 $t_{irq}$：

$$T \approx \left\lceil \frac{L}{B} \right\rceil \cdot t_{burst} + t_{setup} + t_{irq}$$

其中

$$t_{burst} = t_{addr} + t_{data} + t_{stall}, \qquad t_{data} = \frac{B}{W} \cdot t_{clk}$$

（$W$ 为总线宽度，$t_{clk}$ 为总线时钟周期。）

由此得到每字节的有效成本：

$$c_{byte} = \frac{T}{L} \approx \frac{t_{addr} + t_{stall}}{B} + \frac{t_{clk}}{W} + \frac{t_{setup} + t_{irq}}{L}$$

公式清楚地说明两个优化方向：增大 $B$ 摊薄每突发的固定开销（地址阶段、握手、仲裁）；增大 $L$（用 SG 聚合）摊薄启动与中断开销。当 $B$ 足够大时，$c_{byte}$ 趋近于纯数据速率 $t_{clk}/W$，即接近总线的理论峰值。

有效带宽与总线占用率：

$$BW_{eff} = \frac{L}{T} = \frac{L}{\left\lceil L/B \right\rceil \cdot t_{burst} + t_{setup} + t_{irq}}$$

若 DMA 与 CPU 共享总线，则 CPU 可用的访存带宽近似为：

$$BW_{cpu} = BW_{total} - BW_{dma} \cdot (1 + \alpha)$$

其中 $\alpha$ 反映 DMA 事务带来的额外仲裁与刷新开销。这个式子解释了为什么在 DMA 密集型系统中，CPU 的实测带宽会显著低于理论峰值。

## 四、代码实现

```c
/* DMA 控制器寄存器级编程（概念模型）：发起一次带突发的传输 */
#include <stdint.h>

#define DMA_CTRL_EN      (1u << 0)
#define DMA_CTRL_IRQ     (1u << 1)
#define DMA_CTRL_INCR    (0u << 4)
#define DMA_CTRL_WRAP    (1u << 4)
#define DMA_CTRL_FIXED   (2u << 4)
#define DMA_STAT_DONE    (1u << 0)
#define DMA_STAT_ERR     (1u << 1)

struct dma_chan {
    volatile uint32_t src, dst, len, ctrl, stat;
    volatile uint32_t burst_len;      /* 单次突发的拍数 */
};

int dma_transfer(struct dma_chan *c, uint32_t src, uint32_t dst,
                 uint32_t len, uint32_t burst_beats) {
    if (c->stat & DMA_STAT_ERR) return -1;          /* 前次错误未清 */
    c->src = src;
    c->dst = dst;
    c->len = len;
    c->burst_len = burst_beats;                     /* 例如 16 拍 */
    /* 顺序：先写地址/长度，最后写控制寄存器使能启动 */
    dma_wmb();
    c->ctrl = DMA_CTRL_EN | DMA_CTRL_IRQ | DMA_CTRL_INCR;
    return 0;
}

int dma_wait(struct dma_chan *c) {
    while (!(c->stat & DMA_STAT_DONE)) {
        if (c->stat & DMA_STAT_ERR) return -1;
    }
    c->stat = DMA_STAT_DONE;                        /* 写 1 清标志 */
    return 0;
}

/* FIFO 水位驱动的块模式：水位达到高阈值才发起一整段突发 */
static void dma_pump(struct dma_chan *c, int fifo_level, int hi_mark) {
    if (fifo_level >= hi_mark && (c->ctrl & DMA_CTRL_EN)) {
        c->burst_len = (fifo_level / 8) * 8;         /* 对齐到 8 拍 */
    }
}
```

边界情况与实现细节：

- 控制寄存器的写顺序必须「先地址长度、后使能」，且中途要让设备观察到一致视图（写屏障）。
- 状态清洁（write-1-to-clear）是常见约定，误用会漏清中断导致中断风暴。
- 突发不可跨 4KB 边界：驱动应保证缓冲与长度满足边界约束，否则硬件可能报错或触发多次译码。
- DMA 与 CPU 同时访问同一缓冲（如环形描述符的状态字段）时必须使用原子或「拥有位」协议，不能靠时序侥幸。
- 错误处理：总线错误（如 AXI 的 DECERR/SLVERR）需要被记录并恢复，否则通道会永久卡死。

## 五、与其他技术对比

| I/O 方式 | CPU 参与度 | 吞吐 | 延迟 | 适用场景 |
| --- | --- | --- | --- | --- |
| 程序控制（轮询） | 每字节 | 低 | 低（可预测） | 极低速、调试 |
| 中断驱动 | 每字节/每小批 | 中 | 中断开销敏感 | 键盘、低速串口 |
| 周期窃取 DMA | 每次一周期 | 中高 | 对 CPU 影响小 | 混合负载、老式控制器 |
| 突发/块模式 DMA | 每块一次 | 高 | 占线期间阻塞其他主 | 高速外设、存储、网络 |
| SG-DMA | 每次多段一次 | 最高 | 与段数相关 | 网络、NVMe、通用高吞吐 |

## 六、常见误区

1. 认为 DMA 完全绕过 CPU 也就无需同步：缓存一致性与描述符同步仍是必需，尤其在非一致平台上。
2. 认为 DMA 不争用总线：DMA 与 CPU 共享内存端口与带宽，必须仲裁，容量规划时要预留 DMA 占用。
3. 认为突发越长越好：长突发会增加单次占线时间与 FIFO 需求，损害其他主设备的延迟，需权衡。
4. 忽略 4KB 边界限制：跨越边界的突发会被从设备拒绝或产生额外译码，驱动必须保证约束。
5. 认为 FIFO 越深越好：FIFO 消耗面积与功耗，且过深会掩盖上游拥塞，使反馈变慢。
6. 忽略错误状态与清洁语义：未清的中断与错误位会让通道失效甚至造成中断风暴。

## 七、与开源书·权威来源对应

- Tanenbaum《Modern Operating Systems》：I/O 硬件、DMA 与中断驱动的系统描述。
- Patterson & Hennessy《Computer Organization and Design》：DMA 与 I/O 接口的基础。
- Hennessy & Patterson《Computer Architecture: A Quantitative Approach》：I/O 系统、总线带宽与 DMA 的性能建模。
- ARM AMBA AXI 规范：突发类型（INCR/WRAP/FIXED）、长度约束与 4KB 边界规则。
- Linux 内核 DMA-API 文档：DMA 缓冲的映射与同步语义。
- Bryant & O'Hallaron《CSAPP》：存储层次与带宽的量化讨论。

## 八、面试题

1. 问：DMA 完成后为什么还要做缓存维护？答：设备写的是内存，CPU 缓存中可能留有旧副本（或反之 CPU 脏数据未写回），必须按方向做 clean/invalidate 才能保证视图一致。
2. 问：突发传输的好处是什么？答：把地址阶段、仲裁与握手等固定开销摊薄到多拍数据上，使每字节成本随突发长度下降并趋近总线峰值带宽。
3. 问：周期窃取与突发模式如何取舍？答：周期窃取对 CPU 干扰小但吞吐低，适合与 CPU 共享总线的低优先级设备；突发模式吞吐高但单次占线时间长，适合大块搬运。
4. 问：为什么突发不能跨 4KB 边界？答：便于从设备做地址译码、权限与保护检查，防止一次突发落入不同页面或不同从设备，简化硬件实现。
5. 问：FIFO 在 DMA 控制器中起什么作用？答：吸收总线反压与两侧速率差，解耦源与目的；水位阈值决定何时发起突发，直接影响突发利用率与延迟。

## 九、演进与趋势

- 总线主设备化与 QoS：DMA 控制器成为标准 AXI 主设备，通过 QoS 与限速避免长期占据互联。
- SG-DMA 与 IOMMU 普及：把多段聚合与地址翻译交给硬件，减少拷贝并提升安全性。
- 多通道/多队列设计：按核或按优先级分通道，减少仲裁冲突并提升局部性。
- 与卸载引擎融合：DMA 引擎越来越多地承担校验和、切分、压缩等卸载功能，成为「数据搬运 + 处理」的通用引擎。
- 内存解聚场景：CXL 类互连让 DMA 目标可能是远端内存池，延迟模型从「本地总线」变为「跨链路」，突发与预取策略需要重新设计。

## 十、小结

DMA 控制器通过「CPU 配置一次、硬件搬运一批」把 I/O 的 CPU 占用降到最低，而突发传输则通过摊薄地址、仲裁与握手开销把每字节成本压向总线峰值。性能模型 $T \approx \lceil L/B \rceil t_{burst} + t_{setup} + t_{irq}$ 清楚地指出两条优化路径：增大突发长度与用 SG 聚合传输量。与此同时，缓存同步、仲裁公平、4KB 边界与错误恢复是不可省略的正确性条件——DMA 的效率提升永远建立在正确性的前提之上。
