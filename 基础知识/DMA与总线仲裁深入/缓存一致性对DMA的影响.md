# 缓存一致性对DMA的影响

> 对应 Hennessy & Patterson《Computer Architecture: A Quantitative Approach》I/O 与缓存一致性章节、Intel SDM 卷 3（多核缓存与 DMA 行为），以及 Linux 内核 Documentation/DMA-API.txt 的 DMA 语义约定。

## 一、背景与挑战

DMA 让外设直接读写内存，而 CPU 可能已经把同一批数据缓存进了私有缓存。如果两侧不同步，就会出现两类错误：

- 陈旧读（stale read）：CPU 缓存中留有旧值，设备已把新数据写入内存，但 CPU 读缓存命中拿到旧值。
- 丢失写（lost write）：CPU 的脏数据仍在缓存中未写回，设备写入内存后又被缓存写回覆盖，导致数据丢失。

这不是「性能优化」问题而是正确性问题。历史上大量驱动 bug 都源于此：网卡收到了包但栈里读到旧数据；或者 CPU 填好的描述符设备看不到。

第二个挑战是「谁来负责同步」。x86 平台通常让 PCIe 设备的 DMA 参与缓存一致性（硬件自动维护），软件几乎不需干预；而许多嵌入式 ARM 平台的内存是「不可缓存」或非一致映射，必须由驱动显式做缓存维护（clean/invalidate）。更复杂的是同一条平台上不同内存区域的属性可能不同（Normal cacheable 与 Device/non-cacheable 混用），驱动必须针对每类缓冲使用正确的 API。

## 二、核心原理

方向一（CPU→设备，例如发送缓冲区）：在把缓冲区交给设备之前，必须把 CPU 缓存中的脏数据清理（clean / flush / writeback）到内存，确保设备读到的内存内容是新值。顺序上必须「先完成缓存清理，再启动 DMA」。

方向二（设备→CPU，例如接收缓冲区）：设备写完成后，CPU 若之前读过该缓冲（或硬件做投机预取），缓存中可能存在旧副本，必须使对应缓存行失效（invalidate），否则后续读会命中旧值。若 CPU 从未读该缓冲（纯写由设备完成），失效仍然必要——因为投机预取或先前读可能已把旧内容带进缓存。

顺序要求非常关键：**清理必须在 DMA 启动之前，失效必须在 DMA 完成之后**。顺序颠倒会导致数据损坏——例如先失效再启动 DMA，则 DMA 期间 CPU 的访问仍可能把旧值重新填入缓存。

Linux 的 DMA API 把这两类场景区分为两种映射：

- 一致映射（coherent mapping，`dma_alloc_coherent`）：分配时就保证 CPU 与设备视图一致，通常映射为非缓存或硬件一致，代价是 CPU 访问慢（无缓存加速）。适合长期存在、双向频繁访问的描述符环。
- 流式映射（streaming mapping，`dma_map_single` / `dma_map_sg`）：按传输方向做一次性映射，允许 CPU 侧正常缓存，但在 DMA 前后需要 `dma_sync_single_for_device` / `dma_sync_single_for_cpu` 做方向性同步。这是大多数驱动的选择。

如果设备不支持访问全部物理地址（如 32 位设备在 64 位系统上），内核会使用弹跳缓冲（bounce buffer / swiotlb）：先把数据拷贝到设备可寻址的缓冲，再由设备搬运，代价是一次额外内存拷贝。

## 三、形式化与数学基础

一致性条件：对任意地址 $a$，一致视图要求「缓存的拥有者」与内存内容最终一致：

$$\forall a:\ M[a] = C_{owner}[a] \quad \text{（在同步点上必须成立）}$$

DMA 前的写端同步（clean）：

$$\text{clean}(S) \;\Rightarrow\; \forall a \in S:\ M[a] \leftarrow C[a]$$

DMA 后的读端同步（invalidate）：

$$\text{inval}(S) \;\Rightarrow\; \forall a \in S:\ C[a] \leftarrow \bot \ \text{（下一次读回落到内存）}$$

顺序约束可写成：

$$clean(S) \prec_{po} \text{start\_dma}(S), \qquad \text{dma\_done}(S) \prec_{po} inval(S)$$

一个常见陷阱是覆盖范围必须按缓存行对齐。设缓存行大小为 $B$，缓冲首地址为 $p$、长度为 $L$，则被影响的行区间为：

$$\left[\left\lfloor \frac{p}{B} \right\rfloor B,\ \left\lceil \frac{p + L}{B} \right\rceil B\right)$$

若一个缓存行同时包含「DMA 缓冲」与「其他数据结构」，那么对该行的失效会波及无关数据（正确但浪费），而对该行的清理可能把无关数据的不完整修改写回（若并发访问同一行，风险更大）。因此驱动必须保证 DMA 缓冲按缓存行对齐并填充到整行，避免伪共享与「半行」问题。

## 四、代码实现

```c
/* Linux 驱动风格：流式映射 + 方向性同步（概念示意，具体 API 以内核文档为准） */
#include <linux/dma-mapping.h>

struct tx_buf {
    void    *cpu_addr;      /* CPU 侧虚拟地址 */
    dma_addr_t dma_addr;    /* 设备侧总线地址（IOVA 或物理地址） */
    size_t   len;
};

/* 发送方向：CPU 写好数据 -> 清理缓存 -> 启动 DMA */
int tx_prepare(struct device *dev, struct tx_buf *b) {
    b->dma_addr = dma_map_single(dev, b->cpu_addr, b->len, DMA_TO_DEVICE);
    if (dma_mapping_error(dev, b->dma_addr))
        return -ENOMEM;
    /* map 已隐含一次 cache clean（按架构实现），DMA 启动必须在之后 */
    return 0;
}

void tx_complete(struct device *dev, struct tx_buf *b) {
    dma_unmap_single(dev, b->dma_addr, b->len, DMA_TO_DEVICE);  /* 收尾同步 */
}

/* 接收方向：设备写完后 -> 失效缓存 -> CPU 才能读 */
void rx_after_dma(struct device *dev, struct tx_buf *b) {
    dma_sync_single_for_cpu(dev, b->dma_addr, b->len, DMA_FROM_DEVICE);
    /* 此后 CPU 读到的是设备写入的新数据 */
}
```

```c
/* 描述符环：DMA 控制器读取描述符本身也需要同步，
   而且"写完描述符 -> 置有效位"这两步之间必须有写屏障，
   否则控制器可能看到有效位但看不到描述符内容 */
static void submit_desc(volatile struct desc *ring, int idx,
                        uint64_t addr, uint32_t len) {
    ring[idx].addr = addr;
    ring[idx].len  = len;
    dma_wmb();                                  /* 先让内容可见 */
    ring[idx].flags = DESC_OWN | DESC_VALID;     /* 再置有效位（门铃） */
    /* 若使用 MMIO 门铃寄存器，还需要 mmiowb()/wmb() 保证顺序 */
}
```

边界情况要点：其一，零长度或非对齐长度必须归一化到缓存行边界处理；其二，若缓冲被重新使用（回收再发送），必须重新 map 或重新 sync，因为缓存状态可能已被 CPU 改动；其三，使用 `dma_alloc_coherent` 得到的缓冲不需要显式 sync，但 CPU 访问慢，适合控制结构而非大批数据；其四，设备与 CPU 并发访问同一缓冲（如状态字段）需要原子或环形设计，不能依赖「缓存维护」代替并发控制。

## 五、与其他技术对比

| 方案 | CPU 缓存可用 | 同步责任 | 性能 | 典型场景 |
| --- | --- | --- | --- | --- |
| 全非缓存映射 | 否 | 无 | CPU 访问慢 | 寄存器、控制块 |
| 一致映射（coherent） | 硬件保证 | 无（对软件） | 中（CPU 访问偏慢） | 描述符环、长期共享结构 |
| 流式映射 + 显式 sync | 是 | 驱动 | 高 | 收发数据缓冲 |
| 弹跳缓冲（bounce） | 是 | 内核 | 中（多一次拷贝） | 32 位设备 + 64 位系统 |
| 硬件 IO 一致性（CXL/CCIX 类） | 是 | 硬件 | 高但延迟大 | 异构加速器共享内存 |

## 六、常见误区

1. 认为 `malloc` 的内存可以随便 DMA：必须用 DMA API 获取设备可寻址的总线地址，虚拟地址不能直接给设备。
2. 认为设备写完数据 CPU 立刻能读到新值：必须先做 invalidate，否则可能命中旧缓存行。
3. 认为只在传输开始做一次同步就够：发送前要 clean，接收后要 invalidate，方向不同、时机不同。
4. 忽略描述符本身的同步：DMA 控制器读描述符同样受缓存影响，且「内容写完后置有效位」需要写屏障。
5. 认为跨越缓存行的缓冲无害：非对齐缓冲会导致失效/清理波及无关数据，并可能引发并发破坏。
6. 认为 x86 的经验通用：x86 硬件保证设备 DMA 一致，换到非一致 ARM 平台就会出现「在 x86 上好好的」驱动崩溃。

## 七、与开源书·权威来源对应

- Hennessy & Patterson《Computer Architecture: A Quantitative Approach》：I/O 系统、DMA 与缓存一致性的交互。
- Intel SDM 卷 3：多核缓存行为、内存类型（WB/WC/UC）与设备访问语义。
- Linux 内核 DMA-API 文档与其 DMA 属性说明：一致映射与流式映射、同步方向与 API 语义。
- Bryant & O'Hallaron《CSAPP》：存储层次与 I/O 的实测视角，缓存行与局部性。
- Stevens《TCP/IP Illustrated》：网络驱动中缓冲与描述符的实际组织方式。
- Tanenbaum《Modern Operating Systems》：I/O 子系统与 DMA 的角色。

## 八、面试题

1. 问：设备写入内存后 CPU 读到旧值怎么办？答：对相应地址范围做缓存失效（invalidate），并保证失效发生在 DMA 完成之后；同时保证缓冲按缓存行对齐。
2. 问：什么是缓存一致（coherent）DMA？答：由硬件（IO 一致性互连或平台保证）维持设备与 CPU 缓存视图一致，软件无需显式做缓存维护；代价是互连复杂度与访问延迟。
3. 问：为什么 DMA 同步必须区分方向？答：发送方向需要把 CPU 的脏数据清理到内存（clean），接收方向需要把可能过期的 CPU 缓存副本作废（invalidate），两者操作与时机都不同。
4. 问：一致映射与流式映射如何取舍？答：长期存在、频繁双向访问的控制结构用一致映射（免同步但 CPU 访问慢）；大块一次性数据用流式映射并做方向性 sync（CPU 侧可享受缓存）。
5. 问：描述符环为什么需要写屏障？答：控制器可能乱序观察到「有效位置位」与「描述符字段写入」，若不加屏障会读到半成品描述符，导致 DMA 到错误地址。

## 九、演进与趋势

- IO 一致性互连普及：CXL.cache / CCIX 类协议让设备直接参与一致性域，驱动层的手工缓存维护逐步减少。
- 共享虚拟地址（SVA）：设备使用与进程相同的地址空间（配合 PASID 与 SMMU/IOMMU），减少映射与拷贝。
- 零拷贝与内核旁路：DPDK、io_uring 等路径尽量让 DMA 缓冲长期驻留并避免 CPU 侧缓存翻转。
- 弹跳缓冲的替代：IOMMU 的地址翻译能力让 32 位设备也能访问高位地址，减少 swiotlb 拷贝。
- 形式化与静态检查：内核的稀疏（sparse）注解与 DMA 调试设施（dma-debug）用于自动发现方向与同步错误。

## 十、小结

DMA 与缓存的交互是「正确性先于性能」的典型战场：发送前 clean、接收后 invalidate、顺序不可颠倒、范围需按缓存行对齐，描述符自身的同步与写屏障同样不可省略。一致映射用 CPU 访问速度换取免同步，流式映射用显式 sync 换取高带宽，硬件 IO 一致性则把责任上移到互连。理解这三条路线的代价与边界，就能在任意平台上写出正确的 DMA 驱动。
