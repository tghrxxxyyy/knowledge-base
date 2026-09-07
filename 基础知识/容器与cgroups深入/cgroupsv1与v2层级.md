# cgroupsv1与v2层级

> 对应 Menage 2004 "Adding Generic Process Containers to the Linux Kernel" 与 kernel 文档 `cgroups-v2.rst`。

## 一、背景与挑战
隔离视图不够，还需限制/计量资源（CPU、内存、IO）。cgroups（控制组）把进程分组并施加资源策略。v1 每子系统独立层级、配置复杂；v2 统一树、更一致。

## 二、核心原理
cgroups 以层级（目录树）组织，进程（tasks）属某 cgroup，继承祖先限制。v1 各子系统（cpu/memory/blkio）可挂不同层级，易冲突；v2 单层级（unified hierarchy），子树控制（`cgroup.subtree_control`）声明启用子系统，叶子 cgroup 设具体值。

## 三、形式化与数学基础
资源配额自顶向下约束：
$$limit(child) \le limit(parent)$$
v2 权重模型：CPU 权重 $w_i$，实际份额：
$$share_i = \frac{w_i}{\sum_j w_j} \cdot available$$
进程加入 cgroup 后受其所有祖先限制交集约束。

## 四、代码实现
```bash
# cgroups v2：挂载统一层级并限制 CPU 与内存
mount -t cgroup2 none /sys/fs/cgroup
mkdir /sys/fs/cgroup/myapp
echo "+cpu +memory" > /sys/fs/cgroup/cgroup.subtree_control
echo 100000 > /sys/fs/cgroup/myapp/cpu.max   # 配额/周期
echo 512M   > /sys/fs/cgroup/myapp/memory.max
echo $PID   > /sys/fs/cgroup/myapp/cgroup.procs
```

## 五、与其他技术对比
cgroups v2 单树一致、防冲突；v1 灵活但难配。相较 namespace，cgroups 管资源不隔离视图。相较 systemd slice，cgroups 是底层机制、systemd 是其管理面。

## 六、常见误区
误以为 v1 与 v2 可混用同子树：冲突，须择一。误以为 memory.max=0 禁内存：应设合理值。误以为 cgroup 自动回收：需 procs 迁移。

## 七、与开源书/权威来源对应
内核 `cgroups-v1.rst`/`cgroups-v2.rst`；Menage 2004 原始提案；OSTEP 容器章。

## 八、面试题
问：cgroups v1 与 v2 主要区别？答：v1 多独立层级，v2 单统一树、子树控制。问：限制如何继承？

## 九、演进与趋势
多数发行版默认 cgroups v2；systemd 全面采用；io.weight 取代 blkio 权重。

## 十、小结
cgroups 以层级对进程组施加资源限制与计量，v2 统一树解决了 v1 的复杂度问题。
