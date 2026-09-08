> 对应 Linux 内核 Documentation（cgroup-v2 / admin-guide/cgroup-v2.rst）与 Silberschatz《Operating System Concepts》。

## 一、背景与挑战
多租户/容器场景需要为每个 workload 设定内存上限，防止单体进程拖垮整机。挑战是在层级化分组内精确计量与回收，并在组内超限时局部触发 OOM，而不是波及全局。

## 二、核心原理
cgroup v2 的 memory 控制器为每个 group 维护统计（anon、file、kernel、sock 等）与 hard limit（memory.max）。当组内使用逼近上限，先在该 memcg 内触发回收；若仍超限，则在该 memcg 内运行 OOM Killer 选择组内 victim（而非全局），保证隔离性。统计以 page_counter 树状累加，父节点看见子节点总和。

## 三、形式化与数学基础
设 memcg c 的使用量 u(c) = Σ 各类型计数。层级约束：
```
u(c) <= memory.max(c)
u(c) >= Σ_{child i} u(child_i)         // 父统计含子
```
OOM 触发条件：分配使 u(c) 超过 memory.max(c) 且回收后仍无法回落，则在 c 的子树中选 badness 最高者（badness 计算同全局 OOM，但搜索范围限定于 c 的 tasks）。

## 四、代码实现
```c
// mm/memcontrol.c（简化）
static enum oom_status mem_cgroup_oom(struct mem_cgroup *memcg, gfp_t mask, int order)
{
    if (mem_cgroup_under_move(memcg))
        return OOM_SKIPPED;
    // 在 memcg 子树内选择 victim
    ret = out_of_memory(&oc);   // oc 的约束限定于 memcg
    if (ret == OOM_SUCCESS)
        return OOM_SUCCESS;
    return OOM_FAILED;
}
// 分配失败路径
if (page_counter_read(&memcg->memory) > memcg->memory.high)
    try_to_free_mem_cgroup_pages(memcg, ...);
```

## 五、与其他技术对比
- 全局 OOM：跨所有进程，隔离差。
- memcg OOM：局部、可控、配合 systemd 的 OOMPolicy。
- ulimit：仅限单进程，无层级聚合。

## 六、常见误区
- 误区：设置 memory.max 后内存绝不超。内核态不可回收内存（kernel slab 等）可能暂时越过。
- 误区：memcg OOM 会杀父进程。实际在子树内选 victim，父仅作为统计节点。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/admin-guide/cgroup-v2.rst「Memory」章节权威定义 memory.max / memory.high。
- Silberschatz《Operating System Concepts》讨论资源配额与隔离。
- GitHub Vonng/ddia 的容器资源隔离笔记。

## 八、面试题
1. memory.high 与 memory.max 的区别？
2. memcg OOM 的 victim 选择范围是什么？
3. 为什么父 cgroup 统计一定不小于子 cgroup 之和？

## 九、演进与趋势
cgroup v1 的 memory 控制器统计粗糙、OOM 语义混乱；cgroup v2 统一了统计口径、引入 memory.high 作为「软上限」提前节流，并改善 OOM 事件的 eventfd 通知。

## 十、小结
cgroup 内存控制器把计量、回收、OOM 都限定在层级子树内，实现了容器级的强隔离与可预测的局部故障。
