# 栈采样原理与on-off-CPU

> 对应 Brendan Gregg 的 Flame Graphs 方法论（brendangregg.com/FlameGraphs）与 off-CPU 分析，工具实现见《Computer Systems: A Programmer's Perspective》（CSAPP）第 5 章。

## 一、背景与挑战
性能问题常常不在「热点函数」本身，而在调用栈深处，或者根本不在 CPU 上——线程可能正阻塞在锁、IO、网络或调度等待里。只看「谁在跑」会遗漏大量真实瓶颈。

要回答两类问题，需要两类数据：

- 「谁在消耗 CPU？」——on-CPU 分析，采集正在占用 CPU 的调用栈。
- 「谁在等待、等了多久？」——off-CPU 分析，记录线程离开 CPU 时的栈与阻塞时长。

二者时间上互补，拼起来才构成完整的墙钟时间线。若只做 on-CPU，会把大量「等待型」问题误判为「没有瓶颈」。

## 二、核心原理
栈采样的基本机制是定时中断：以固定频率（如 perf 常用的 99Hz）触发中断，在内核中抓取当前 CPU 上运行线程的用户栈与指令指针（PC），把「栈 + 计数」聚合；反复采样后，计数占比即近似时间占比。栈的每一层对应一次函数调用，聚合后可还原调用层级的热度分布。

on-CPU 与 off-CPU 的差异：

- on-CPU：采样点落在「正在运行」的线程上，反映计算与内核态消耗。
- off-CPU：追踪调度事件，在「线程被切出 CPU」与「再次被切入」之间记录其栈与时间戳，差值即阻塞时长，栈即阻塞原因。
- 常见 off-CPU 来源：锁竞争、磁盘/网络 IO、内存分配回收、页错误、主动 sleep。

采样本质是统计估计：用有限的随机样本推断真实占用比例，因此必然存在误差，需要通过采样率与样本量来管理。

## 三、形式化与数学基础
设函数 $f$ 的采样计数为 $C_f$，总采样数为 $\sum C$，则其占比估计为：

$$ \hat{p}_f = \frac{C_f}{\sum C} $$

若真实占比为 $p$、样本量为 $n$，则估计的标准差为：

$$ \sigma(\hat{p}_f) = \sqrt{\frac{p(1-p)}{n}} $$

可见方差随样本量 $n$ 增大而以 $\sim 1/\sqrt{n}$ 收敛，因此提高采样率或延长采样时长都能提升可信度。

短函数的可见性受命中概率限制。设函数单次执行耗时 $T$、采样间隔 $\tau = 1/f$，则被命中的概率近似为：

$$ P_{hit} \approx \min\left(\frac{T}{\tau},\ 1\right) $$

当 $T \ll \tau$ 时 $P_{hit} \ll 1$，短函数被系统性低估，这就是采样偏差中的「平滑效应」。

on-CPU 与 off-CPU 时间互补，构成墙钟时长的近似分解：

$$ T_{wall} \approx T_{on} + T_{off} $$

据此可判断瓶颈类型：若 $T_{on}$ 占主导，优化计算与内核路径；若 $T_{off}$ 占主导，优化锁、IO 与调度行为。

## 四、代码实现
生成 on-CPU 火焰图。

```bash
# 99Hz 采样全机调用栈 30 秒
perf record -F 99 -a -g -- sleep 30

# 展开为文本栈并折叠
perf script | ./stackcollapse-perf.pl > oncpu.folded

# 渲染
./flamegraph.pl oncpu.folded > oncpu.svg
```

生成 off-CPU 火焰图（bcc 工具）。

```bash
# 记录离开 CPU 的栈与阻塞时长，输出折叠格式
sudo /usr/share/bcc/tools/offcputime -df -p "$(pidof myapp)" 10 > offcpu.folded

# 用冷色调渲染，便于与 on-CPU 图区分
./flamegraph.pl --colors=io offcpu.folded > offcpu.svg
```

用 bpftrace 粗看阻塞分布，快速定位方向。

```bash
# 统计被切出 CPU 的栈
sudo bpftrace -e '
kprobe:finish_task_switch {
    @[kstack] = count();
}'
```

off-CPU 采集会记录大段阻塞，输出可能很大，建议先用过滤条件缩小范围。

## 五、与其他技术对比

| 维度 | 栈采样 | 插桩/计数 | off-CPU 分析 |
| --- | --- | --- | --- |
| 开销 | 低 | 高，侵入 | 中到高 |
| 精确度 | 统计估计 | 精确 | 记录阻塞区间 |
| 覆盖范围 | 全局分布 | 指定点 | 等待行为 |
| 短函数可见性 | 低，易低估 | 高 | 不适用 |
| 典型用途 | 找热点 | 精确计量 | 找等待与阻塞 |

采样以低开销换全局视野，插桩以侵入换精确计数；二者结论冲突时，通常用插桩校准采样的偏差。

## 六、常见误区
- 低采样率看不出短函数：$T \ll \tau$ 时短函数被平滑掉，误以为它「不耗时」。
- 只看 on-CPU：忽略 off-CPU 会漏掉锁竞争、IO 等待等「不占 CPU 却很慢」的瓶颈。
- 把采样计数当精确值：它是统计估计，样本少时波动大。
- 采集范围过宽：对整机采样时，噪音进程会稀释目标进程的信号。

## 七、与开源书·权威来源对应
- Brendan Gregg 的 Flame Graphs 方法论与 off-CPU 分析文章是第一手来源。
- 《CSAPP》第 5 章介绍了 perf 与性能度量基础。
- perf 官方文档（perf record/script、--call-graph）说明了采样与栈展开选项。

## 八、面试题
1. on-CPU 与 off-CPU 的区别是什么？各自能发现什么问题？
2. 采样率如何选？为什么短函数容易被低估？
3. 采样方差与样本量是什么关系？如何提高结论可信度？
4. 若 on-CPU 很低但请求很慢，应该如何排查？

## 九、演进与趋势
- eBPF 让「任意事件 + 栈采样」变得方便，无需落 perf.data 再离线解析。
- 持续剖析（Continuous Profiling）提供实时火焰图，支持按时间对比。
- 硬件辅助采样（如 PEBS）提升精确性与短函数可见度，on/off-CPU 联合视图逐步成熟。

## 十、小结
栈采样以低开销还原调用热点，on-CPU 展示谁在消耗 CPU，off-CPU 展示谁在等待，二者时间互补构成完整时间线。它是性能分析的起点：先用它确定方向，再决定是否用插桩或追踪深入。理解采样偏差与方差，是正确解读火焰图的前提。
