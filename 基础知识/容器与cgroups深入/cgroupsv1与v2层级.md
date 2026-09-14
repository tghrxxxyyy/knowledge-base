# cgroupsv1与v2层级

> 对应 kernel 文档 cgroups-v1.rst / cgroups-v2.rst 与 Menage 2004 提案。

## 一、背景与挑战

仅有视图隔离不够，还需限制与计量资源（CPU、内存、IO）。cgroups（control groups）把进程分组并施加资源策略。但 v1 设计为每个子系统（subsystem，如 cpu、memory、blkio）可挂到**独立**的层级树，导致同一批进程在不同子系统下可能处于不同的目录结构，配置复杂且语义混乱（例如同一进程在 cpu 树与 memory 树里的父节点不同）。v2 用「统一层级（unified hierarchy）」把全部控制器收拢到一棵树，消除这种不一致，是现代发行版默认选择。

层级（hierarchy）的本质是「限制如何继承」：子 cgroup 的可用资源不超过父节点，且同树内控制器配置一致。理解层级是正确配置 Kubernetes 等编排系统资源模型的前提。

v1 的另一处痛点在于「控制器语义不统一」：同为内存限额，`memory.limit_in_bytes` 的软硬限语义与 `memory.soft_limit_in_bytes` 的回收时机，与 IO 的 `blkio.weight` 并不能用同一套心智模型描述；v2 则统一为「份额（weight）+ 上限（max）」的二元结构，跨控制器可类推。

## 二、核心原理

cgroups 以目录树组织，进程（task）属于某个 cgroup，受该节点及其所有祖先限制的交集约束。v1 各子系统（cpu/memory/blkio/net_cls…）可挂到不同的层级，甚至一个子系统多个挂载点，灵活但易冲突、难以推理。v2 改为**单层级（unified hierarchy）**：整棵 `cgroup2` 树只有一个，控制器（cpu、memory、io、pids…）通过 `cgroup.subtree_control` 在某一节点「声明启用」，启用后其直接子节点才能使用该控制器。

v2 有「无内部进程（no internal processes）」规则：一个启用了 `subtree_control` 的 cgroup 不应直接包含进程（进程应放在叶子 cgroup），否则控制器无法在子树间公平分配。这强制「目录节点做分组、叶子节点放进程」的清晰结构，避免了 v1 的混乱。

还有一项 v2 的关键改进：「单一可写挂载点」。v1 允许同一控制器多处挂载，导致配置可能被同时写入两个位置而语义不明；v2 只允许一个挂载点（通常 `/sys/fs/cgroup`），写入位置唯一，因此「配置在哪生效」不再有歧义。

## 三、形式化与数学基础

资源配额自顶向下约束（子不超过父）：

$$ limit(child) \le limit(parent) $$

v2 权重模型：CPU 权重 $w_i$（默认 100，范围 1–10000），实际份额为归一化比例：

$$ share_i = \frac{w_i}{\sum_j w_j} \cdot available $$

进程加入某 cgroup 后，受其所有祖先限制的交集约束。对于带宽类硬限（如 `cpu.max`），可用量同样沿树递减：子节点的 `quota` 不能超过父节点在该周期内可分配的总量。

| 维度 | v1 表达 | v2 表达 |
| --- | --- | --- |
| CPU 份额 | `cpu.shares` | `cpu.weight` |
| CPU 硬限 | `cpu.cfs_quota_us` | `cpu.max` |
| 内存上限 | `memory.limit_in_bytes` | `memory.max` |
| 内存软限 | `memory.soft_limit_in_bytes` | `memory.high` |
| PIDs 限制 | `pids.max`（各挂） | `pids.max`（统一树） |

## 四、代码实现

```bash
# cgroups v2：挂载统一层级并限制 CPU 与内存
mount -t cgroup2 none /sys/fs/cgroup
mkdir /sys/fs/cgroup/myapp
# 在父节点声明启用 cpu、memory 控制器（启用后子节点可用）
echo "+cpu +memory" > /sys/fs/cgroup/cgroup.subtree_control
echo "100000 100000" > /sys/fs/cgroup/myapp/cpu.max    # 配额/周期（满 1 核）
echo 512M           > /sys/fs/cgroup/myapp/memory.max
echo $PID           > /sys/fs/cgroup/myapp/cgroup.procs  # 移入进程（叶子）
# 查看控制器启用情况与统计
cat /sys/fs/cgroup/cgroup.subtree_control
cat /sys/fs/cgroup/myapp/cgroup.events
```

```bash
# 区分「启用控制器」与「使用控制器」：父节点启用、子节点才有对应文件
cat /sys/fs/cgroup/cgroup.controllers          # 本系统支持哪些控制器
cat /sys/fs/cgroup/myapp/cgroup.controllers    # myapp 已获得哪些控制器（由父节点 subtree_control 决定）
# 委托子树给非特权用户（rootless 容器基础）
chown -R user:user /sys/fs/cgroup/myapp
echo "+cpu +memory" > /sys/fs/cgroup/myapp/cgroup.subtree_control  # 由 user 操作
```

## 五、与其他技术对比

| 维度 | cgroups v1 | cgroups v2 |
| --- | --- | --- |
| 层级结构 | 每子系统独立树 | 单一统一树 |
| 控制器启用 | 挂载时指定 | `subtree_control` 动态 |
| 配置复杂度 | 高（易冲突） | 低（一致） |
| 进程放置 | 任意节点 | 叶子（无内部进程规则） |
| 默认 | 旧发行版 | 新发行版/systemd |

cgroups v2 单树一致、防冲突；v1 灵活但难配。相较 namespace，cgroups 管资源不隔离视图；相较 systemd slice，cgroups 是底层机制、systemd 是其管理面。v1 与 v2 不能混挂同一子树，须择一。

| 相关机制 | 职责 | 与 cgroups 关系 |
| --- | --- | --- |
| namespace | 视图隔离 | 互补，常配合使用 |
| systemd slice/scope | 层级管理面 | 操作 cgroups |
| seccomp/capabilities | 系统调用与特权裁剪 | 安全加固层 |

## 六、常见误区

- 误以为 v1 与 v2 可混用同子树。错，冲突，须择一挂载。
- 误以为 `memory.max=0` 禁内存。错，应设合理值；0 非法。
- 误以为 cgroup 自动回收进程。错，需显式写 `cgroup.procs` 迁移。
- 误以为启用控制器后本节点能直接放进程。错，v2 无内部进程规则要求进程放叶子。
- 误以为 `cgroup.procs` 与 `tasks` 等价。错，v1 有 `tasks`（每线程）与 `cgroup.procs`（每线程组），v2 主要用 `cgroup.procs`。
- 误以为写了 `subtree_control` 所有子节点就都有控制器。错，该设置仅对**直接子节点**生效，需逐层声明。

## 七、与开源书·权威来源对应

- 内核文档 `Documentation/admin-guide/cgroup-v1.rst` 与 `cgroup-v2.rst`（层级、subtree_control、no internal processes）。
- Menage 2004「Adding Generic Process Containers to the Linux Kernel」原始提案。
- OSTEP 容器章关于 cgroups 作为资源隔离基元。
- Love《Linux Kernel Development》调度与 cgroups 集成背景。

## 八、面试题

1. cgroups v1 与 v2 主要区别？（v1 多独立层级、配置复杂；v2 单统一树、subtree_control 声明启用。）
2. 限制如何沿层级继承？（子不超过父，受所有祖先交集约束。）
3. 什么是「无内部进程」规则？（启用 subtree_control 的节点不放进程，进程放叶子。）
4. 为什么 v2 更易推理？（单一树 + 一致控制器语义，避免 v1 的跨树不一致。）
5. `subtree_control` 的作用范围？（仅直接影响下一级子节点，需沿树逐层启用。）
6. 为什么说 v2 更利于委托？（单一树 + 无内部进程规则使子树可安全交给非特权用户管理。）

## 九、演进与趋势

多数发行版默认 cgroups v2；systemd 全面采用并以 slice/scope/service 组织层级。v2 新增 `io.weight` 取代 blkio 权重、`pids` 防 fork 炸弹、`cpu.uclamp` 钳制 util。线程级 cgroup（thread mode）允许同一进程组内不同线程归入不同 cgroup，细化到线程粒度；委托（delegation）让非特权用户安全管理子树，支撑 rootless 容器。

容器编排层也在跟进：Kubernetes 的 cgroup v2 支持成为默认方向，`memory.high`（软限/节流）与 `memory.max`（硬限/OOM）的区分直接影响 Pod 的 QoS 行为；PSI（Pressure Stall Information）以 `cpu.pressure`、`memory.pressure` 量化资源压力，让「资源不够」从布尔判断升级为连续指标，成为自动伸缩与准入控制的新依据。

## 十、小结

cgroups 以层级对进程组施加资源限制与计量：v1 多独立树灵活却混乱，v2 统一树 + `subtree_control` + 无内部进程规则解决了复杂度与一致性问题。它是容器资源可预测性的底层机制，也是 Kubernetes 资源模型的内核映射。实务上建议一律以 v2 为基准：先确认 `cgroup.controllers`，再沿树逐层 `subtree_control` 启用，最后把进程写入叶子节点的 `cgroup.procs`。
