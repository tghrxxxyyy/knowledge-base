# IPv6邻居发现协议NDP

> 对应 RFC 4861 (Neighbor Discovery for IPv6)、RFC 4862 (SLAAC)、RFC 4191 (Default Router Preferences)、RFC 6105 (RA Guard) 与 Tanenbaum《Computer Networks》第5章。

## 一、背景与挑战

IPv4 的链路适配依赖一组各自独立的机制：ARP 做地址解析、ICMP 重定向做次优路由纠正、ICMP 路由器发现做网关发现、DHCP 做地址配置。它们分属不同层、不同协议族，行为不一致、扩展困难，且都缺乏统一的安全模型。

IPv6 把这些功能统一收敛到 NDP（Neighbor Discovery Protocol）之中。NDP 不是独立协议，而是 **ICMPv6 上的一组报文类型与处理规则**，因此天然受 IP 层机制约束（可被防火墙过滤、可被 IPsec/SEND 保护），并可用请求节点组播替代链路层广播，把「唤醒全网」的开销降到「唤醒目标」的量级。

需要防范的风险也随之转移：NDP 取代了 ARP，但没有自动获得认证能力。伪造的邻居通告（NA）可劫持单播流量，伪造的路由器通告（RA）可直接改写默认网关——后者比 ARP 欺骗危害更大，因为它一次通告即可影响整个广播域的出网路径。

## 二、核心原理

### 五类报文

| 类型 | 代码 | 方向 | 作用 |
| --- | --- | --- | --- |
| Router Solicitation (RS) | 133 | 主机 → `ff02::2` | 请求路由器立即发送 RA，无需等待周期通告 |
| Router Advertisement (RA) | 134 | 路由器 → `ff02::1` 或单播 | 通告前缀、跳数限制、MTU、路由器寿命与标志 |
| Neighbor Solicitation (NS) | 135 | 单播或请求节点组播 | 地址解析（等价 ARP 请求）、可达性探测、DAD |
| Neighbor Advertisement (NA) | 136 | 单播或 `ff02::1` | 回送链路层地址，纠正他人缓存 |
| Redirect (137) | 137 | 路由器 → 主机 | 告知存在更优的第一跳（类比 ICMP 重定向） |

### 请求节点组播：取代广播的关键

给定目标地址 $A$，其请求节点组播地址由固定前缀与 $A$ 的低 24 位构成：

$$ M(A) = \texttt{ff02::1:ff00:0/104} \ \|\ A_{[104:128]} $$

只有地址低 24 位相同的节点才会加入并监听该组，因此绝大多数情况下**只有目标主机被唤醒**。相比 ARP 的 `ff:ff:ff:ff:ff:ff`，这把地址解析的干扰范围从「全广播域」压缩到「低 24 位碰撞的少数节点」。

代价是组播组成员管理（MLD）需要正确工作；若交换机未启用 MLD Snooping，组播会退化为泛洪，优势消失。

### RA 的标志位与选项

RA 中的关键标志：

- **M（Managed）**：地址请通过 DHCPv6 获取；
- **O（Other）**：其他配置（DNS 等）通过 DHCPv6 获取；
- **A（Autonomous，位于前缀选项）**：该前缀可用于 SLAAC；
- **L（On-link，位于前缀选项）**：该前缀内的地址视为在链路上，可直接解析（RFC 5942 澄清了 L 位的语义边界）。

RA 常见选项包括源链路层地址、MTU、前缀信息、RDNSS/DNSSL（DNS 服务器，RFC 8106）、以及路由信息选项（RFC 4191，用于下发更具体的路由而非仅默认路由）。RA 还携带 `Cur Hop Limit`、`Router Lifetime`、`Reachable Time`、`Retrans Timer` 四个标量，直接驱动下文的 NUD 状态机。

### 邻居不可达检测（NUD）

NDP 为每个邻居维护状态机，IPv6 与 IPv4 使用同一套状态命名：

| 状态 | 含义 | 迁移条件 |
| --- | --- | --- |
| INCOMPLETE | 解析中，已发 NS 未收 NA | 收到 NA → REACHABLE；超时 → 删除 |
| REACHABLE | 确认可达，在 `ReachableTime` 内 | 计时到期或无确认 → STALE |
| STALE | 映射仍可用但未验证 | 有流量 → DELAY |
| DELAY | 等待上层确认（约 5 秒） | 上层给正反馈 → REACHABLE；超时 → PROBE |
| PROBE | 主动发单播 NS 探测 | 收到 NA → REACHABLE；重试耗尽 → 删除 |

关键设计是**上层确认（upper-layer confirmation）**：TCP 收到 ACK、或任何能证明对端在工作的证据，都可以把邻居直接提升回 REACHABLE，从而避免不必要的 NDP 探测。这把三层可达性与四层活跃性结合起来，显著减少了控制报文。

NS/NA 还带两个标志位：**S（Solicited）** 表示该 NA 是对 NS 的直接应答，**O（Override）** 表示应覆盖已有缓存项。二者是判定「正常应答」与「主动纠正」的依据，也是安全策略的抓手。

## 三、形式化与数学基础

请求节点组播的映射是地址到组播组的函数：

$$ M: \left\{ 0, 1 \right\}^{128} \to \left\{ 0, 1 \right\}^{128}, \qquad M(A) = \texttt{ff02::1:ff} \cdot A_{\text{low24}} $$

由于只取低 24 位，$2^{32}$ 个地址会映射到同一个组（固定前缀下）。链路内 $m$ 个节点中，某个 NS 误唤醒其他节点的期望数量为：

$$ E\left[ \text{false wake} \right] \approx \frac{m - 1}{2^{24}} $$

当 $m = 10^{4}$ 时约 $6 \times 10^{-4}$，即几乎不会误唤醒，这是组播替代广播的定量依据。

RA 的周期性通告间隔由 `MaxRtrAdvInterval` 决定，RFC 4861 规定默认在 4 秒到 1800 秒之间，并建议默认值约为 600 秒量级（以官方文档为准）。加上随机抖动以避免同步：

$$ T_{ra} \in \left[ 0.33 \times \text{MaxRtrAdvInterval},\ \text{MaxRtrAdvInterval} \right] $$

路由器寿命 $L_{router}$ 必须满足 $L_{router} \ge 3 \times \text{MaxRtrAdvInterval}$，否则路由器一旦故障，主机可能在寿命未到期前就失去默认路由；同时 $L_{router} = 0$ 被用作「撤销自身为默认路由器」的显式信号。

DAD 的成功条件（与 IPv4 的 ACD 同构）：

$$ \text{usable}(A) \iff \neg \exists\, \text{NA}\left( \text{target} = A \right) \ \text{在} \ \text{RetransTimer} \times \text{DupAddrDetectTransmits} \ \text{内} $$

NUD 的探测退避遵循与 ARP 相同的思路：STALE → DELAY → PROBE 的迁移保证「映射可能过期时不立即打扰网络，等到真的要发包时才验证」，把验证成本与流量需求对齐。

## 四、代码实现

内核侧的关键参数、观察命令与邻居表操作：

```bash
# 接受 RA 与自动配置（SLAAC 前提）
sysctl net.ipv6.conf.eth0.accept_ra=1
sysctl net.ipv6.conf.eth0.autoconf=1

# NUD 相关时间参数（单位与默认值以官方文档为准）
sysctl net.ipv6.neigh.eth0.base_reachable_time_ms
sysctl net.ipv6.neigh.eth0.retrans_time_ms
sysctl net.ipv6.neigh.eth0.gc_stale_time             # 邻居表回收间隔

# 观察邻居与路由器
ip -6 neigh show dev eth0                            # 含 REACHABLE/STALE 等状态
ip -6 route show default                             # 默认路由来自 RA

# 主动请求 RA
rdisc6 -1 eth0
```

用 `ip` 手动管理邻居项，用于验证或强制纠正：

```bash
# 添加静态邻居（nud permanent，不会被 NA 覆盖）
ip -6 neigh replace 2001:db8::2 lladdr 00:11:22:33:44:55 dev eth0 nud permanent
# 删除并重新触发解析
ip -6 neigh del 2001:db8::2 dev eth0
# 观察解析过程（会先出现 INCOMPLETE，收到 NA 后变 REACHABLE）
ip -6 neigh get 2001:db8::2 dev eth0
```

用 scapy 构造 NS 与解析 NA，适合验证报文与字段语义：

```python
from scapy.all import Ether, IPv6, ICMPv6ND_NS, ICMPv6NDOptSrcLLAddr, srp1

target = "2001:db8::2"
# 请求节点组播地址 = ff02::1:ff + 目标地址低 24 位
last24 = target.split(":")[-1].zfill(4)
snm = "ff02::1:ff%s" % last24[-3:]

pkt = Ether(dst="33:33:ff:%s:%s:%s" % (last24[-2:], last24[0:2], last24[2:4])) / \
      IPv6(dst=snm) / \
      ICMPv6ND_NS(tgt=target) / \
      ICMPv6NDOptSrcLLAddr(lladdr="00:11:22:33:44:55")

resp = srp1(pkt, iface="eth0", timeout=2)
if resp is not None:
    print("NA flags S=%d O=%d" % (resp.S, resp.O))
    for opt in resp.iterpayloads():
        print(repr(opt))     # 其中应含 Target Link-Layer Address 选项
```

DAD 的抓包验证：

```bash
# NS 的源地址应为 ::，表示这是地址冲突检测而非普通解析
tcpdump -i eth0 -nn 'icmp6 and ip6[40] == 135' -vv
```

## 五、与其他技术对比

| 维度 | IPv4 ARP | IPv6 NDP | DHCPv6 | SEND (RFC 3971) | RA Guard (RFC 6105) |
| --- | --- | --- | --- | --- | --- |
| 承载层 | 链路层 0x0806 | ICMPv6 (IP 之上) | UDP 547/546 | ICMPv6 + 签名 | 交换机 L2 |
| 查询方式 | 链路层广播 | 请求节点组播 | 组播/单播 | 组播 | 过滤 |
| 地址解析 | 有 | 有（NS/NA） | 无 | 有（可验证） | 无 |
| 路由器发现 | 无（依赖 ICMP + DHCP） | 有（RS/RA） | 无 | 有 | 有（过滤 RA） |
| 冲突检测 | ARP Probe (RFC 5227) | DAD (NS 源地址为 ::) | 服务器保证 | DAD + 签名 | 无 |
| 认证能力 | 无 | 可选（需 SEND） | 无（可配合 IPsec/证书） | 密码学签名 + CGA | 无（仅过滤） |
| 可被防火墙管理 | 否 | 是（ICMPv6 规则） | 是 | 是 | 是（设备侧） |
| 主要部署代价 | 无 | 需放行 ICMPv6、交换机支持 MLD Snooping | 需服务器 | PKI 与终端支持 | 需设备能力 |

一个实践要点：**ICMPv6 不可被简单封禁**。NDP、PMTU 发现、错误报告都依赖 ICMPv6，粗暴丢弃会导致「能连通但性能极差」或「间歇性不可达」的疑难问题。安全策略应精细放行必需的 ICMPv6 类型，而非整体阻断。

## 六、常见误区

- **认为 IPv6 不需要 ARP 防护，从而忽略 NDP 欺骗。** 伪造 NA 可劫持单播流量，伪造 RA 可直接改写默认网关，危害不亚于 ARP 欺骗。
- **认为禁用 RA 接受就安全。** 恶意 NA 仍可误导已有邻居项的缓存，且关闭 RA 会切断合法的地址与路由配置。
- **整体封禁所有 ICMPv6。** 会破坏 NDP、DAD 与 PMTU 发现，是 IPv6 环境最常见的自伤式配置。
- **忽略 MLD Snooping。** 交换机未启用时，请求节点组播会被泛洪成广播，「组播替代广播」的优势完全消失。
- **把 RA 的 L 位当作「所有该前缀地址都可达」。** RFC 5942 明确澄清：仅当前缀被显式通告为 on-link 时才可直接解析，路由器不应为转发路径上的前缀设置 L 位。
- **忽略 `Router Lifetime` 的一致性。** 设置过小会导致默认路由频繁失效，过大则在路由器下线后长期残留黑洞路由。
- **认为 DAD 是强一致保证。** 它只检测探测时刻的冲突，并发探测或丢包会导致漏检。

## 七、与开源书·权威来源对应

- RFC 4861《Neighbor Discovery for IP version 6 (IPv6)》：五类报文、RA 标志与选项、NUD 状态机与请求节点组播的规范定义。
- RFC 4862《IPv6 Stateless Address Autoconfiguration》：SLAAC 与 DAD，是 NDP 最直接的上层使用者。
- RFC 4191《Default Router Preferences and More-Specific Routes》：路由信息选项与更具体的路由下发，扩展了 NDP 的路由能力。
- RFC 5942《IPv6 Subnet Model》：澄清 on-link（L 位）语义与子网模型的常见误解。
- RFC 8106（原 RFC 6106）：RDNSS/DNSSL 选项，使纯 NDP 组网可下发 DNS。
- RFC 6105《IPv6 Router Advertisement Guard》：RA Guard 的规范，接入侧防护依据。
- RFC 3971《SEcure Neighbor Discovery (SEND)》：CGA 与签名机制，NDP 的密码学防护方案。
- Tanenbaum《Computer Networks》第5章：IPv4 与 IPv6 地址解析机制的对比。
- Linux `net/ipv6/ndisc.c`、`addrconf.c`：NDP 报文处理与邻居状态机的真实实现。

## 八、面试题

1. **NDP 如何取代 ARP？**
   要点：用 ICMPv6 的 NS/NA 完成地址解析，查询走请求节点组播而非链路层广播，并附带路由器发现、前缀通告、重定向与 DAD，功能集合比 ARP 大得多。

2. **请求节点组播地址是怎么构造的？**
   要点：`ff02::1:ff00:0/104` 前缀拼接目标地址的低 24 位。只有低 24 位相同的节点才加入该组，因此几乎只有目标被唤醒。

3. **NA 的 S 与 O 标志分别是什么含义？**
   要点：S（Solicited）表示该 NA 是对 NS 的直接应答；O（Override）表示接收方应覆盖已有缓存项。二者用于区分正常应答与主动纠正，也是安全策略的判据。

4. **NUD 的 DELAY 状态解决什么问题？**
   要点：避免在映射可能过期时立即发送探测。DELAY 期内等待上层确认（如 TCP ACK），若上层能给正反馈则直接回到 REACHABLE，省掉一轮 NDP 探测。

5. **为什么不能简单封禁 ICMPv6？**
   要点：NDP、DAD、PMTU 发现与错误报告都依赖 ICMPv6。整体封禁会导致地址解析失败、连接建立慢、大包黑洞等疑难问题，必须按类型精细放行。

## 九、演进与趋势

IPv6 的普及使 NDP 的规模问题浮出水面：无线与数据中心链路中 IPv6 邻居表可达数万条，NDP 探测与组播开销需要专门优化。内核侧的演进包括邻居表容量的自动扩展、GC 阈值调优，以及把组播加入/离开交给 MLD Snooping 与 IGMP/MLD Proxy 协同处理。

安全侧的 SEND（RFC 3971）虽然提供了密码学保证，但依赖 CGA 与 PKI、部署复杂且终端支持有限，实际落地更多依靠接入侧的 RA Guard（RFC 6105）、NDP 监控（交换机侧学习合法映射并限速）、以及私有 VLAN/EVPN 缩小信任边界。这延续了 ARP 防护的同一逻辑：**协议层认证难落地时，用「缩小可达范围 + 设备侧验证自洽性」替代。**

在云与容器网络中，NDP 与 ARP 由同一套邻居缓存与控制器下发机制统一管理；NFV/智能网卡开始把邻居缓存与转发卸载到硬件，主机侧只保留控制面。与此同时，IPv6-only 网络（如 5G 承载与部分云 VPC）把 NDP + RDNSS 作为基础配置面，进一步减少了 DHCPv6 的依赖。

## 十、小结

NDP 用五类 ICMPv6 报文统一了 IPv6 的地址解析、路由器发现、前缀通告、重定向与冲突检测，借助请求节点组播把查询的影响范围从整个广播域压缩到极少数节点，并用 NUD 状态机与上层确认机制平衡可达性验证的开销与准确性。

需要牢记三个工程要点：ICMPv6 必须精细放行而非整体封禁；交换机需启用 MLD Snooping 才能兑现组播的优势；SEND 之外，实际防护主要靠 RA Guard、NDP 监控与网络架构隔离。理解这三点，才能既让 IPv6 即插即用，又不把信任边界无限放大。
