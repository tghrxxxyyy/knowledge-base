# 免费ARP与代理ARP

> 对应 RFC 826 (ARP)、RFC 1027 (Proxy ARP)、RFC 5227 (IPv4 Address Conflict Detection) 与 Stevens《TCP/IP Illustrated》Vol.1 第4章。

## 一、背景与挑战

标准 ARP 是「按需解析」：只有要发包且缓存未命中时才查询。但有些场景下「等到需要时才解析」为时已晚：

- **地址变更或故障转移。** 当某台主机接管了一个 IP（例如 VRRP 备机升主、容器/虚机迁移），同网段其他主机与交换机的缓存里仍然保存着「旧 IP → 旧 MAC」的映射，流量会继续发往已经不再持有该 IP 的节点，造成黑洞。此时需要**主动宣告**新映射，而不等别人来问。
- **地址冲突自检。** 主机在配置一个新地址前，应该先确认该地址未被占用，避免两台机器同 IP 造成混乱。
- **跨网段可达的兼容需求。** 某些老旧或嵌入式设备不能配置网关，只会在本网段内直接 ARP 查询任意 IP。要让它们访问远端网络，需要路由器**代为应答**本不属于自己链路的 IP，即代理 ARP。

免费 ARP（Gratuitous ARP，GARP）解决前两类需求，代理 ARP（Proxy ARP）解决第三类。

## 二、核心原理

### 免费 ARP 的两种形态

GARP 是「发送方 IP 与目标 IP 相同」的 ARP 报文，因此不产生新的映射信息，只起宣告或自检作用。按 OPER 与目的地址的差异，常见三种形态：

| 形态 | OPER | SPA | TPA | 目的 MAC | 用途 |
| --- | --- | --- | --- | --- | --- |
| GARP Request（广播） | 1 | $IP_{self}$ | $IP_{self}$ | ff:ff:ff:ff:ff:ff | 宣告，使全网更新缓存 |
| GARP Reply（广播） | 2 | $IP_{self}$ | $IP_{self}$ | ff:ff:ff:ff:ff:ff | 宣告，兼容不处理请求的实现 |
| ARP Probe（RFC 5227） | 1 | 0.0.0.0 | $IP_{self}$ | ff:ff:ff:ff:ff:ff | 冲突检测，不污染他人缓存 |

**关键区别在于 SPA**：冲突探测必须使用 `0.0.0.0` 作为发送方地址（称为 ARP Probe），这样即使目标地址已被占用，也不会让其他主机把该地址与探测者的 MAC 错误地绑定。若用 $IP_{self}$ 做探测，一旦冲突，全网缓存都会被污染成「该 IP → 探测者 MAC」，反而破坏了正在工作的主机。RFC 5227 正是为这一细节立规。

主机在执行「宣布」时通常发送 GARP Announcement（SPA = TPA = 自己的地址，广播），并重复若干次以对抗丢包；同时会附带一次冲突检测，若收到他人回应的 NA/ARP Reply 则报告地址冲突。

### 交换机侧的实际效果

GARP 之所以能快速修复故障转移，关键在于它不仅刷新了三层主机的 ARP 缓存，也刷新了二层交换机的 MAC 地址表：广播帧的源 MAC 会被交换机学习并更新其 CAM 表项端口。因此 VIP 漂移后，原本指向旧端口的 MAC 表项被迅速改写，流量重新导向新节点。

### 代理 ARP 的工作方式

开启 `proxy_arp` 的接口在收到「TPA 不是本机地址但路由表中存在通往 TPA 的路由」的 ARP 请求时，以**本接口的 MAC** 作为 SHA 回送应答。请求方因此误以为目标在同一链路，把帧发给了路由器，由路由器三层转发，实现跨网段可达。

这本质上是一种**善意的欺骗**：它在链路层伪造了「目标在同一广播域」的假象。RFC 1027 明确将其定位为兼容手段，用于旧设备、未划分子网的历史网络、以及移动 IP 等场景，而非通用设计。

代理 ARP 有两种常见配置形态：普通 `proxy_arp`（对所有非本地目标应答）与 `proxy_arp_pvlan`（私有 VLAN 场景，仅在同一主接口下的隔离端口之间代答，不泄漏到其他网段）。

## 三、形式化与数学基础

免费 ARP 的特征可形式化为一组等式：

$$ SPA = TPA = IP_{self}, \qquad SHA = MAC_{self}, \qquad OPER \in \{1, 2\} $$

而 ARP Probe（冲突检测）的特征是：

$$ SPA = 0, \qquad TPA = IP_{candidate}, \qquad SHA = MAC_{self} $$

代理 ARP 的应答条件：

$$ \text{reply} \iff \left( TPA \notin \text{local addrs} \right) \land \left( \exists\ \text{route}: TPA \right) \land \left( \text{proxy\_arp} = 1 \right) $$

回送时 $SHA = MAC_{iface}$、$SPA = TPA$，使请求方把目标 IP 绑定到路由器 MAC。

故障转移的收敛时间可以建模。设缓存中旧映射在 $N$ 个节点与交换机 MAC 表中存在，GARP 以广播方式一次性覆盖全部监听者，其收敛时间为：

$$ T_{recover} \approx T_{garp\_delay} + \text{传播时延} + \text{交换机更新延迟} $$

量级通常在毫秒到百毫秒，远小于等待缓存自然老化的时间（动态表项基时间约 30 秒量级，以官方文档为准）。若不做 GARP，则：

$$ T_{recover} \approx T_{arp\_timeout} \approx 10^4\ \text{ms} $$

这正是「VIP 漂移后短暂不通」的直接原因。

冲突概率方面，RFC 5227 建议的探测行为包含：随机延迟 $0 \sim \text{PROBE\_WAIT}$（1 秒）后发送 `PROBE_NUM`（3）次探测，间隔 `PROBE_MIN`（1 秒）到 `PROBE_MAX`（2 秒）随机，再发送 `ANNOUNCE_NUM`（2）次通告。随机化的目的是降低两台主机同时探测而双双通过的概率：

$$ P_{simultaneous} \approx \prod_{i} \frac{1}{\text{PROBE\_MAX} - \text{PROBE\_MIN}} $$

## 四、代码实现

Linux 内核在接口 up 或地址上添加时自动发 GARP，行为由 `arp_notify` 控制：

```bash
# 接口 up / 地址变更时是否主动发送免费 ARP（1 = 发送）
sysctl net.ipv4.conf.eth0.arp_notify
# 是否接受别人的 GARP 更新自己的缓存（1 = 更新，0 = 忽略）
sysctl net.ipv4.conf.eth0.arp_accept
```

手动触发可用 `arping`（来自 iputils），三个开关的语义差异很重要：

```bash
# -U：无请求的 ARP（GARP，SPA=TPA=自己）
arping -U -I eth0 192.168.1.10
# -A：ARP 应答形式（Reply）的 GARP，某些老设备只认这种
arping -A -I eth0 192.168.1.10
# 普通模式：把目标当作别人（用于冲突检测/探测）
arping -I eth0 -c 3 192.168.1.1
```

用 scapy 精确构造三种形态，便于验证对端行为：

```python
from scapy.all import ARP, Ether, sendp

iface = "eth0"
my_ip, my_mac = "192.168.1.10", "00:11:22:33:44:55"

# 1) GARP Announcement：SPA = TPA，广播
ann = Ether(dst="ff:ff:ff:ff:ff:ff", src=my_mac) / \
      ARP(op=1, hwsrc=my_mac, psrc=my_ip, hwdst="00:00:00:00:00:00", pdst=my_ip)
sendp(ann, iface=iface, count=2)

# 2) ARP Probe：SPA = 0.0.0.0，用于冲突检测（不污染他人缓存）
probe = Ether(dst="ff:ff:ff:ff:ff:ff", src=my_mac) / \
        ARP(op=1, hwsrc=my_mac, psrc="0.0.0.0", hwdst="00:00:00:00:00:00", pdst=my_ip)
sendp(probe, iface=iface, count=3)
```

开启代理 ARP 并验证：

```bash
# 全局 + 接口级同时开启（两者都要为 1）
sysctl -w net.ipv4.conf.all.proxy_arp=1
sysctl -w net.ipv4.conf.eth0.proxy_arp=1
sysctl -w net.ipv4.ip_forward=1        # 代理 ARP 必须配合转发

# 验证：从客户端 arping 一个跨网段地址，应看到路由器的 MAC 被回送
arping -I eth0 10.20.30.40
```

```python
import subprocess

# 观察本机是否正在做代理 ARP 应答（邻居表会出现大量非本网段条目）
out = subprocess.check_output(["ip", "neigh", "show", "dev", "eth0"]).decode()
for line in out.splitlines():
    print(line)   # 含 nud 状态，permanent/reachable 的跨段条目即为代理结果
```

## 五、与其他技术对比

| 维度 | 免费 ARP | ARP Probe | 代理 ARP | VRRP/keepalived | EVPN 控制面 | NAT |
| --- | --- | --- | --- | --- | --- | --- |
| 层次 | L2/L3 之间 | L2/L3 之间 | L3 代答 | L3 冗余协议 | BGP 控制面 | L3/L4 |
| 目的 | 宣告/刷新映射 | 冲突检测 | 跨段可达兼容 | 网关高可用 | MAC/IP 表分发 | 地址转换 |
| 报文 | ARP Request/Reply | ARP Request | ARP Reply | VRRP 通告 + GARP | BGP 更新 | 改写包头 |
| 是否污染缓存 | 故意（宣告） | 不污染（SPA=0） | 引入假映射 | 靠 GARP 刷新 | 不涉及 | 不涉及 |
| 收敛速度 | 毫秒级 | — | — | 毫秒~百毫秒 | 取决于 BGP 收敛 | — |
| 主要风险 | 被用于欺骗 | 基本无 | 放大广播域、路由环路 | 双主（脑裂） | 配置复杂 | 破坏端到端语义 |
| 现代替代 | 仍广泛使用 | 仍广泛使用 | 逐步被路由/EVPN 取代 | 仍广泛使用 | 数据中心主流 | 与代理 ARP 无关 |

需要注意：代理 ARP 与 NAT 常被混淆，但二者机制完全不同——代理 ARP 只改链路层应答，IP 包头与端到端语义完好；NAT 改写 IP 地址甚至端口，破坏了端到端透明性。代理 ARP 也不解决地址空间不足问题，它只是让「以为自己在一个网段」的设备能出去。

## 六、常见误区

- **认为免费 ARP 只用来自检冲突。** 更常见的用途是宣告：VIP 漂移、接口 up、地址迁移时刷新对端缓存与交换机 MAC 表。
- **用 SPA = 自身 IP 的方式做冲突检测。** 这会在冲突时污染他人缓存，正确做法是 ARP Probe（SPA = 0.0.0.0，RFC 5227）。
- **认为代理 ARP 等于 NAT。** 前者不改 IP 头、不解决地址不足；后者改包头、解决地址复用。二者是完全不同的技术。
- **在不了解拓扑的情况下开启 `proxy_arp`。** 会使路由器替大量地址应答，放大广播域、隐藏拓扑错误，甚至与错误路由配合形成环路。
- **认为发了 GARP 就一定收敛。** 若交换机/主机配置了静态 ARP 或 `arp_accept=0`，GARP 会被忽略；故障转移后仍需人工清理。
- **忽略 GARP 的安全面。** 攻击者可发送伪造 GARP 劫持流量；这与 ARP 欺骗是同一机制的滥用。
- **只发一次 GARP。** 广播帧可能丢失，实践中应重复数次（常见 2–3 次）并根据环境调整。

## 七、与开源书·权威来源对应

- RFC 826《An Ethernet Address Resolution Protocol》：定义了 ARP 报文的广播语义，是 GARP 得以工作的基础（广播自身映射并未被禁止）。
- RFC 1027《Using ARP to Implement Transparent Subnet Gateways》：Proxy ARP 的规范定义与适用场景。
- RFC 5227《IPv4 Address Conflict Detection》：ARP Probe（SPA = 0.0.0.0）、Announcement、探测次数与随机化参数的规范建议。
- RFC 5798《Virtual Router Redundancy Protocol (VRRP) Version 3》：VRRP 状态机与接管时发送 GARP 的要求。
- Stevens《TCP/IP Illustrated》Vol.1 第4章：ARP 缓存行为与代理 ARP 的实际效果分析。
- Tanenbaum《Computer Networks》第5章：代理 ARP 的用途与隐患讨论。
- Linux `net/ipv4/arp.c` 与 iputils `arping`：GARP 发送条件（`arp_notify`）与三种报文形态的实现。

## 八、面试题

1. **VIP 漂移后为什么要立即发免费 ARP？**
   要点：让同网段主机更新 ARP 缓存、让交换机更新 MAC 地址表，把流量从旧节点切到新节点，收敛时间从「等缓存老化」的秒级降到毫秒级。

2. **冲突检测为什么必须用 SPA = 0.0.0.0？**
   要点：若用自身 IP 作为 SPA，一旦地址已被占用，全网会把该 IP 错误绑定到探测者的 MAC，反而打断正常工作主机。SPA = 0 保证探测不产生任何映射。

3. **代理 ARP 与 NAT 的区别？**
   要点：代理 ARP 只在链路层代替应答，IP 包头不变，端到端语义完整；NAT 改写地址/端口，破坏端到端透明性。代理 ARP 不解决地址空间不足。

4. **免费 ARP 的 Request 与 Reply 形态有什么区别？**
   要点：二者都广播、都以自身为 TPA。区别在 OPER 字段，Reply 形态兼容那些只处理应答、不处理请求的旧实现；实践中常两种都发。

5. **开启代理 ARP 有什么风险？**
   要点：路由器替大量非本地地址应答，隐藏三层拓扑错误、放大广播域、与错误路由配合可能形成环路；现代网络应以正确划分子网与路由替代。

## 九、演进与趋势

在数据中心与云网络中，传统的广播式 GARP + 自学习正在被控制平面取代。EVPN（基于 MP-BGP）直接在控制面分发 MAC/IP 表项，主机迁移时由控制面通告而非依赖广播刷表，既消除了泛洪，也使收敛时间可控且可观测。类似的思路在 SDN 控制器中表现为「由控制器下发 IP-MAC 映射并抑制 ARP 泛洪」，即所谓的 ARP 抑制。

在容器与 Kubernetes 环境中，VIP 漂移（如 `kube-vip`、MetalLB）仍大量依赖 GARP，因为它不需要客户端配合、跨平台兼容性好，是最小改造的高可用方案。与此同时，`arp_accept`、`arp_notify`、`proxy_arp_pvlan` 等参数的细化反映了内核在适配虚拟化/租户隔离场景上的持续演进。

在 IPv6 侧，对应的机制是邻居通告（NA）的主动发送与 RA 的撤销，其语义更规范；RFC 5227 的思路也被 IPv6 的增强 DAD（RFC 7527）以更彻底的方式继承——冲突时主动用邻居的 MAC 发包，让对端直接判定冲突，而不必等待超时。

## 十、小结

免费 ARP 是「主动宣告」机制：以自身 IP 同时作为 SPA 与 TPA 广播，刷新同网段主机的 ARP 缓存与交换机的 MAC 表，是 VIP 漂移、接口上线、地址迁移后快速收敛的关键。与之配套的冲突检测必须使用 SPA = 0.0.0.0 的 ARP Probe，避免污染他人缓存。

代理 ARP 是「兼容性欺骗」机制：路由器替非本地但可路由的地址应答自身 MAC，让不会配网关的设备也能跨段通信。它简单有效，但放大广播域、隐藏拓扑问题，现代网络应以正确的子网划分、路由与 EVPN 控制面替代。二者共同构成了 ARP 在标准解析之外的两个重要扩展面。
