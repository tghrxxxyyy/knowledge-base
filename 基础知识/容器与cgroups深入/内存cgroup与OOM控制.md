# 内存cgroup与OOM控制

> 对应 kernel 文档 `cgroups-v2.rst` 内存控制器与 Menage 2004 cgroups 内存子系统。

## 一、背景与挑战
单容器内存泄漏不应拖垮整机。内存 cgroup 限定每组内存用量，超限触发回收；仍不足则 OOM killer 在该组内杀进程，而非整机 OOM。

## 二、核心原理
`memory.max` 设硬上限，进程组累计匿名/缓存/内核内存在内。接近上限时内核先回收该组页缓存；超 `memory.high` 更早节流。越 `memory.max` 分配失败或触发组内 OOM killer（选 `oom_score` 高者），并记 `memory.events`。

## 三、形式化与数学基础
组内使用 $U$，上限 $M$：
$$U > M \Rightarrow reclaim;\quad U \gg M \Rightarrow OOM\_kill(target)$$
OOM 评分：
$$score = \frac{ram\_usage}{M} \cdot 1000 + oom\_score\_adj$$
选最高分杀，目标是释放使 $U < M$。

## 四、代码实现
```bash
echo 1G > /sys/fs/cgroup/myapp/memory.max      # 硬上限
echo 800M > /sys/fs/cgroup/myapp/memory.high   # 软节流点
# 观察事件
cat /sys/fs/cgroup/myapp/memory.events         # oom_kill 计数
# 调高/低某进程被杀概率
echo -500 > /proc/$PID/oom_score_adj
```

## 五、与其他技术对比
memory.max 硬限、memory.high 软节流；vs 整机 OOM，cgroup OOM 范围小、可控。相较 swap，cgroup 限物理占用。oom_score_adj 让用户选" sacrificial"进程。

## 六、常见误区
误以为 memory.max 含 swap：可用 memory.swap.max 单独限。误以为 OOM 只杀触发者：杀组内最高分。误以为设 0 即禁内存：非法，须正整数。

## 七、与开源书/权威来源对应
内核 memory 控制器文档；Menage 2004；OSTEP 调度/隔离。

## 八、面试题
问：容器 OOM 为何不影响整机？答：cgroup 内 OOM killer 只杀组内进程。问：memory.high 作用？

## 九、演进与趋势
`memory.reclaim` 主动回收接口；PSI（pressure stall）暴露内存压力供自动扩缩容。

## 十、小结
内存 cgroup 以硬上限+软节流+OOM 局部化，把内存故障隔离在容器内。
