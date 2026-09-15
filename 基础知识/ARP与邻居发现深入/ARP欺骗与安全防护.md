# ARP欺骗与安全防护

> 对应 RFC 826 (ARP)、RFC 5227 (IPv4 ACD)、RFC 3971 (SEND)、RFC 6105 (RA Guard) 与 Tanenbaum《Computer Networks》第8章网络安全。

## 一、背景与挑战

ARP 的设计假设是 1982 年的封闭局域网：所有主机互相信任，链路层不存在恶意节点。RFC 826 因此没有为报文设计任何认证字段，接收方对任何来源的 ARP 报文都无条件接受并更新缓存——这是协议能在 40 字节内完成工作的原因，也是它在今天成为最经典链路层攻击面的原因。

攻击的本质是**信任模型缺失**：ARP 报文中 (SPA, SHA) 这一映射没有任何密码学或拓扑层面的绑定校验，攻击者只要发出「$IP_{gateway}$ 对应我的 MAC」的报文，就能让受害者的流量改道。由于同广播域内任何主机都能广播，攻击甚至不需要特殊的网络位置——只需接入网络即可。

带来的后果从窃听（明文协议可读、可改）、会话劫持，到拒绝服务（宣告网关不存在或指向黑洞）。更棘手的是它常被用作更高级攻击的第一步：先控制二层转发，再实施 SSL 剥离、DNS 欺骗等。

## 二、核心原理

### 攻击的三种基本形态

**伪造应答（poisoning）。** 攻击者向受害者持续发送 ARP Reply，声称网关 IP 对应自己的 MAC；同时向网关发送「受害者 IP 对应攻击者 MAC」。开启 IP 转发后，攻击者成为双向中间人：

$$ A \to M \to G, \qquad G \to M \to A $$

**免费 ARP 滥用。** 攻击者广播伪造的 GARP，一次性刷新全网缓存，比逐个欺骗更快，但更易被检测（大量异常的 SPA = 他人 IP 的 GARP）。

**CAM 表溢出。** 用大量伪造源 MAC 帧填满交换机 MAC 地址表，使其退化为集线器行为（未知单播泛洪），从而旁听流量。这是 ARP 欺骗的替代或辅助手段。

### 检测的判据

ARP 攻击在数据面上留下了明确的统计特征：**同一 IP 在短时间内对应多个不同 MAC**，或**同一 MAC 声称拥有多个 IP**。这两条正是 `arpwatch` 类工具的核心判据：

$$ \text{alert} \iff \left| \left\{ MAC \mid (IP, MAC) \in \text{observed} \right\} \right| > 1 $$

第二个信号是**网关 MAC 发生变更**：正常情况下网关 MAC 极少变化，若突然改变，几乎必然是欺骗或故障转移（需结合 GARP 是否成对出现来区分）。

### 防护的三层架构

**主机侧（被动加固）。** 静态 ARP 绑定（`nud permanent`）使缓存无法被动态更新覆盖；`arp_ignore`/`arp_announce` 消除 ARP flux 与错误应答。缺点是维护成本高、不具扩展性，只适合少量关键主机（如服务器与网关的绑定）。

**接入侧（主动过滤）。** 交换机执行动态 ARP 检测（DAI，Dynamic ARP Inspection）。其原理是建立**绑定表** $B$：通过 DHCP Snooping 监听 DHCP 交互得到 $(IP, MAC, port, VLAN)$ 四元组，或在静态配置中人工录入。所有 ARP 报文必须命中绑定表才被转发，否则丢弃并告警。配合 IP Source Guard 还能过滤伪造源 IP 的 IP 报文，形成完整的「二层地址真实性」体系。

**架构侧（消灭广播域）。** 用 VLAN/私有 VLAN 划分、802.1X 接入控制、EVPN 控制面替代自学习，从根上降低「任意主机可达任意主机」的二层通透性。

## 三、形式化与数学基础

ARP 的固有信任模型可写为：

$$ \text{trust}\left( SHA \to SPA \right) = \text{unauthenticated} $$

即任何接收到的映射都被无条件采纳。DAI 在这一步引入绑定表 $B$ 作为判据：

$$ \text{accept}(p) \iff \left( p.SPA,\ p.SHA,\ p.\text{port},\ p.\text{vlan} \right) \in B $$

绑定表通常由 DHCP Snooping 动态构建。设 DHCP 交互中可信的四元组集合为：

$$ B = \left\{ (ip, mac, port, vlan) \mid \text{DHCP Ack observed} \right\} $$

则攻击者要成功必须使自己的伪造三元组落入 $B$，而这需要先攻破 DHCP（如 DHCP Starvation 占满地址池后自建 DHCP 服务器分发受控租约）。这说明 DAI 的安全性是**建立在 DHCP Snooping 可信之上**的，是一个依赖链。

中间人攻击的成立条件可以形式化。设受害者缓存更新前的映射为 $c_{old}$，攻击成功需同时满足：

$$ \left( \text{poison}(A, IP_G) \ \land\ \text{poison}(G, IP_A) \right) \land \left( \text{forwarding}_M = \text{on} \right) $$

若攻击者只做单向欺骗而不开转发，结果是**拒绝服务**而非窃听，受害者表现为「网关不可达」。

DAI 的拦截效果取决于绑定的覆盖率。设合法映射被正确录入 $B$ 的比例为 $\alpha$，攻击流量被阻断的概率为：

$$ P_{block} = \alpha, \qquad P_{attack} = 1 - \alpha $$

因此「部分端口启用 DAI」会形成安全木桶效应——未启用的端口即攻击入口，实践中应在同一 VLAN 全端口启用。

## 四、代码实现

主机侧静态绑定（简单有效，适合网关与关键服务器）：

```bash
# 与网关建立永久绑定，动态 ARP 无法覆盖（内核会丢弃试图修改的报文）
ip neigh replace 192.168.1.1 lladdr 00:aa:bb:cc:dd:ee dev eth0 nud permanent
ip neigh show nud permanent

# 消除多网卡同子网的 ARP flux（这是常被误认为攻击的配置问题）
sysctl -w net.ipv4.conf.all.arp_ignore=1
sysctl -w net.ipv4.conf.all.arp_announce=2
sysctl -w net.ipv4.conf.all.arp_filter=1
```

用 scapy 演示欺骗的报文形态（仅用于合规的授权测试环境）：

```python
from scapy.all import ARP, Ether, sendp
import time

# 在已获授权的测试环境中演示中间人欺骗所需的报文
# 攻击者向受害者声称自己是网关
victim_mac, victim_ip = "00:11:22:33:44:55", "192.168.1.100"
attacker_mac = "66:77:88:99:aa:bb"
gw_ip = "192.168.1.1"

pkt = Ether(dst=victim_mac, src=attacker_mac) / \
      ARP(op=2, hwsrc=attacker_mac, psrc=gw_ip,
          hwdst=victim_mac, pdst=victim_ip)
# 周期性发送以对抗受害者的缓存老化
for _ in range(5):
    sendp(pkt, iface="eth0", verbose=False)
    time.sleep(1)
```

检测脚本：监控同一 IP 对应多个 MAC 的异常，适合部署在网关上做旁路告警：

```python
import subprocess
from collections import defaultdict

history = defaultdict(set)

while True:
    out = subprocess.check_output(["ip", "neigh", "show", "dev", "eth0"]).decode()
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 5:
            continue
        ip = parts[0]
        try:
            mac = parts[parts.index("lladdr") + 1]
        except ValueError:
            continue
        history[ip].add(mac)
        if len(history[ip]) > 1:
            print("ALERT ip=%s macs=%s" % (ip, sorted(history[ip])))
    import time
    time.sleep(5)
```

交换机侧 DAI 与 DHCP Snooping 的典型配置（以通用 CLI 语义描述，具体语法以厂商官方文档为准）：

```text
# 1) 先建立绑定表来源
vlan 10
 ip dhcp snooping
 ip dhcp snooping vlan 10
 interface Gi0/1              # 上联口/信任口
  ip dhcp snooping trust

# 2) 基于绑定表启用动态 ARP 检测
 ip arp inspection vlan 10
 interface Gi0/1
  ip arp inspection trust     # 上联口不再受 ARP 检查约束（避免误杀）

# 3) 附加：IP Source Guard 过滤伪造源 IP 的 IP 报文
 interface range Gi0/2 - 24
  ip verify source
```

## 五、与其他技术对比

| 维度 | 静态 ARP 绑定 | DHCP Snooping | DAI | IP Source Guard | 802.1X | IPv6 SEND (RFC 3971) |
| --- | --- | --- | --- | --- | --- | --- |
| 部署位置 | 主机 | 交换机 | 交换机 | 交换机 | 交换机 + RADIUS | 主机 + 交换机 |
| 防护对象 | 缓存被覆盖 | 伪造 DHCP | 伪造 ARP | 伪造源 IP | 未授权接入 | 伪造 NDP |
| 依赖前提 | 无 | 信任口配置正确 | DHCP Snooping | DHCP Snooping | 证书/PKI | PKI + CGA |
| 可扩展性 | 差（逐机配置） | 好 | 好 | 好 | 好 | 好 |
| 主要代价 | 维护成本 | 需维护信任口 | 需维护信任口 | 需维护信任口 | 客户端需支持 | 部署复杂、生态弱 |
| 防 DoS | 是（限自身） | 部分 | 部分 | 部分 | 是 | 是 |
| 防窃听 | 是 | 否 | 是 | 否 | 是（限制接入） | 是 |

需要强调防护的**层次差异**：静态绑定与 DAI 都在「防止缓存被污染」；而 802.1X 与私有 VLAN 是在「减少可攻击的邻居数量」。后者在架构上更根本，前者在补丁式防护上更直接，实际部署应组合使用。

## 六、常见误区

- **认为交换机网络天然免疫 ARP 欺骗。** 交换机只隔离不同 VLAN，同 VLAN 内依然广播可达；DAI 必须显式配置才生效。
- **认为 HTTPS 完全免疫。** 加密保护了机密性与完整性，但攻击者仍可做拒绝服务、连接重置、以及通过剥离/降级手段辅助攻击（HSTS 可缓解降级）。
- **认为 DAI 一旦启用就万无一失。** DAI 的判据是绑定表，若信任口配置错误或存在静态绑定缺口，攻击者可利用未受检查的端口；且 DHCP Starvation + 伪造 DHCP 可以从源头污染绑定表。
- **忽略 ARP flux 是配置问题而非攻击。** 多网卡同子网时默认应答行为会表现为「多个 MAC 声称同一 IP」，常被误判为攻击。
- **静态绑定的维护盲区。** 硬件更换或故障转移后必须同步更新，否则绑定反而造成中断；这也是静态方案难扩展的原因。
- **只做检测不做阻断。** arpwatch 类工具只告警不拦截，若无交换机侧联动，攻击窗口内的流量已经泄漏。
- **忽略 IPv6 侧的同类风险。** RA 伪造（恶意路由器通告）能直接劫持默认网关，危害不亚于 ARP 欺骗，需要 RA Guard（RFC 6105）。

## 七、与开源书·权威来源对应

- RFC 826《An Ethernet Address Resolution Protocol》：ARP 报文与处理算法，理解其「无认证」设计是分析攻击面的起点。
- RFC 5227《IPv4 Address Conflict Detection》：ARP Probe 的规范，也是区分正常冲突检测与恶意宣告的依据。
- RFC 3971《SEcure Neighbor Discovery (SEND)》：用加密生成地址（CGA）与签名保护 NDP，是 IPv6 侧的密码学防护方案。
- RFC 6105《IPv6 Router Advertisement Guard》：RA Guard 的规范，交换机侧过滤伪造 RA。
- Tanenbaum《Computer Networks》第8章：链路层与网络层安全威胁的分类框架。
- Kurose & Ross《Computer Networking》第8章：网络安全中的窃听、中间人与认证问题。
- Stevens《TCP/IP Illustrated》Vol.1 第4章：ARP 缓存行为，是理解「为何一条伪造应答即可改道流量」的基础。

## 八、面试题

1. **ARP 欺骗为什么可行？**
   要点：ARP 完全没有认证字段，接收方无条件信任任何来源的 (SPA, SHA) 映射并更新缓存；同广播域任意主机都能广播，攻击只需接入网络。

2. **如何检测 ARP 欺骗？**
   要点：监控同一 IP 在短时间内出现多个不同 MAC、或网关 MAC 异常变更；比对 DHCP Snooping 绑定表；启用 DAI 的丢弃计数与告警；部署 arpwatch 类旁路监控。

3. **DAI 的原理与前提是什么？**
   要点：交换机基于 DHCP Snooping 构建 (IP, MAC, port, VLAN) 绑定表，只转发命中绑定表的 ARP。前提是信任口配置正确、绑定表完整；否则存在绕过路径。

4. **HTTPS 能防住 ARP 欺骗吗？**
   要点：能防住机密性泄漏（攻击者看到的是密文），但不能防 DoS 与会话中断，也不能阻止攻击者转向 DNS/降级等其他手段；HSTS 可缓解降级。

5. **多层防护应该如何组合？**
   要点：接入层用 802.1X 限制谁能接入，用私有 VLAN/EVPN 缩小广播域；交换机启用 DHCP Snooping + DAI + IP Source Guard；主机对网关做静态绑定；用监控做兜底与取证。

## 九、演进与趋势

短期内的主流仍是以交换机为中心的「二层真实性验证」体系：DHCP Snooping + DAI + IP Source Guard 三位一体，配合 802.1X 与端口安全（限制每端口 MAC 数量）构成接入侧的基线要求。这套方案的优点是无需改动终端与协议，缺点是高度依赖设备能力与配置正确性。

中期的演进是**缩小甚至消灭广播域**。EVPN 以控制面分发 MAC/IP 表，数据中心内部不再依赖 ARP 泛洪与自学习，攻击者即使接入也难以「宣告」不属于自己的地址；容器网络中的 CNI 与策略引擎把安全边界收敛到每个 Pod，使二层通透成为例外而非常态。

长期方向是零信任与密码学绑定：IPv6 SEND 用 CGA 把地址与公钥绑定，从协议层杜绝伪造；但在 IPv4 生态中缺乏对应机制，因此实际缓解主要靠加密传输（TLS/QUIC）保护内容、以及集中式网络策略限制可达性。这也提示了一个结论：**在缺乏协议级认证的链路上，安全只能靠「限制谁能说话」与「验证说的话是否自洽」两条腿走路**，ARP 防护正是这两条腿在二层的最直接体现。

## 十、小结

ARP 欺骗的根源是协议设计上的无认证信任模型，攻击者只需广播一条伪造映射即可改道流量，进而实现窃听、篡改或拒绝服务。防护手段按可扩展性递增排列为：主机静态绑定、交换机 DAI + DHCP Snooping、接入控制（802.1X）与架构隔离（私有 VLAN/EVPN）。

工程上要抓住两个要点：一是 DAI 的判据完全依赖绑定表，因此 DHCP Snooping 的信任口配置与被保护端口的覆盖率决定了防护是否真的有木桶效应；二是加密传输只保护内容，不保护可达性，二层防护必须独立建设。
