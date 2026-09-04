# CPU剖析

> 对应 Brendan Gregg CPU 剖析方法论与 perf/flame graph。

## 一、背景与挑战
CPU 瓶颈表现为高利用率但低有效吞吐、上下文切换过多、或多核负载不均。需区分是"算得多"（on-CPU）还是"等得久"（off-CPU：锁、I/O、调度）。

## 二、核心原理
- on-CPU 剖析：采样 PC（程序计数器）得到热点函数。
- off-CPU 剖析：记录线程阻塞与唤醒路径，定位等待原因。
- 调度器视角：run queue 长度、上下文切换次数、迁移次数。
- 微架构：IPC（每周期指令数）、CPU 停滞周期（stall）。

## 三、形式化 / 数学基础
- IPC（Instructions Per Cycle）：$IPC = \frac{\text{instructions}}{\text{cycles}}$，理想接近 1~4，偏低说明停顿。
- 利用率 $U_{cpu} = 1 - \frac{\text{idle\_time}}{T}$。
- 上下文切换率 $C = \frac{\text{switch\_count}}{T}$。
- 多核负载不均可用方差 $\sigma^2 = \frac{1}{n}\sum (u_i - \bar u)^2$ 衡量。

## 四、代码实现
```c
// 用 perf 周期性采样（示意，实际用 perf record -F 99 -a -g sleep 30）
// 热点统计伪代码
void sample_pc(pid_t pid, int freq) {
    // 每 1/freq 秒读取一次 PC 并累加计数
    for (;;) {
        uint64_t pc = read_register(pid, REG_PC);
        counter[pc]++;
        usleep(1000000 / freq);
    }
}
```

## 五、与其他技术对比
- top/htop：进程级粗粒度，看不到函数热点。
- perf stat：计数器汇总，不提供调用栈。
- 火焰图：把采样栈可视化为可下钻的热点树。

## 六、常见误区
- 只看 %CPU 忽略 IPC；高 %CPU 但低 IPC 往往是内存墙。
- 忽视 off-CPU：大量时间花在等锁/等 I/O。
- 采样频率过低导致热点被平滑。

## 七、与开源书 / 权威来源对应
- Brendan Gregg《Systems Performance》CPU 章节与 Flame Graphs 文档。
- CS-Notes：https://github.com/CyC2018/CS-Notes （操作系统 CPU 调度）。

## 八、面试题
- on-CPU 与 off-CPU 剖析区别？何时 off-CPU 更重要？
- 高 CPU 利用率但吞吐上不去，可能原因？
- 如何用 perf 生成火焰图？

## 九、演进与趋势
eBPF（bpftrace、BCC）实现生产级无侵入 CPU/调度剖析；硬件 PMU 遥测细化到缓存未命中、分支预测失败。

## 十、小结
CPU 剖析先分 on/off-CPU，用 IPC 与采样火焰图定位热点，再用微架构计数器解释原因。
