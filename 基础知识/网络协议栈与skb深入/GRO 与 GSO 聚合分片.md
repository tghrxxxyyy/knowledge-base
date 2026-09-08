# GRO 与 GSO 聚合分片

> 对应 Linux 内核 GRO/GSO 文档与 xiaolincoder/hello-http 关于协议栈卸载的说明。

## 一、背景与挑战
高速网络下，海量小包会使 CPU 在协议栈处理上成为瓶颈。GRO（Generic Receive Offload）与 GSO（Generic Segmentation Offload）分别在接收与发送侧把多个小段聚合/拆分，减少逐包处理次数，把分片/重组交给更优位置。

## 二、核心原理
GRO 在接收软中断中把属于同一流、连续的多个小包合并为一个大 skb（仅在安全时，如 TCP 无乱序），从而减少上层处理次数。GSO 在发送侧允许上层提交大段，由网卡或协议栈在临近发送时才真正分片（TSO/UFO），避免过早切小包。

## 三、形式化与数学基础
设每包处理固定成本 c，N 个小包成本为 N·c；GRO 合并为 M 个大包（M << N），成本降至 M·c，节省比约 N/M。GSO 把分片成本从「每 socket 写」推迟到「每网卡发送」，并可由硬件 TSO 零拷贝完成。

## 四、代码实现
```bash
ethtool -K eth0 gro on gso on tso on
# 内核侧：net/ipv4/tcp_offload.c 实现 TCP GRO 合并
```
```c
skb = skb_gro_receive(skb_head, skb);  /* 尝试合并 */
```

## 五、与其他技术对比
LRO（Large Receive Offload）是早期硬件卸载但不够通用、可能破坏头部；GRO 是软件通用版更稳健。TSO 是 GSO 在 TCP 上的硬件实现；UFO 对应 UDP。

## 六、常见误区
误区一：GRO 会乱序合并——仅当包有序且不跨越语义边界才合并。误区二：开启一定更快——某些抓包/调试场景需关闭以获得真实小包。误区三：GSO 改变语义——仅拆分位置后移，报文内容不变。

## 七、与开源书/权威来源对应
内核 Documentation/networking/segmentation-offloads.rst；xiaolincoder/hello-http 解释 GRO/GSO；Kurose & Ross 讨论分段与 MTU。

## 八、面试题
GRO 与 LRO 区别？GSO 为何提升吞吐？TSO 是什么？什么场景要关 GRO？

## 九、演进与趋势
GRO 支持更多协议（含 IPv6、UDP）；连同 RSS（接收侧缩放）把流分散到多 CPU，与 GRO 协同提升多队列网卡效率。

## 十、小结
GRO/GSO 通过在协议栈合适位置做聚合与延迟分片，显著降低逐包处理开销，是高速网卡吞吐优化的关键卸载技术。
