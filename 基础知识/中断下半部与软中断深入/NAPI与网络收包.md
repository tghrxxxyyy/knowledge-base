> 对应 Linux 内核 Documentation（networking/napi.rst）与 RFC 791（IP）/RFC 793（TCP）背景。

## 一、背景与挑战
高包速率下，每包一个硬件中断会导致「中断风暴」，CPU 大量时间花在中断上下文切换而非处理数据。挑战是在高负载时减少中断、改为轮询批处理，同时在低负载时保持低延迟的中断驱动。

## 二、核心原理
NAPI（New API）混合中断与轮询：收到首个包时产生中断，top half 关闭该队列中断并调度 NAPI 软中断（NET_RX_SOFTIRQ）；在 softirq 中调用驱动的 poll 函数，从 ring buffer 批量取包上交协议栈，直到配额（budget）用完或队列空，再重新开启中断。低负载时中断驱动保证及时；高负载时轮询批处理降低中断密度。

## 三、形式化与数学基础
设每次 poll 最多处理 budget B 个包，权重与 netdev_budget 全局共享。中断密度随负载变化：
```
low_load : 中断每包触发，延迟 L_min
high_load: 一次中断 + 轮询 B 包，平均中断率 ≈ rate / B
```
有效吞吐受 budget 与会话权重约束，避免单一设备独占 softirq 时间。

## 四、代码实现
```c
// 驱动侧（简化）
static int my_poll(struct napi_struct *napi, int budget)
{
    int work = 0;
    while (work < budget && (skb = ring_dequeue(rx_ring))) {
        netif_receive_skb(skb);   // 上交协议栈
        work++;
    }
    if (work < budget) {          // 队列空，重新开启中断
        napi_complete(napi);
        enable_rx_irq(dev);
    }
    return work;
}
static irqreturn_t my_irq(int irq, void *dev)
{
    napi_schedule(&priv->napi);   // 触发 NET_RX_SOFTIRQ
    return IRQ_HANDLED;
}
```

## 五、与其他技术对比
- 每包中断：简单、低负载延迟好，高负载中断风暴。
- NAPI 轮询：高负载高效，需驱动支持与 ring buffer。
- busypoll：应用主动轮询，进一步降延迟但占 CPU。
- 传统「bottom half 收包」：无批处理，效率低。

## 六、常见误区
- 误区：NAPI 完全不用中断。低负载仍靠中断唤醒轮询。
- 误区：budget 越大越好。过大会让单设备占用 softirq 过久，影响公平。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/networking/napi.rst 权威描述。
- RFC 791/793 定义 IP/TCP，为收包协议栈提供标准背景。
- GitHub xiaolincoder/hello-http 的「网络」图解涉及收包路径。

## 八、面试题
1. NAPI 如何在高负载时减少中断？
2. poll 函数的 budget 用尽但仍有包会怎样？
3. 为什么低负载仍需要中断？

## 九、演进与趋势
从单一 NAPI 到多队列（RSS）、XDP（eBPF 在驱动层处理）、以及 gro/gso 卸载，收包路径不断把处理下推到网卡与轮询结合，提升 PPS。

## 十、小结
NAPI 用「中断唤醒 + 软中断轮询批处理」自适应地兼顾低延迟与高吞吐，是现代 Linux 网络栈高 PPS 的基石。
