# MPLS标签栈与LSP

> 对应 RFC 3031 (MPLS Architecture) 与 RFC 3032 (Label)。

## 一、背景与挑战
早期 IP 转发依赖逐跳最长前缀匹配，难以实现流量工程与快速交换。MPLS 在二三层之间插入短标签，以交换标签替代查路由，支持 TE、VPN 与快速重路由。

## 二、核心原理
MPLS 在数据链路头与 IP 头间压入标签栈，每台 LSR 根据顶层标签查 LFIB 做 swap/push/pop。从入口 LER 到出口 LER 的路径称为 LSP（标签交换路径）。标签栈支持多层，可实现层级 VPN 与流量工程隧道。

## 三、形式化与数学基础
标签结构 32 位：
$$ (Label[20bit], \ TC[3bit],\ S[1bit],\ TTL[8bit]) $$
S 位标识栈底。LFIB 动作：
$$ (in\_label, in\_if) \to (out\_label, out\_if, op) $$
其中 $op \in \{swap, push, pop\}$。标签空间：
$$ N_{label} = 2^{20} $$

## 四、代码实现
Linux 配置 MPLS（需 mpls_router）：
```bash
modprobe mpls_router
sysctl -w net.mpls.conf.eth0.input=1
ip -f mpls route add 100 via inet 192.0.2.2 dev eth1
ip -f mpls rule add from 100 lookup 100
```
查看标签转发表：
```bash
ip -f mpls route show
```

## 五、与其他技术对比
MPLS 标签交换比 IP LPM 快且支持 TE，但需信令（LDP/RSVP-TE）；SR（Segment Routing）用源路由标签栈简化。与 VXLAN 不同，MPLS 是运营商核心理念。

## 六、常见误区
误区一是 MPLS 只能跑在 ATM/帧中继，现代以太也广泛支持。误区二是标签等于加密，标签仅转发、不保密。

## 七、与开源书/权威来源对应
RFC 3031 体系结构；RFC 3032 标签编码；Tanenbaum 第5章介绍 MPLS；运营商网络教材。

## 八、面试题
问：MPLS 为什么能支持流量工程？答：LSP 可显式指定路径（RSVP-TE/SR），绕过 IGP 最短路径，实现带宽预留与可控转发。

## 九、演进与趋势
Segment Routing（RFC 8402）以 MPLS 或 IPv6 段标识替代复杂信令，成为新趋势；MPLS 在 5G 传输与 VPN 仍核心。

## 十、小结
MPLS 以短标签与 LFIB 交换实现快速转发与流量工程，LSP 与标签栈支撑 VPN 与 TE，仍是运营商网络关键。
