# perf与eBPF栈采集

> 对应 《CSAPP》第5章 / Brendan Gregg bcc/eBPF 工具集。

## 一、背景与挑战
传统 perf 依赖内核 perf_event 与符号；eBPF 无需重新编译内核即可在内核任意探针挂载，采集任意事件栈，开销更低、粒度更细。

## 二、核心原理
perf 用硬件 PMU 或定时中断 + DWARF/FP 展开栈。eBPF 程序挂接 kprobe/uprobe/tracepoint，在内核上下文安全运行，把栈与计数写入映射(map)供用户态读取。

## 三、形式化与数学基础
eBPF 验证器保证终止与内存安全，程序受限为：
$$ \text{指令数} < 4096,\ \text{无环},\ \text{边界检查} $$
采样开销近似 $O(n_{probe} \times stack\_depth)$。

## 四、代码实现
```bash
# eBPF 统计块 IO 的 off-CPU 栈
sudo /usr/share/bcc/tools/offcputime -df -p $(pidof mysqld) 10 > out.folded
./flamegraph.pl --colors=io out.folded > offcpu.svg
```

## 五、与其他技术对比
perf 通用稳定但灵活度低；eBPF 可编程、覆盖广但需较新内核。与 ftrace 相比 eBPF 更动态安全。

## 六、常见误区
旧内核无 eBPF 能力。栈展开需帧指针(-fno-omit-frame-pointer)或 DWARF，否则栈截断。

## 七、与开源书/权威来源对应
Brendan Gregg《BPF Performance Tools》；CSAPP perf 介绍；bcc 仓库示例。

## 八、面试题
eBPF 为何安全？与 perf 区别？栈截断原因？

## 九、演进与趋势
CO-RE(一次编译处处运行)、libbpf、BTF 类型信息；持续 eBPF profiling。

## 十、小结
perf 与 eBPF 是栈采集双柱，后者以安全可编程特性成为现代可观测性核心。
