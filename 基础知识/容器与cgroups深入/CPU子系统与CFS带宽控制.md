# CPU子系统与CFS带宽控制

> 对应 Love《Linux Kernel Development》第 6 章 CFS 与 kernel 文档 sched-design-CFS.rst。

## 一、背景与挑战

多容器共享 CPU，既需要公平又需要可控：默认情况下所有进程争抢同一个就绪队列，某个容器起大量线程就可能饿死他人。cgroups 的 CPU 子系统提供两条杠杆——`cpu.weight` 调相对权重保证公平，`cpu.max` 设硬上限（带宽控制）防止单容器吃满整机。二者结合，才能让「喧闹的邻居」被限制，同时让重要负载拿到应得份额。

理解这套机制要先理解 CFS（Completely Fair Scheduler）：它是 Linux 自 2.6.23 起的默认调度器，目标是让每个任务「公平地」分摊 CPU，而非固定时间片。CFS 不维护传统时间片，而是维护一个按虚拟运行时间排序的红黑树。

难点在于「公平」与「上限」的组合效应：权重只在**有竞争时**才有意义，而配额在任何时候都生效；若把两者混用又不理解其交互，很容易出现「设了高权重却仍被 throttle」或「配额给够了却因权重低跑不满」的困惑。

## 二、核心原理

CFS 的核心数据结构是就绪任务的红黑树，键值为 `vruntime`（虚拟运行时间）。每次时钟中断或任务结束运行时，CFS 选 `vruntime` 最小的任务运行——这样「跑得少」的任务会被优先调度，从而趋于公平。任务的权重 `weight` 决定 `vruntime` 的增长速度：权重越高，`vruntime` 增长越慢，越容易再次被选中，等价于拿到更多 CPU。

cgroups v2 的 `cpu.weight`（默认 100，范围 1–10000）给整个 cgroup 设权重；`cpu.max = quota period` 实现带宽控制：在每个 `period`（默认 100ms）内，该 cgroup 所有任务累计运行时间不得超过 `quota`，超出则被限流（throttle）挂起，直到下个周期开始才放行。这给了「硬上限」，与仅表达相对份额的 weight 互补。

带宽控制的实现细节值得记住：运行时为每个 cgroup 维护一个「周期计时器 + 已用配额计数」，任务运行时间由调度切出时累计；当计数触及 quota，整个 cgroup 被标记 throttled 并从运行队列摘除，直到周期翻转。这意味着 throttle 是**整组生效**的——组内单个线程也可能因其他线程耗尽配额而一起被挂起。

## 三、形式化与数学基础

虚拟时间推进（按物理时间 $\Delta t$ 与 nice 权重）：

$$ vruntime \mathrel{+}= \frac{weight_{nice}}{weight_{task}} \cdot \Delta t_{phys} $$

带宽约束（每 period 内累计运行）：

$$ \sum_{t\in period} run(t) \le quota,\quad util = \frac{quota}{period} $$

`quota = period` 表示单核满用（如 `100000 100000` 即 100ms/100ms，半核则是 `50000 100000`）。`quota < period` 限制比例；在多核上 `quota > period` 合法，表示可跨多核同时使用（如 `200000 100000` 允许用满 2 核）。

| 配置 | quota/period | 含义 |
| --- | --- | --- |
| 半核 | 50000 / 100000 | 约 0.5 核 |
| 满 1 核 | 100000 / 100000 | 约 1 核 |
| 满 2 核 | 200000 / 100000 | 可跨 2 核并发 |
| 无限制 | `max` | 不受带宽约束 |

## 四、代码实现

```bash
# 限制 myapp 每 100ms 最多用 50ms CPU（约半核）
mkdir -p /sys/fs/cgroup/myapp
echo "50000 100000" > /sys/fs/cgroup/myapp/cpu.max

# 提高相对权重（默认 100，越大越优先）
echo 200 > /sys/fs/cgroup/myapp/cpu.weight

# 观察限流与累计使用
cat /sys/fs/cgroup/myapp/cpu.stat    # 含 throttled_usec / nr_throttled
echo $PID > /sys/fs/cgroup/myapp/cgroup.procs
```

```bash
# 跨多核示例：允许用满 2 核
echo "200000 100000" > /sys/fs/cgroup/myapp/cpu.max
```

```bash
# 限流过高会显著伤害尾延迟——用 cpu.stat 定位
cat /sys/fs/cgroup/myapp/cpu.stat
#   nr_throttled        被限流的次数（高 -> 配额偏小或 period 偏短）
#   throttled_usec      累计被限流时长
#   usage_usec          累计实际使用
# 若 nr_throttled 持续增长而 usage_usec 远低于 quota，说明「配额给够但被其他因素阻塞」
```

## 五、与其他技术对比

| 维度 | CFS 权重 | 带宽控制(cpu.max) | RT 调度 | cpuset |
| --- | --- | --- | --- | --- |
| 语义 | 相对份额 | 硬上限 | 绝对延迟保证 | 绑核 |
| 越界行为 | 自然平衡 | 限流挂起 | 抢占 | 仅跑指定核 |
| 适用 | 公平分担 | 防吃满整机 | 低延迟任务 | NUMA/亲和 |

CFS 公平无固定时间片；实时调度（RT）保证延迟但会占满；`cpu.max` 是硬上限、`cpu.weight` 是相对份额；相较 `cpuset`，`cpu.max` 不限跑哪颗核，只限用量。

| 场景 | 建议组合 |
| --- | --- |
| 多租户公平共享 | `cpu.weight` 按重要性配比 |
| 防单容器吃满 | `cpu.max` 设上限 |
| 低延迟关键负载 | `cpu.weight` 高 + 必要时 RT |
| NUMA 敏感 | 叠加 `cpuset.cpus`/`mems` |

## 六、常见误区

- 误以为 `cpu.weight` 是绝对核数。错，它只是相对权重，需在竞争存在时才有意义。
- 误以为 `quota > period` 非法。错，多核场景下允许跨核并发（如 2 核配额）。
- 误以为被 throttle 的进程「死了」。错，它只是暂停到下一周期，并非被杀死。
- 误以为权重能突破 quota。错，quota 是硬天花板，权重只在天花板内分配相对比例。
- 误以为 CFS 用时间片。错，CFS 用 `vruntime` 红黑树，「时间片」只是派生的近似值。
- 误以为 throttle 只影响耗配额的那个线程。错，配额按 cgroup 整组统计，组内其他线程也会被一起挂起。

## 七、与开源书·权威来源对应

- Love《Linux Kernel Development》第 6 章 CFS 与 `vruntime` 红黑树。
- 内核文档 `Documentation/scheduler/sched-design-CFS.rst` 与 `cgroup-v2.rst` 的 CPU 控制器。
- Menage 2004「Adding Generic Process Containers to the Linux Kernel」cpu 子系统。
- OSTEP 调度章（MLFQ 与 CFS 的公平思想对照）。

## 八、面试题

1. CFS 如何保证公平？（按 `vruntime` 最小者运行，权重高者 `vruntime` 增长慢、得更多 CPU。）
2. `cpu.max` 的 `quota period` 含义？（每 period 内最多运行 quota 微秒，超出限流。）
3. `cpu.weight` 与 `cpu.max` 区别？（前者相对份额，后者硬上限。）
4. 为什么 `quota > period` 在多核合法？（允许跨核并发，总量可超单核周期。）
5. 为什么设置了高权重仍被限流？（quota 是硬天花板，权重只在天花板内分配比例。）
6. 如何判断限流是否伤害了尾延迟？（看 `cpu.stat` 的 `nr_throttled` 与 `throttled_usec`，并结合业务延迟分位数。）

## 九、演进与趋势

cgroups v2 用 `cpu.weight`（基于 2^20 刻度映射自 v1 的 `cpu.shares`）取代 `cpu.shares`，更直观；EEVDF（Earliest Eligible Virtual Deadline First）调度器自 6.6 起逐步取代 CFS，改善尾延迟与公平性。带宽控制新增 `cpu.uclamp` 可钳制任务 util 上限/下限，配合调度器做更细粒度节能与优先级管理。

容器编排层的对应演进是「从限制走向可观测与自适应」：Kubernetes 的 CPU Manager 与 `topologyManager` 借助 cpuset 做绑核与 NUMA 亲和；PSI（`cpu.pressure`）暴露压力停滞时间，支撑更精准的扩缩容；`cpu.idle`（v2）提供「仅在系统空闲时运行」的语义，用于后台批处理而不干扰前台服务。

## 十、小结

CFS 以 `vruntime` 红黑树实现公平调度，cgroups 的 `cpu.weight` 调相对份额、`cpu.max` 设硬上限，二者在容器间分配与限制 CPU，是容器算力的调节阀。理解「权重决定比例、quota 决定天花板」是正确配置容器 CPU 的关键。工程上建议：先按重要性设权重，再按「不能超过多少核」设配额，最后用 `cpu.stat` 的限流指标验证配置是否造成了非预期延迟。
