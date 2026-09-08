> 对应 Linux 内核 Documentation（admin-guide/mm/numa_memory_policy.rst）与 Intel SDM 卷3 的「NUMA」背景。

## 一、背景与挑战
NUMA 系统中，内存本地与远端访问延迟可差数倍；swap 设备（尤其 NVMe）也可能与某些节点更近。挑战是在回收与换入时兼顾「节点亲和性」，避免把页换到远端节点对应的设备，造成跨节点访问放大。

## 二、核心原理
每节点有独立 lruvec 与 kswapd，回收优先在本节点内发生（node-local reclaim）。换出时优先选「本节点可达且快」的 swap 设备；换入时尽量把页放回触发缺页的本地节点。内核用 zonelist 排序与 NUMA 策略（如 MPOL_BIND）约束分配来源。

## 三、形式化与数学基础
设节点 i 访问本地内存延迟 L_local，远端节点 j 为 L_remote >> L_local。跨节点换入额外代价：
```
cost_cross = L_remote - L_local + T_swap_io
```
若把页从节点 i 换到与节点 j 更近的 swap 设备，换入时节点 i 访问会产生 cross-node 开销。最优策略使：
```
min Σ (distance(node_fault, node_of_page))
```
内核通过 per-node swap_info 亲和与 MPOL 实现近似。

## 四、代码实现
```c
// mm/mempolicy.c + mm/vmscan.c（简化）
struct page *alloc_pages_vma(gfp_t gfp, int order, struct vm_area_struct *vma,
                             unsigned long addr, int node, bool hugepage)
{
    pol = get_vma_policy(vma, addr);            // NUMA 策略
    if (pol->mode == MPOL_BIND)
        preferred_nid = first_node(pol->v.nodes); // 限定节点
    page = __alloc_pages_nodemask(gfp, order, preferred_nid, nmask);
    return page;   // 换入页尽量落在策略允许节点
}
```

## 五、与其他技术对比
- 全局 swap 池：简单但不感知 NUMA 距离。
- per-node swap：亲和好，但配置复杂、需要多设备。
- autoNUMA：运行时迁移页到访问它的节点，减少跨节点。

## 六、常见误区
- 误区：swap 是全局单一设备，与 NUMA 无关。实际可按节点/策略亲和。
- 误区：远端内存等价慢。仅当缺页频繁跨节点访问时才显著。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/admin-guide/mm/numa_memory_policy.rst 说明 MPOL。
- Intel SDM 卷3 描述 NUMA 与内存类型（如靠近 GPU/SSD 的访问特性）。
- GitHub remzi-arpacidusse/ostep-code 的「vm」示例演示 NUMA 影响。

## 八、面试题
1. 为什么 NUMA 下回收应尽量 node-local？
2. MPOL_BIND 对换入页分配有何约束？
3. 跨节点换入会带来哪些额外代价？

## 九、演进与趋势
per-node kswapd、autoNUMA 页迁移、以及 CXL 内存把「NUMA 距离」进一步复杂化；swap 选择开始结合设备拓扑与带宽感知。

## 十、小结
NUMA 下的 swap 必须考虑节点亲和与设备拓扑，让回收与换入尽量本地化，避免跨节点访问放大延迟。
