# 栈采样原理与on-off-CPU

> 对应 Brendan Gregg 火焰图方法论 (brendangregg.com/FlameGraphs) / 《CSAPP》第5章 perf。

## 一、背景与挑战
性能问题常藏在调用栈深处而非热点函数本身。采样调用栈能定位"谁在消耗 CPU"以及"谁在等待"，但 on-CPU 与 off-CPU(阻塞/睡眠)需不同采集。

## 二、核心原理
定时中断(如 perf 默认 99Hz)在内核取当前用户栈与 PC，聚合为 (栈, 计数)。on-CPU 显示占用 CPU 的栈；off-CPU 记录线程离开 CPU 的栈(调度事件)，揭示锁/IO 等待。

## 三、形式化与数学基础
采样计数近似占用比例：
$$ \hat p_f = \frac{C_f}{\sum C} $$
方差随采样数 $n$ 缩小 $\sim 1/\sqrt{n}$。on/off CPU 时间互补：
$$ T_{wall} \approx T_{on} + T_{off} $$

## 四、代码实现
```bash
# on-CPU 火焰图生成
perf record -F 99 -a -g -- sleep 30
perf script | ./stackcollapse-perf.pl > out.folded
./flamegraph.pl out.folded > cpu.svg
```

## 五、与其他技术对比
采样开销低但欠精确(尤其短函数)；插桩精确但侵入。off-CPU 补充 on-CPU 看不到的等待。二者拼出完整时间线。

## 六、常见误区
低采样率看不出短函数(平滑效应)。只看 on-CPU 忽略 off-CPU 会漏掉锁竞争/IO 瓶颈。

## 七、与开源书/权威来源对应
Brendan Gregg Flame Graphs 论文与工具集；perf 官方文档；CSAPP 5.12 介绍 perf。

## 八、面试题
on 与 off CPU 区别？采样率如何选？为何需要折叠栈？

## 九、演进与趋势
eBPF 让任意事件栈采样(无 perf.data 重)；持续 profiling(Pyroscope)实时火焰图。

## 十、小结
栈采样以低开销还原调用热点，on/off CPU 互补覆盖计算与等待，是性能分析起点。
