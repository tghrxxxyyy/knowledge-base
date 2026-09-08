# 中断亲和性与NUMA平衡

> 对应 Linux 内核 Documentation 与 Hennessy & Patterson《Computer Architecture》。

## 一、背景与挑战
默认情况下中断可能集中在某几个 CPU，造成热点与缓存抖动。把中断绑定到处理其数据的 CPU，并考虑 NUMA 本地内存，可降低延迟、提升吞吐。

## 二、核心原理
通过 procfs 的 smp_affinity 或 irqbalance 守护进程设置每中断的目标 CPU 掩码，使设备中断落到使用其数据的核上。NUMA 平衡进一步让内存分配靠近处理 CPU，减少跨节点访问。

## 三、形式化与数学基础
CPU 亲和掩码为位集合 $A \subseteq \{0,\dots,C-1\}$。期望最小化跨节点内存访问：

$$ \min \sum_{i} \text{dist}(CPU_i, \text{mem\_node}(i)) $$

其中 $\text{dist}$ 为 NUMA 距离函数，本地为 10，跨节点更大。

## 四、代码实现
设置亲和（用户态简化）：

```c
cpu_set_t mask;
CPU_ZERO(&mask);
CPU_SET(2, &mask);
sched_setaffinity(0, sizeof(mask), &mask);  // 进程亲和
// 中断亲和通过写 /proc/irq/<n>/smp_affinity_list
```

内核侧 irq_set_affinity 更新 APIC 重定向表。

## 五、与其他技术对比
静态绑定简单但可能负载不均；irqbalance 动态迁移但引入抖动；NUMA 感知绑定比单纯 CPU 绑定更优，因为它同时考虑内存局部性。与调度器 CPU 集配合效果更佳。

## 六、常见误区
认为绑死中断一定最好，突发流量下可能压垮单核；忽略 NUMA，跨节点访问抵消亲和收益；认为亲和设置即时生效，需驱动与 APIC 协同。

## 七、与开源书/权威来源对应
Linux 内核 Documentation/IRQ-affinity.txt 与 numa.txt 为权威；Hennessy & Patterson 讨论 NUMA 与缓存一致性；Vonng/ddia 虽为分布式，其局部性思想可类比。

## 八、面试题
中断亲和的目的；NUMA 如何影响中断处理；irqbalance 的取舍；如何度量跨节点访问。

## 九、演进与趋势
每个队列独立 MSI-X 向量让亲和更细粒度；RPS/RFS 把软中断负载均衡到应用 CPU；持久内存改变 NUMA 距离模型。

## 十、小结
中断亲和性与 NUMA 平衡通过把中断与数据处理放在同一 CPU 与本地内存节点，降低缓存与互连开销，是多核与多插槽系统性能调优的关键手段。
