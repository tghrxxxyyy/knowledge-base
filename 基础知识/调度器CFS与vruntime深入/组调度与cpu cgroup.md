> 对应 Linux 内核 Documentation（scheduler/sched-design-CFS.rst 与 cgroup）与 Silberschatz《Operating System Concepts》。

## 一、背景与挑战
仅按单进程公平不足以表达「一组任务应共享某份额」。例如一个容器内的多个进程应整体与其他容器公平竞争。挑战是把公平从「进程级」提升到「组级」，且层级化、可嵌套。

## 二、核心原理
CFS 的 sched_entity 可以是进程，也可以是「组」。组调度把 cpu cgroup 映射为层级化的 sched_entity 树：父组按其权重在兄弟间竞争 CPU，赢得的 CPU 再按子实体权重在内部分配。cpu.shares 控制组间相对权重（默认 1024）。最终每个进程获得的 CPU 是「组间份额 × 组内份额」的连乘结果。

## 三、形式化与数学基础
设组 G 权重 s_G，其子进程权重 w_i。组 G 获得的全局 CPU 比例：
```
share_global(G) = s_G / Σ_siblings s
```
组内进程 i 获得：
```
cpu_i = share_global(G) * (w_i / Σ_{j∈G} w_j)
```
嵌套组递归应用上述公式，形成层级公平。

## 四、代码实现
```c
// 典型 cgroup v1 用法（命令行 + 内核结构）
// mkdir /sys/fs/cgroup/cpu/A; echo 512 > A/cpu.shares
// 内核侧：组对应 task_group，含 se（调度实体）挂在父 cfs_rq
struct task_group {
    struct sched_entity **se;     // 每 CPU 一个 se
    struct cfs_rq **cfs_rq;       // 每 CPU 一个子运行队列
    unsigned long shares;
};
// 入队时把组的 se 也挂在父 cfs_rq 的 rb tree 上
```

## 五、与其他技术对比
- 进程级 CFS：不隔离组间份额。
- cpu cgroup 组调度：层级公平，适合容器。
- cpuset：限定跑在哪些 CPU，与份额正交。

## 六、常见误区
- 误区：cpu.shares 是绝对 CPU 百分比。它是相对兄弟组的权重，单组时无法用满之外仍按比例竞争。
- 误区：组内进程数不影响份额。组内进程越多，单进程分得越少（组内再平分）。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/scheduler/sched-design-CFS.rst「group scheduling」。
- cgroup v2 Documentation/admin-guide/cgroup-v2.rst 的 cpu 控制器。
- GitHub Vonng/ddia 的容器资源隔离笔记类比组调度。

## 八、面试题
1. 组调度如何把 CPU 在父子层级间分配？
2. cpu.shares 是绝对值还是相对值？
3. 一个 cgroup 内进程增多对单进程 CPU 有何影响？

## 九、演进与趋势
cgroup v2 用 cpu.weight 取代 shares（更直观的对数映射）；与 cpu.max（cfs_quota/period）结合可同时做「公平 + 硬上限」。

## 十、小结
组调度把 sched_entity 嵌套成树，让 cpu cgroup 在层级间递归分配 CPU，实现容器级的公平资源划分。
