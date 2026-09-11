# GRO 与 GSO 聚合分片

> 对应 Linux 内核 GRO/GSO 文档（Documentation/networking/segmentation-offloads.rst）、xiaolincoder/hello-http 协议栈卸载说明，及 Kurose & Ross 分段与 MTU。

## 一、背景与挑战

高速网络（10G/40G/100G）下，海量小包会使 CPU 在协议栈逐包处理上成为瓶颈——每个包都要走一遍中断、协议解析、上下文切换。

GRO（Generic Receive Offload）与 GSO（Generic Segmentation Offload）分别在**接收**与**发送**侧把「多个小段 / 大段」在协议栈的合适位置聚合或拆分。

目标是减少逐包处理次数，把分片 / 重组成本交给更优的位置（软件或网卡硬件）。

挑战在于：聚合不能破坏语义、不能跨乱序边界、且某些调试场景需看到真实小包。

## 二、核心原理

- **GRO（接收聚合）**：在接收软中断中，把属于同一流、连续且有序的多个小包合并为一个大 skb（如多个 TCP 段合成一个），从而减少上层协议处理次数。仅在安全时合并：无乱序、无推送标志、同一连接。
- **GSO（发送延迟分片）**：发送侧允许上层提交大段（超过 MTU），由协议栈或网卡在「临近发送时」才真正分片，避免过早把大块切成小包在协议栈里反复处理。
- **硬件卸载**：TSO（TCP Segmentation Offload）是 GSO 在 TCP 上的硬件实现，由网卡完成实际分段；UFO 对应 UDP；LRO 是早期硬件接收卸载（不够通用）。
- **RSS 协同**：GRO 在每个接收队列内聚合，而 RSS 负责把不同流分散到不同队列，二者结合既保证并行度又降低单流处理次数。

本质思想：**把「分片 / 重组」这件事尽可能推迟或下推到最有效的地方**。

## 三、形式化与数学基础

设每包协议栈处理固定成本 $c$，N 个小包成本为 $N \cdot c$。GRO 合并为 M 个大包（$M \ll N$），成本降至：

$$
Cost_{GRO} = M \cdot c, \quad \text{节省比} \approx \frac{N}{M}
$$

GSO 把分片成本从「每 socket 写」推迟到「每网卡发送」，并可由硬件 TSO 零拷贝完成，减少 CPU 介入。

对分段数 k，硬件卸载后软件成本从 $k \cdot c$ 降为约 $c$（硬件一次完成 k 段）：

$$
Cost_{GSO+TSO} \approx c \ll k \cdot c
$$

前提是报文内容不变，仅「拆分位置」后移，故不改变语义。

## 四、代码实现

```bash
# 开关卸载特性（命令以 ethtool 文档为准）
ethtool -K eth0 gro on gso on tso on

# 内核侧：net/ipv4/tcp_offload.c 实现 TCP GRO 合并
```

```c
/* GRO 尝试把新 skb 合并进已聚合的 skb_head */
struct sk_buff *skb_gro_receive(struct sk_buff *skb_head,
                                struct sk_buff *skb)
{
    /* 校验同流、有序、无 PUSH 等条件后合并 */
    /* 合并成功则 skb 被挂入 frag_list，仅一次协议处理 */
    return skb_head;
}
```

## 五、与其他技术对比

- **LRO（Large Receive Offload）**：早期硬件卸载，可能改写头、不够通用、对转发场景不友好；GRO 是软件通用版更稳健。
- **TSO / UFO**：GSO 在 TCP / UDP 上的硬件实现，实际分段由网卡完成。
- **无卸载**：逐包处理，CPU 占用高，吞吐受限。
- **GSO vs GRO**：一个在发送侧延迟分片，一个在接收侧提前聚合，对称优化。

## 六、常见误区

- **误区一：GRO 乱序合并**——仅当包有序且不跨越语义边界（如 PUSH）才合并。
- **误区二：开启一定更快**——抓包 / 调试、或某些低延迟小包场景需关闭以看真实包。
- **误区三：GSO 改变语义**——仅拆分位置后移，报文内容不变。
- **误区四：GRO 与 LRO 等价**——GRO 更通用、对转发更友好。

## 七、与开源书·权威来源对应

- Linux 内核 `Documentation/networking/segmentation-offloads.rst`。
- `net/ipv4/tcp_offload.c`、`net/core/dev.c` 的 GRO 实现。
- xiaolincoder/hello-http 解释 GRO/GSO 与协议栈卸载。
- Kurose & Ross《Computer Networking》分段与 MTU 讨论。

## 八、面试题

- GRO 与 LRO 区别？为何 GRO 更通用？
- GSO 为何能提升吞吐？TSO 是什么？
- 什么场景要关闭 GRO？
- GRO/GSO 是否改变报文语义？

## 九、演进与趋势

GRO 支持更多协议（含 IPv6、UDP）；与 **RSS（接收侧缩放）** 协同把流分散到多 CPU，使多队列网卡效率最大化。

更智能的聚合策略（考虑延迟敏感流）也在演进。具体能力以内核版本为准。

在运维侧，GRO/GSO 的开关应是「可观测、可回退」的：上线前用 `ethtool -k` 记录基线，压测对比开启 / 关闭下的 PPS 与 CPU 占用，确认收益后再固化配置。

若出现延迟尾分布恶化，优先检查是否聚合了本应即时处理的短交互流，必要时按流类型或端口做差异化卸载。

## 十、小结

GRO/GSO 通过在协议栈合适位置做「接收聚合 / 发送延迟分片」，显著降低逐包处理开销，是高速网卡吞吐优化的关键卸载技术。

它与 RSS、TSO 协同构成现代网络栈性能基石。把卸载特性纳入容量规划，方能真正转化为吞吐红利，而非盲目开启带来的隐性延迟问题。
