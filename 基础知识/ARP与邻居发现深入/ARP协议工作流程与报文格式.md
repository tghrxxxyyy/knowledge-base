# ARP协议工作流程与报文格式

> 对应 RFC 826 (ARP)、RFC 903 (RARP)、Tanenbaum《Computer Networks》第5章与 Stevens《TCP/IP Illustrated》Vol.1 第4章。

## 一、背景与挑战

IP 层用逻辑地址标识主机，链路层用物理地址（以太网 MAC）标识网卡，二者之间没有固定映射关系：MAC 由厂商烧写且与网络拓扑无关，IP 由管理员或 DHCP 按拓扑分配且可随时变更。要在以太网上投递一个 IP 包，必须先把下一跳 IP 解析为该链路上的 MAC，再封装成以太网帧。

这一解析不能用「地址算术」完成——IPv4 地址的前缀只表达子网归属，不表达硬件编号。因此需要一个动态查询协议。ARP（Address Resolution Protocol）以「广播询问、单播应答」的方式完成映射，并把结果缓存起来以避免每次发包都广播。它简单到只有 28 字节，却是局域网通信的前置步骤，也是同网段攻击的主要着力点。

## 二、核心原理

### 交互流程

1. 主机 A 要发往同网段主机 B（IP 为 $IP_B$），先查本地 ARP 缓存（Linux 中即邻居表）。命中则直接用缓存 MAC 封装发送。
2. 未命中则构造 ARP 请求：`OPER = 1`，`SHA = MAC_A`，`SPA = IP_A`，`THA = 00:00:00:00:00:00`，`TPA = IP_B`，目的 MAC 填广播地址 `ff:ff:ff:ff:ff:ff`，以太网类型填 `0x0806`。
3. 同广播域所有主机都收到该帧，只有配置了 $IP_B$ 的主机（以及做代理 ARP 的路由器）响应：单播回送 `OPER = 2` 的应答，填入自己的 MAC。
4. A 收到应答后把 $(IP_B, MAC_B)$ 写入缓存并设置可达定时器，随后发送排队中的数据。

**请求是广播、应答是单播**这一非对称设计很关键：它把广播成本限制在「解析一次」而非「每包一次」，也是 ARP 缓存存在的意义。

### 报文格式

ARP 报文固定含 9 个字段，共 28 字节（不含以太网帧头与填充）：

| 字段 | 长度 | 以太网/IPv4 取值 | 含义 |
| --- | --- | --- | --- |
| HTYPE | 2 | 1 | 硬件类型（1 = 以太网） |
| PTYPE | 2 | 0x0800 | 上层协议类型（IPv4） |
| HLEN | 1 | 6 | 硬件地址长度 |
| PLEN | 1 | 4 | 协议地址长度 |
| OPER | 2 | 1 / 2 | 请求 / 应答 |
| SHA | 6 | 发送方 MAC | Sender Hardware Address |
| SPA | 4 | 发送方 IP | Sender Protocol Address |
| THA | 6 | 目标 MAC | Target Hardware Address |
| TPA | 4 | 目标 IP | Target Protocol Address |

HTYPE/PTYPE/HLEN/PLEN 这四个「自描述」字段使 ARP 能适配任意链路层与任意网络层协议（如 FDDI 的 HLEN=6、Chaosnet 的 PLEN=2），也是它能从 RFC 826 沿用至今的原因之一。OPER 还有 3 和 4 用于 RARP（反向解析，见 RFC 903）。

以太网最小帧为 60 字节（不含 FCS），28 + 14 = 42 字节，因此 ARP 帧需要填充 18 字节零。抓包时看到的「全零尾部」即填充，不属于 ARP 报文本身。

## 三、形式化与数学基础

ARP 缓存项可建模为四元组及其生存时间：

$$ e = \left( IP,\ MAC,\ \text{dev},\ \text{state} \right), \qquad \text{valid until } t_0 + T_{arp} $$

解析过程是一个部分函数，缓存在其中起记忆化（memoization）作用：

$$ resolve: IP \to MAC, \qquad resolve(ip) = \begin{cases} cache(ip), & ip \in cache \\ \text{broadcast}(ip), & \text{otherwise} \end{cases} $$

广播域大小对 ARP 开销的影响可以量化。设广播域内有 $n$ 台主机、平均每台每秒发起 $r$ 次**未命中**解析，则全网 ARP 请求速率与开销为：

$$ \lambda_{arp} = n \cdot r, \qquad C_{arp} = \lambda_{arp} \cdot \left( L_{eth} + L_{arp} \right) $$

在 $n$ 很大（扁平二层网络）时，即使 $r$ 很小，$C_{arp}$ 也会显著；这正是数据中心倾向用 ARP 抑制/代理降低广播的理由。

缓存命中率对平均解析延迟的影响是决定性的。设命中率 $h$、未命中时解析耗时 $T_{miss}$（含排队与重试），则平均封装延迟为：

$$ \bar{T} = h \cdot 0 + (1-h) \cdot T_{miss} $$

当拓扑变动导致缓存大规模失效时 $h \to 0$，延迟出现阶跃，表现为「突然卡顿一下」的典型症状。

## 四、代码实现

Linux 邻居子系统的入口在 `arp_process()`（`net/ipv4/arp.c`），核心判定逻辑示意如下：

```c
/* 简化示意：net/ipv4/arp.c */
static int arp_process(struct net *net, struct sock *sk, struct sk_buff *skb)
{
    struct arphdr *arp = arp_hdr(skb);
    u8 *arp_ptr = (u8 *)(arp + 1);
    __be32 sip, tip;
    unsigned char *sha;

    /* 校验 HTYPE/PTYPE/HLEN/PLEN 是否为以太网 + IPv4 */
    if (arp->ar_hrd != htons(ARPHRD_ETHER) ||
        arp->ar_pro != htons(ETH_P_IP) ||
        arp->ar_hln != ETH_ALEN || arp->ar_pln != 4)
        goto out;

    arp_ptr += dev->addr_len;
    memcpy(&sip, arp_ptr, 4);            /* SPA */
    arp_ptr += 4 + dev->addr_len;
    memcpy(&tip, arp_ptr, 4);            /* TPA */
    sha = (u8 *)(arp + 1) + arp->ar_hln; /* SHA 起始位置 */

    /* 学习：只要 SPA 合法，就先更新/创建邻居项（这就是欺骗的入口） */
    neigh_update(n, sha, sip, NUD_REACHABLE, ...);

    /* 若 TPA 是本机地址，回送应答 */
    if (inet_addr_type(net, tip) == RTN_LOCAL && arp->ar_op == htons(ARPOP_REQUEST))
        arp_send(ARPOP_REPLY, ETH_P_ARP, sip, dev, tip, sha, dev->dev_addr, sha);
    ...
}
```

内核参数决定「谁来应答」，在虚拟化与多网卡场景中必须理解：

```bash
# arp_ignore：0 任何接口都答；1 仅当目标 IP 配在入接口上才答；2 再加同子网限制
sysctl net.ipv4.conf.all.arp_ignore
# arp_announce：控制 ARP 请求中源 IP 的选取（0 任意；1 优先目标子网；2 只用目标子网地址）
sysctl net.ipv4.conf.all.arp_announce
# arp_filter：入接口与路由出接口不一致时不回应答（多网卡同子网必需）
sysctl net.ipv4.conf.all.arp_filter
```

用户侧操作与抓包：

```bash
ip neigh show                                   # 查看缓存
ip neigh flush dev eth0                         # 清空缓存，便于复现解析过程
arping -I eth0 -c 3 192.168.1.1                 # 主动发起 ARP 解析

# 抓包观察请求（广播）与应答（单播）的非对称性
tcpdump -i eth0 -nn -e 'arp' -vv
# 典型输出：Request who-has 192.168.1.1 tell 192.168.1.10
#           Reply 192.168.1.1 is-at aa:bb:cc:dd:ee:ff
```

用 scapy 构造与解剖报文，适合验证字段语义：

```python
from scapy.all import ARP, Ether, srp

req = Ether(dst="ff:ff:ff:ff:ff:ff") / ARP(op=1, pdst="192.168.1.1", hwdst="00:00:00:00:00:00")
ans, _ = srp(req, iface="eth0", timeout=2)
for _, r in ans:
    print(r[ARP].psrc, "->", r[ARP].hwsrc)   # 打印 IP 与 MAC 映射
```

## 五、与其他技术对比

| 维度 | ARP (IPv4) | NDP (IPv6) | RARP | 静态映射 | EVPN/控制面下发 |
| --- | --- | --- | --- | --- | --- |
| 承载协议 | 链路层 0x0806 | ICMPv6 (IP 之上) | 链路层 0x8035 | 无 | BGP EVPN 控制协议 |
| 查询方式 | 链路层广播 | 请求节点组播 | 广播 | 无 | 上游推送 |
| 应答方式 | 单播 | 单播 | 单播 | 无 | 无 |
| 可跨路由 | 否 | 否 | 否 | 否 | 是 |
| 安全性 | 无认证 | 可选 SEND (RFC 3971) | 无 | 手工 | 可鉴权（BGP 会话） |
| 附带功能 | 仅地址解析 | 解析 + 路由发现 + DAD + 重定向 | 反向解析 | 无 | MAC/IP 表分发 |
| 现网状态 | 长期共存 | IPv6 标准 | 已被 DHCP 取代 | 仅关键网关 | 大型数据中心主流 |

关键差异在于层次：ARP 直接跑在链路层之上，无法穿过路由器（因此 ARP 只在同一广播域有效）；NDP 跑在 ICMPv6 之上，天然受 IP 层机制约束，也因此能被防火墙规则管理。

## 六、常见误区

- **认为 ARP 能跨网段解析远端主机。** ARP 只在同一广播域内有效。访问远端 IP 时，解析的是**网关**的 MAC，不是目标主机的 MAC。
- **认为 ARP 表永久有效。** 动态表项会老化（Linux 默认基时间约 30 秒量级，以官方文档为准），需周期性确认。
- **把 ARP 与 RARP 混淆。** ARP 是 IP → MAC，RARP 是 MAC → IP；后者已被 DHCP/BOOTP 取代。
- **忽略请求/应答的方向性。** 请求广播（`dst MAC = ff:ff:ff:ff:ff:ff`），应答单播；用广播过滤规则排查时容易看漏。
- **在多网卡同子网机器上不理解 `arp_ignore`/`arp_filter`。** 默认配置会让所有接口都回应答，导致入流量与出流量走不同网卡（非对称路由）。
- **认为 ARP 帧只有 28 字节。** 报文是 28 字节，但以太网帧需填充至最小长度；抓包时长尾的零字节会让长度判断出错。

## 七、与开源书·权威来源对应

- RFC 826《An Ethernet Address Resolution Protocol》：ARP 报文格式与处理算法的规范定义（含 OPCODE 表）。
- RFC 903《A Reverse Address Resolution Protocol》：RARP 的定义，理解 ARP 家族的必要补充。
- Tanenbaum《Computer Networks》第5章：ARP 的请求/应答时序图与链路层地址解析的定位。
- Stevens《TCP/IP Illustrated》Vol.1 第4章：ARP 报文结构、缓存表与典型抓包分析。
- Kurose & Ross《Computer Networking》第6章：链路层地址与地址解析协议的作用。
- Linux 源码 `net/ipv4/arp.c`：`arp_process()`、`arp_send()` 与 `arp_ignore` 等参数的真实实现。

## 八、面试题

1. **ping 同网段主机前为什么要先 ARP？**
   要点：以太网帧头必须填目的 MAC，而 IP 层只给到下一跳 IP，必须解析出 MAC 才能封装发送；缓存未命中时必须广播解析。

2. **ping 一个外网地址时，ARP 解析的是谁的 MAC？**
   要点：默认网关的 MAC（依据路由表确定下一跳），不是最终目标主机的。这是 ARP 只在同一广播域有效导致的必然结论。

3. **ARP 请求为什么用广播，而应答用单播？**
   要点：请求时不知道对方的 MAC，只能广播；应答时已经从请求中获知发起方 MAC，单播可减少广播域内的无效唤醒与流量。

4. **HTYPE/PTYPE/HLEN/PLEN 四个字段有什么用？**
   要点：使 ARP 与具体链路层/网络层解耦，可复用于以太网、FDDI、令牌环等不同硬件与不同上层协议；以太网 + IPv4 的取值为 1/0x0800/6/4。

5. **多网卡主机在同一子网，为什么会出现应答来自「错误」的网卡？**
   要点：默认 `arp_ignore=0` 使任何接口都会回应答；需设置 `arp_ignore=1`、`arp_announce=2`，必要时配合 `arp_filter` 与源路由，保证请求与回应走同一路径。

## 九、演进与趋势

IPv6 用 NDP 取代了 ARP，把地址解析放在 ICMPv6 之上，用请求节点组播（solicited-node multicast）替代链路层广播，并引入重复地址检测与路由器发现，安全性可由 SEND（RFC 3971）以密码学签名加固。ARP 因 IPv4 的长期存在不会立即消失，但在新建数据中心中已被大量替代。

在大型二层网络中，「ARP 泛洪」成为可扩展性瓶颈。工程手段包括：ARP 代理（路由器或网关代为应答，把广播终结在本地）、ARP 抑制（控制器集中维护 IP-MAC 映射并下发流表）、以及以 EVPN/MP-BGP 的控制平面分发 MAC/IP 表替代数据平面自学习。这些方案的共同思路是**把「洪泛学习的分布式状态」换成「控制平面集中下发的一致状态」**。

在虚拟化与容器网络中，veth/bridge 与 CNI 插件大量使用 ARP 代理与 `arp_ignore` 调优来消除非对称路由；裸机云与智能网卡的 ARP offload 则把应答下推到硬件，减少主机 CPU 参与。

## 十、小结

ARP 用 28 字节的报文解决了「IP 到 MAC」的动态映射问题：广播请求、单播应答、结果缓存、按需老化，设计简洁且自描述（HTYPE/PTYPE/HLEN/PLEN 使其与具体链路层解耦）。它的作用域严格限于同一广播域，跨网段时解析的是网关地址。

理解 ARP 的报文语义、缓存生命周期与 `arp_ignore`/`arp_announce`/`arp_filter` 的取舍，是排查局域网连通性、非对称路由与地址欺骗问题的前提。
