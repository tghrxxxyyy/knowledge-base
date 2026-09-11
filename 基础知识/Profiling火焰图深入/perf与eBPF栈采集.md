# perf与eBPF栈采集

> 对应 Brendan Gregg《BPF Performance Tools》与 bcc/libbpf 工具集，以及《Computer Systems: A Programmer's Perspective》（CSAPP）第 5 章关于性能剖析的介绍。

## 一、背景与挑战
要回答「CPU 花在哪儿」，最直接的证据是调用栈。采集调用栈有两条主流技术路线。

- perf：Linux 内核自带的性能分析工具，依托 perf_event 子系统，可用硬件 PMU 或软件定时中断采样，通用、稳定、随内核一起演进。
- eBPF：允许把用户编写的程序安全地挂到内核的探针（kprobe/uprobe/tracepoint 等）上运行，无需重编内核即可采集任意事件，粒度更细、开销更低。

两者并非互斥，而是互补：perf 适合通用采样与快速上手，eBPF 适合定制化、跨内核版本的深度可观测性。理解它们的原理与边界，是做好 profiling 的基础。

## 二、核心原理
perf 的基本工作方式：

- 通过 perf_event_open 系统调用创建事件，可由硬件 PMU（如 CPU 周期、指令数）或软件定时器驱动。
- 事件触发时，内核记录当前指令指针（PC）与用户/内核栈。
- 栈展开依赖帧指针、DWARF 或 ORC 信息；展开结果聚合成「栈 + 计数」。
- perf script 输出文本栈，交给 stackcollapse-perf.pl 折叠后即可画火焰图。

eBPF 的基本工作方式：

- 用户态程序编译为 BPF 字节码，加载前经内核验证器检查（终止性、内存安全、边界检查）。
- 程序挂接到事件源：kprobe（内核函数）、uprobe（用户函数）、tracepoint（内核静态探针）、perf 事件等。
- 触发时在内核上下文执行，把栈 ID 与计数写入 BPF map。
- 用户态程序周期读取 map，做符号化与折叠。

eBPF 的核心优势是「可编程 + 安全」：既能表达复杂的过滤与聚合逻辑，又因验证器保证不会崩溃或死循环，可以放心地跑在生产环境。

## 三、形式化与数学基础
eBPF 验证器的约束可概括为：程序必须可证明地终止、不越界访问内存、不产生不可达循环。历史上对指令数有硬上限（曾为 4096 条），现代内核已显著放宽，具体上限以内核文档为准：

$$ \#instr \le L_{max},\qquad \text{no cycles},\qquad \text{bounds checked} $$

栈采集的开销近似与探针触发次数和栈深度成正比：

$$ cost \approx O(n_{probe} \times depth_{stack}) $$

因此「挂太多探针」或「采集过深栈」都会放大开销，需要按需裁剪。采样的统计性质：设采样频率为 $f$、总观测时长为 $T$，则总样本数：

$$ n \approx f \cdot T $$

对占比为 $p$ 的热点，其计数服从二项分布，估值的相对标准差约为：

$$ \sigma_{rel} \approx \sqrt{\frac{1-p}{n \cdot p}} $$

这解释了「采样频率不能太低」：样本越少，区分相近热点的能力越弱。栈截断则会让深层调用被错误归因到浅层，破坏归因的正确性。

## 四、代码实现
用 perf 做 on-CPU 采样并生成火焰图。

```bash
# 采集 30 秒、99Hz 的调用栈
sudo perf record -F 99 -a -g -- sleep 30

# 展开并折叠，再画图
sudo perf script | ./stackcollapse-perf.pl > out.folded
./flamegraph.pl out.folded > oncpu.svg
```

用 eBPF（bcc 工具）采集 off-CPU 栈。

```bash
# 统计 mysqld 线程离开 CPU 的栈与阻塞时长
sudo /usr/share/bcc/tools/offcputime -df -p "$(pidof mysqld)" 10 > offcpu.folded
./flamegraph.pl --colors=io offcpu.folded > offcpu.svg
```

用 bpftrace 自定义探针，观察某个内核函数的调用栈。

```bash
# 统计 execve 的调用栈分布
sudo bpftrace -e '
kprobe:do_execve {
    @[kstack] = count();
}'
```

libbpf/CO-RE 的典型用法是「一次编译、处处运行」：利用 BTF 类型信息让 BPF 程序适配不同内核版本，避免为每个内核重新编译。

## 五、与其他技术对比

| 维度 | perf | eBPF | ftrace |
| --- | --- | --- | --- |
| 可编程性 | 低，靠参数与事件 | 高，可写程序 | 中，靠 tracefs 配置 |
| 内核版本要求 | 低，随内核内置 | 较新内核（具体版本以文档为准） | 低 |
| 开销控制 | 中 | 低到中，可精细过滤 | 中 |
| 采集对象 | PMU、软件事件 | kprobe/uprobe/tracepoint 等 | 函数追踪、事件 |
| 生态 | perf 与火焰图脚本 | bcc、bpftrace、libbpf、CO-RE | trace-cmd、perf 前端 |

实践上常组合使用：perf 做粗粒度采样定位热点，eBPF 做细粒度归因与定制统计。

## 六、常见误区
- 旧内核无 eBPF 能力：并非所有内核都支持完整 eBPF 特性，部署前需确认版本与内核配置。
- 栈展开信息缺失：未保留帧指针（-fno-omit-frame-pointer）且无 DWARF/ORC 时，栈会截断，火焰图只剩一层。
- 挂载过多探针：高频探针会显著增加开销，应缩小过滤条件与采集范围。
- 忽略符号化：容器或 strip 后的二进制缺少符号，采集结果难以阅读。
- 把采样当精确计数：低采样率下的短函数会被系统性低估。
- 采集范围过宽：对整机所有进程 -a 采样，噪音会淹没目标进程信号。

## 七、与开源书·权威来源对应
- Brendan Gregg《BPF Performance Tools》系统介绍了 eBPF 可观测性工具与方法论。
- bcc 与 bpftrace 官方仓库提供大量可直接使用的工具与示例。
- 《CSAPP》第 5 章介绍了性能优化与剖析的基本方法，perf 是其中常用工具。
- Linux 内核文档（perf_event、BPF 验证器、BTF/CO-RE）是第一手权威来源。

## 八、面试题
1. eBPF 为什么是安全的？验证器检查哪些性质？
2. eBPF 与 perf 的定位差异是什么？何时用哪个？
3. 栈截断的原因有哪些？如何避免？
4. 采样开销与哪些因素成正比？如何控制？
5. CO-RE 解决了什么问题？为什么它对多内核环境重要？

## 九、演进与趋势
- CO-RE（Compile Once – Run Everywhere）配合 BTF，让 BPF 程序跨内核版本可移植。
- libbpf 成为事实上的标准加载库，逐步替代早期的 bcc 全量编译方式。
- 持续（continuous）eBPF profiling 成为常态，取代一次性排障式采样。

## 十、小结
perf 与 eBPF 是栈采集的双柱：perf 通用稳定、随内核内置，适合快速采样；eBPF 可编程、覆盖广、开销低，适合定制化深度归因。两者都以「采样 + 栈展开 + 聚合」为核心，也都依赖符号化与正确的栈展开信息。掌握它们的边界与组合方式，是现代性能分析的入门课。
