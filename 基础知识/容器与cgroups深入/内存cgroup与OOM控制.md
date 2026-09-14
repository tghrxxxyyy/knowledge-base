# 内存cgroup与OOM控制

> 对应 kernel 文档 cgroups-v2.rst 内存控制器 / Menage 2004 cgroups 内存子系统。

## 一、背景与挑战
单容器内存泄漏或超限不应拖垮整机。在共享主机上，若不做限制，某个容器的匿名页或缓存无节制增长会挤压其他容器与内核，触发整机 OOM killer 随机杀进程，造成雪崩式不可用。内存 cgroup（control group）把一组进程的内存用量纳入一个记账单元，设硬上限并内置回收与局部 OOM 机制，使故障被隔离在容器内。

这既保护整机，也提供可预测的资源画像，是容器调度（如 Kubernetes limit/request）的底层支撑。没有内存 cgroup，多租户节点上「一个坏邻居」就能拖垮所有人，SLA 无从谈起。

值得注意的是，内存记账本身有精度边界：page cache 属于「可回收」内存，计入用量但不一定代表真实压力；而内核内存（slab、页表）只有部分可被回收。因此「用量超限」与「真实内存压力」并不等价，这也是为什么实践中要同时观察 `memory.stat` 与 PSI 压力指标，而不能只看单一数字。

## 二、核心原理
cgroup v2 内存控制器以 `memory.current` 记账组内所有进程的用户态内存（匿名页、文件缓存 page cache、以及内核内存如 slab 的可选部分）。两个关键阈值：`memory.high` 是「软上限」，超过后内核节流（throttle）该组分配、加速回收，但不杀进程；`memory.max` 是「硬上限」，超过即触发组内 OOM killer。

回收顺序：先回收该组的 page cache（丢弃干净缓存），再尝试换出；仍无法压回 `memory.max` 时，组内 OOM killer 依据 `oom_score`（由内存占用比例 + `oom_score_adj` 调整）选目标杀死，并记入 `memory.events` 的 `oom_kill` 计数。注意 v2 中 OOM 默认杀在组内，而非整机。`memory.swap.max` 单独限制 Swap 用量；若未设，匿名内存超 `memory.max` 可能直接 OOM 而非换出。cgroup v2 还用 `memory.stat` 暴露各类内存明细，便于定位泄漏来源；`memory.zswap`/zswap 可在换出前压缩，缓解 swap 延迟。

另一个容易混淆的层级是「cgroup 树」：子 cgroup 的用量会向上累加到父级，父级的 `memory.max` 是对整棵子树的约束。因此「容器超限」既可能是自身配置太小，也可能是父级（如 pod/kubepods 层）限额更紧所致，排查时必须沿树向上核对每一级。

## 三、形式化与数学基础
组内使用量 $U$，硬上限 $M$，软上限 $H$（$H\le M$）：

$$ U > H \Rightarrow reclaim\ \&\ throttle;\quad U > M \Rightarrow OOM\_kill(target) $$

OOM 评分（简化模型）：

$$ score = \frac{U_{proc}}{M} \cdot 1000 + oom\_score\_adj $$

组内 OOM killer 选 $score$ 最高者杀，目标是释放后使 $U < M$。`oom_score_adj` 范围 $[-1000, 1000]$：设为 $-1000$ 可使进程免于被选中（如关键 sidecar）；设为 $+1000$ 则优先作为 sacrificial 进程被杀。

注意该评分是「启发式」而非「最优选择」：杀最高分进程未必能释放足够内存使其降到 $M$ 以下，因此内核可能连续触发多次 OOM kill。这也是为什么生产上更提倡「用 `memory.high` 提前节流」而非依赖 OOM 兜底。

## 四、代码实现
```bash
# 限制 myapp 内存：软上限 800M、硬上限 1G、Swap 上限 200M
mkdir -p /sys/fs/cgroup/myapp
echo 800M > /sys/fs/cgroup/myapp/memory.high
echo 1G   > /sys/fs/cgroup/myapp/memory.max
echo 200M > /sys/fs/cgroup/myapp/memory.swap.max

# 把进程加入该 cgroup
echo $PID > /sys/fs/cgroup/myapp/cgroup.procs

# 观察 OOM 与压力事件
cat /sys/fs/cgroup/myapp/memory.events     # 含 oom_kill / oom 计数
cat /sys/fs/cgroup/myapp/memory.stat       # anon / file / kernel 明细

# 调高/调低某进程被杀概率（保护关键进程）
echo -500 > /proc/$CRITICAL_PID/oom_score_adj
echo  500 > /proc/$BULKY_PID/oom_score_adj
```

```c
// 伪代码：用 cgroup v2 原生接口设置内存上限（openat 直写）
int set_mem_max(int cg_fd, const char *val) {
    int fd = openat(cg_fd, "memory.max", O_WRONLY);
    write(fd, val, strlen(val));           // 如 "1G"
    close(fd);
    return 0;
}
// 真实程序会先用 openat(AT_FDCWD, "/sys/fs/cgroup/myapp", ...) 拿到目录 fd

// 主动回收：向 memory.reclaim 写入字节数，触发同步回收
int trigger_reclaim(int cg_fd, const char *bytes) {
    int fd = openat(cg_fd, "memory.reclaim", O_WRONLY);
    write(fd, bytes, strlen(bytes));       // 如 "256M"
    close(fd);
    return 0;
}
```

## 五、与其他技术对比
| 维度 | 整机 OOM | cgroup 内存上限 | Swap | zswap |
| --- | --- | --- | --- | --- |
| 影响范围 | 整机随机杀 | 组内局部杀 | 全局换出 | 组内压缩换出 |
| 可预测性 | 差 | 好（按 limit） | 延迟不可控 | 延迟较低 |
| 关键进程保护 | 难 | `oom_score_adj` | 无 | 继承 cgroup |
| 适用 | 无隔离 | 容器隔离 | 缓解但不限 | 压缩缓解 |

`memory.max` 是硬限、`memory.high` 是软节流；相较整机 OOM，cgroup OOM 范围小、可控。`memory.swap.max` 与 `memory.max` 独立，需用 swap 时分别设。PSI（Pressure Stall Information）暴露 `some`/`full` 停滞，可在 OOM 前预警。

## 六、常见误区
- 误以为 `memory.max` 含 Swap。错，Swap 由 `memory.swap.max` 单独限制，二者独立。
- 误以为 OOM 只杀触发者。错，杀组内 `score` 最高者，未必是越限的那个进程。
- 误以为 `memory.high` 会杀进程。错，它只节流 + 回收，是软限；只有 `memory.max` 触发 OOM。
- 误以为设 `0` 即禁内存。错，非法的 0 值会被拒绝，须为正整数或合理字节。
- 误以为 page cache 不计入。错，文件缓存计入 `memory.current`，可回收但仍占额。
- 误以为 `memory.current` 超 `memory.max` 立即杀。错，先回收/换出，仍压不回才 OOM。
- 误以为只看自身 cgroup 配置就够。错，父级限额会向下约束，必须沿 cgroup 树逐级核对。

## 七、与开源书·权威来源对应
- 内核文档 `Documentation/admin-guide/cgroup-v2.rst` 内存控制器章节（`memory.max`/`memory.high`/`memory.events`）。
- Menage 2004「Adding Generic Process Containers to the Linux Kernel」cgroups 早期提案。
- Bovet & Cesati《Understanding the Linux Kernel》关于页回收（LRU）与 OOM 机制。
- OSTEP（Operating Systems: Three Easy Pieces）内存隔离与调度章。

## 八、面试题
1. 容器 OOM 为何不影响整机？（cgroup v2 的组内 OOM killer 只杀本组进程，记 `memory.events`。）
2. `memory.high` 与 `memory.max` 区别？（前者软节流 + 回收不杀；后者硬限触发 OOM。）
3. 如何保护关键进程不被 OOM？（调低其 `oom_score_adj`，最低 $-1000$ 免杀。）
4. `memory.max` 和 `memory.swap.max` 关系？（独立限制；不设 swap 上限则匿名内存更易直接 OOM。）
5. PSI 与 OOM 的关系？（PSI 暴露压力，可在 OOM 前预警或触发扩缩容。）
6. 为什么 OOM 可能连续触发多次？（选最高分进程未必能释放足够内存压回限额，可能需多轮淘汰。）

## 九、演进与趋势
v2 统一内存记账替代 v1 的 `memory.limit_in_bytes` 等分散接口；新增 `memory.reclaim` 主动回收（echo 触发），以及 PSI 暴露 `cpu/memory/io` 压力供自动扩缩容（如 Kubernetes 基于 PSI 的 Vertical Pod Autoscaler）。`memory.peak` 记录峰值便于设限参考；用户态 OOM 守护（如 systemd OOMD）结合 cgroup 事件做更智能的驱逐，避免等到硬限才被动杀。zswap 与内存级压缩进一步缓和换出延迟。

值得关注的还有「L3/内存带宽」类资源控制：当内存容量被隔离后，带宽与缓存占用成为新的多租户争用点，Intel RDT（CAT/MBA）等技术正是为这类「非容量型」内存资源提供隔离手段。

## 十、小结
内存 cgroup 以「软节流 `memory.high` + 硬上限 `memory.max` + 局部 OOM」把内存故障隔离在容器内：先回收节流、越硬限才局部杀，配合 `oom_score_adj` 保护关键进程。它是容器资源隔离与调度可预测性的基石，配合 PSI 与 OOMD 可进一步在 OOM 前预警与智能驱逐；而 cgroup 树的层级约束与可回收内存的记账边界，是排查「为什么被 OOM」时必须先厘清的两个前提。
