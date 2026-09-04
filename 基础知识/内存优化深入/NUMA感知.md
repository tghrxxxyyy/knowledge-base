# NUMA感知

> 对应非一致内存访问（NUMA）架构与内存 locality。

## 一、背景与挑战
多路服务器中，内存分布在不同 CPU 插槽（node）上，访问本地内存快、跨节点慢（可达 2x）。忽视 NUMA 会导致远端访问拖慢关键路径。

## 二、核心原理
- NUMA node：CPU 核 + 本地内存的组合；node 间通过互联（如 UPI）通信。
- 内存策略：default（本地优先）、bind、interleave。
- 线程与内存绑定（亲和性）：让线程访问其本地 node 内存。
- 跨节点访问增加延迟并占用互联带宽。

## 三、形式化 / 数学基础
- 本地访问延迟 $t_{local}$；远端 $t_{remote} = k \cdot t_{local},\ k\approx 1.5\sim 2$。
- 远端比例 $r = \frac{\text{remote\_access}}{\text{total\_access}}$，越低越好。
- 带宽：本地 $B_{local} > B_{remote}$。
- 亲和掩码：CPU 集 $A$ 与内存 node $N$ 应使 $\forall c\in A,\ \text{node}(c)=N$。

## 四、代码实现
```c
#define _GNU_SOURCE
#include <numa.h>
void pin_and_alloc(int node) {
    struct bitmask *b = numa_allocate_nodemask();
    numa_bitmask_setbit(b, node);
    numa_bind(b);                       // 绑定当前线程到 node
    void *p = numa_alloc_onnode(1<<20, node); // 在本地 node 分配
    numa_free(p, 1<<20);
}
```

## 五、与其他技术对比
- UMA：对称延迟但难扩展到多路；NUMA：可扩展但有 locality 成本。
- 线程池全局队列：可能跨 node；per-node 队列保持 locality。
- 大页 + NUMA 绑定的组合优化。

## 六、常见误区
- 认为所有内存访问一样快。
- 跨 node 启动线程却用默认内存策略导致远端分配。
- 盲目 interleave 让单线程负载也跨节点变慢。

## 七、与开源书 / 权威来源对应
- Brendan Gregg《Systems Performance》NUMA 与内存带宽章节。
- libnuma 文档：https://github.com/numactl/numactl

## 八、面试题
- 什么是 NUMA？为什么远端访问慢？
- 如何把线程与内存绑定到同一 node？
- 什么场景适合 interleave 策略？

## 九、演进与趋势
CXL 内存扩展模糊 node 边界；自动 NUMA 均衡（autoNUMA）内核特性。

## 十、小结
NUMA 感知要求把线程与数据放在同一 node，降低远端访问延迟，是大规模多路优化的关键。
