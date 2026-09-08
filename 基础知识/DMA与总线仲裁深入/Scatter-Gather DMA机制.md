# Scatter-Gather DMA机制

> 对应 Tanenbaum《Computer Organization and Design》与 ARM AMBA AXI 规范。

## 一、背景与挑战
应用数据常分散在多个不连续缓冲区（如网络包头部与载荷）。逐段启动 DMA 需多次中断与配置，效率低下。

## 二、核心原理
Scatter-Gather DMA 使用一个描述符链表，每个描述符给出一段（地址、长度、下一指针）。控制器自动遍历链表，连续完成多段传输，仅在全部完成后中断一次。

## 三、形式化与数学基础
总传输为分段集合的并：

    Transfer = \bigcup_{i=0}^{n-1} [addr_i, addr_i + len_i)

控制器状态机按描述符指针对齐推进，减少 CPU 干预次数至 O(1)。

## 四、代码实现
```c
struct sg_entry { uint64_t addr; uint32_t len; uint32_t flags; uint64_t next; };
void setup_sg(volatile struct sg_entry *head) {
    /* 填充链表, 置链尾 flags 的 END 位 */
    head->flags |= (1u << 0); /* 使能链遍历 */
    start_dma_engine(head);   /* 一次启动, 多次传输 */
}
```

## 五、与其他技术对比
阻塞式逐缓冲 DMA 每片段一中断，CPU 开销大；SG-DMA 一次配置多段，吞吐更高、延迟更低。

## 六、常见误区
误以为 SG 仅用于发送；接收侧同样可用以收集分段到多缓冲。误以为描述符无需缓存同步。

## 七、与开源书/权威来源对应
AXI 规范描述基于描述符的 DMA；网络驱动（如 Linux netdev）广泛使用 SG。

## 八、面试题
1. SG-DMA 相比普通 DMA 的优势？答：减少中断与配置次数。
2. 描述符链为何需 cache 同步？

## 九、演进与趋势
与 IOMMU 结合校验描述符地址；零拷贝网络栈依赖 SG。

## 十、小结
Scatter-Gather DMA 用描述符链批量搬运分散缓冲，是高效 I/O 的关键机制。
