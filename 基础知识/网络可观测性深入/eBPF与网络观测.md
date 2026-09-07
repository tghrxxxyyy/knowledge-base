# eBPF与网络观测

> 对应 eBPF 官方文档（ebpf.io）与 Brendan Gregg 性能方法论；参考 torvalds/linux（bpf 子系统）。

## 一、背景与挑战
传统观测需改代码或插桩，开销大。eBPF 允许在内核安全执行沙箱程序，无需改内核即可采集网络事件。

## 二、核心原理
eBPF 程序 attach 到 kprobe/tracepoint/XDP/TC 等钩子，采集数据包、套接字、延迟，经 perf buffer / BPF map 传用户态。

## 三、形式化与数学基础
观测点集合：
  Hooks = { kprobe, tracepoint, XDP, TC, sock_ops }
数据通道：
  kernel_BPF -> BPF_MAP / perf_event -> user_agent
开销近似：
  overhead ~ O(events) * cost_per_hook  (远低于全量抓包)

## 四、代码实现
// 简化：统计 TCP 重传（伪 eBPF C）
SEC("tracepoint/tcp/tcp_retransmit_skb")
int on_retrans(struct trace_event_raw_tcp_event_sk *ctx) {
    bpf_map_inc(&retrans_cnt, 0);  // 原子计数
    return 0;
}
// 用户态读取 map 展示

## 五、与其他技术对比
相比 tcpdump 全量抓包，eBPF 可按条件聚合，开销低、无侵入。

## 六、常见误区
1. 认为 eBPF 万能——仍受内核版本与钩子可用性限制。
2. BPF map 无界增长导致内存泄漏。

## 七、与开源书/权威来源对应
- ebpf.io 官方文档
- Brendan Gregg《BPF Performance Tools》
- torvalds/linux bpf 子系统

## 八、面试题
eBPF 是什么？如何无侵入观测网络？与 tcpdump 区别？

## 九、演进与趋势
Cilium/Hubble 用 eBPF 实现可观测+网络策略一体化。

## 十、小结
eBPF 是现代网络可观测的颠覆性技术，内核级、低开销、可编程。
