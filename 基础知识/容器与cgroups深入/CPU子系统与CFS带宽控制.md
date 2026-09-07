# CPU子系统与CFS带宽控制

> 对应 Love《Linux Kernel Development》第 6 章 CFS 与 kernel 文档 `sched-design-CFS.rst`。

## 一、背景与挑战
多容器共享 CPU，需既公平又可控：CFS（完全公平调度器）按权重公平分配，cgroups 的 `cpu.weight` 调权重、`cpu.max` 设硬上限（带宽控制）防单容器吃满。

## 二、核心原理
CFS 维护红黑树按虚拟运行时间 `vruntime` 选最小者运行，权重高者 `vruntime` 增长慢、得更多 CPU。`cpu.max = quota period` 实现带宽控制：每 period 内 cgroup 累计运行不超 quota，超限则限流（throttle）至下周期。

## 三、形式化与数学基础
虚拟时间推进：
$$vruntime += \frac{weight_{nice}}{weight_{task}} \cdot \Delta t_{phys}$$
带宽约束：
$$\sum_{t\in period} run \le quota,\quad util = \frac{quota}{period}$$
quota=period 即单核满用；quota<period 限比例；多核可 quota>period（跨核）。

## 四、代码实现
```bash
# 限制 myapp 每 100ms 最多用 50ms CPU（半核）
echo "50000 100000" > /sys/fs/cgroup/myapp/cpu.max
# 提高相对权重（默认 100）
echo 200 > /sys/fs/cgroup/myapp/cpu.weight
```

## 五、与其他技术对比
CFS 公平无固定时间片；实时调度（RT）保证延迟但占满。带宽控制 vs 权重：前者硬上限、后者相对份额。相较 cpuset，cpu.max 不限跑哪核。

## 六、常见误区
误以为 cpu.weight 是绝对核数：是相对权重。误以为 quota>period 非法：可跨多核。误以为 throttled 进程死：仅暂停至下周期。

## 七、与开源书/权威来源对应
Love LKD 第 6 章 CFS；内核 CFS 设计文档；Menage 2004 cpu 子系统。

## 八、面试题
问：CFS 如何保证公平？答：按 vruntime 最小者运行，权重调增速。问：cpu.max 含义？

## 九、演进与趋势
`cpu.weight`(v2) 取代 `cpu.shares`(v1)；EEVDF 调度器逐步取代 CFS 改善尾延迟。

## 十、小结
CFS 以 vruntime 公平调度，cgroups 带宽/权重在容器间分配与限制 CPU，是容器算力的调节阀。
