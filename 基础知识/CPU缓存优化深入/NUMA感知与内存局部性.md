# NUMA感知与内存局部性

> 对应 remzi-arpacidusse/ostep-code (GitHub) / Tanenbaum《Modern Operating Systems》多处理章节。

## 一、背景与挑战
多路服务器中，内存分布到各 CPU 插槽，本地访问纳秒级，跨插槽(remote)访问延迟翻倍且挤占互连带宽。线程若访问远端内存，即使无锁竞争也变慢。

## 二、核心原理
NUMA(Non-Uniform Memory Access)节点含本地内存与处理器。操作系统按节点分配页，并支持内存策略(bind / interleave)。线程应绑定到本地核并分配本地内存，避免跨节点流量。

## 三、形式化与数学基础
访问延迟：
$$ T = \begin{cases} T_{local} & \text{同节点} \\ T_{local} + \Delta_{remote} & \text{跨节点} \end{cases} $$
设跨节点比例 $r$，平均：
$$ \bar T = (1-r)T_{local} + r(T_{local}+\Delta_{remote}) $$
降低 $r$ 直接降延迟。

## 四、代码实现
```c
// Linux 绑定内存与 CPU 到 NUMA 节点 0
#define _GNU_SOURCE
#include <numa.h>
#include <pthread.h>
void *worker(void *arg) {
    numa_run_on_node(0);                 // 线程绑核
    void *buf = numa_alloc_onnode(1<<20, 0);  // 本地节点分配
    // ... 密集访存 ...
    numa_free(buf, 1<<20);
    return NULL;
}
```

## 五、与其他技术对比
NUMA 优化与缓存优化正交：前者管跨插槽延迟，后者管内核-缓存。与伪共享相比，NUMA 是带宽/延迟域问题而非一致性行问题。

## 六、常见误区
默认 interleave 策略看似均衡实则增加 remote 访问。线程迁移导致内存变 remote。忽视大页跨节点边界。

## 七、与开源书/权威来源对应
OSTEP 多核章节讨论内存与缓存一致性；Tanenbaum 描述 NUMA 架构；libnuma 为事实标准 API。

## 八、面试题
NUMA 是什么？如何查看节点距离(numactl --hardware)？如何避免 remote 访问？

## 九、演进与趋势
CXL 内存池化模糊 NUMA 边界；自动 NUMA 平衡(numa_balancing)内核特性；持久内存(PMEM)引入新距离层级。

## 十、小结
NUMA 下"本地性"扩展到跨插槽维度。绑核+本地分配是把访存留在近端的根本方法。
