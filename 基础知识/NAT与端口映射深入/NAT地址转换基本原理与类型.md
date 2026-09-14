# NAT地址转换基本原理与类型

> 对应 RFC 2663（NAT 术语与考量）、RFC 3022（Traditional IP NAPT）、RFC 4787（UDP 的 NAT 行为要求）、RFC 6888（CGNAT 通用要求），以及 Tanenbaum《Computer Networks》关于 NAT 与端到端原则的讨论。

## 一、背景与挑战
IPv4 地址空间只有 $2^{32}$ 个地址，扣除保留段与分配浪费后无法支撑设备数量增长。在 IPv6 全面部署之前，唯一的工程解法是在网络边界部署地址转换：让大量私网主机共享少量公网地址。
这一缓解措施带来了深远影响：地址不再全局唯一且稳定，入站连接默认不可达，应用层携带地址的协议（FTP、SIP、RTSP）会失效，IPsec 的完整性校验会因头部被改写而失败，日志溯源变得困难。因此必须先厘清 NAT 的**术语体系**（Basic NAT 与 NAPT 并非同义词）与**类型划分**，这是后续穿透、排障与合规讨论的基础。

## 二、核心原理
**RFC 2663 的术语体系**中，「NAT」在日常使用中被严重泛化：**Traditional NAT** 是单方向转换，内网可访问外网、外网无法主动访问内网，它有两种子类型——**Basic NAT** 只转换 IP 地址（一对一或多对多池化），不改端口，需要一组公网地址，同一时刻一个公网地址只能服务一个内网主机；**NAPT** 同时转换 IP 与传输层端口，因此一个公网地址可同时服务数万会话，日常所说的「NAT」几乎总是指 NAPT。此外还有 **Bi-directional NAT**（双向都可发起，需静态映射表）、**Twice NAT**（同时修改源与目的地址，用于两套私网地址空间互通）、**Multihomed NAT**（多出口时保持会话一致性的变体），以及 **Realm-specific IP / ALG**（前者指「在一个域内有效、跨域无效」的地址，后者指应用层网关）。
**NAPT 的转换表**由**出站首包**创建：内核提取五元组 $(proto, IP_{priv}, port_{priv}, IP_{dst}, port_{dst})$，为其分配外部端点 $(IP_{pub}, port_{pub})$，改写报文的源地址与源端口并重算校验和。反向报文到达时以内核查表（NAPT 下通常以目的端口为键，地址相关映射还需源地址参与）把目的地址与端口还原为内网端点。
**校验和与分片的处理**必须正视：IPv4 头部校验和可增量更新（RFC 1624 处理了「新值等于原值」的边界情况）；TCP/UDP 校验和覆盖含源/目的 IP 的伪头部，改写后必须重算；只有第一个分片含端口，后续分片需靠 IP 标识字段与分片状态跟踪关联，这既要求设备维护分片状态，也构成攻击面。RFC 4787 与 RFC 5508（ICMP 要求）对此有明确规定。
**ALG 的存在源于「载荷内嵌地址」的协议**：FTP 主动模式（`PORT`）在应用层交换 `IP:port`，NAT 改写地址后该信息错误，需要 ALG 同步修改并打开数据端口；SIP/SDP、RTSP、H.323 同样如此。ICMP 差错报文的载荷中内嵌被丢弃报文的前 8 字节（含传输层头），也必须正确重写才能让 `traceroute` 与 PMTU 发现可用。
**NAPT 的固有特性**有四条：表项由出站流量创建，默认拒绝入站主动连接（这是「NAT 像防火墙」这一误解的来源）；表项有生命周期，TCP 按连接状态与超时回收、UDP 无连接状态只能靠空闲超时（默认往往只有几十秒），超时后映射被删除、入站报文被丢弃；端口空间有限，单公网地址理论上最多 $2^{16}$ 个端口且每协议独立计数，并发会话存在明确天花板；地址不再可作身份，同一内网主机的外部端点随时间与目标变化。
**与 IPv6 的关系**：IPv6 地址充足，原则上不需要 NAT；但现实中仍有几类翻译需求——NAT64/DNS64 用于纯 IPv6 主机访问 IPv4 服务，NPTv6 只做前缀翻译、保持地址其余部分不变，因而不破坏端到端语义，DS-Lite 与 464XLAT 用于运营商侧 IPv4 承载的过渡。

## 三、形式化与数学基础
单公网地址下 NAPT 的映射函数为

$$ \left(IP_{priv}, port_{priv}, proto, IP_{dst}, port_{dst}\right) \mapsto \left(IP_{pub}, port_{pub}\right) $$

反向查询（入站还原）依映射独立性不同而不同：端点无关映射下仅需 $(proto, IP_{pub}, port_{pub})$，地址相关映射下还需 $IP_{src}$ 参与键。并发会话容量上界（单公网地址、单协议）为

$$ N_{max} = \left|\{port_{pub}\}\right| - N_{reserved} \ll 2^{16} $$

多地址池化时近似线性扩展：$N_{max}^{(total)} \approx |\mathcal{A}_{pub}| \cdot (2^{16} - N_{reserved})$。端口碰撞概率（生日问题）可估算同时活跃 $n$ 个会话在端口空间 $P$ 上至少发生一次碰撞的概率：

$$ \Pr(\text{碰撞}) \approx 1 - \exp\!\left(-\frac{n(n-1)}{2P}\right) $$

当 $n \ll \sqrt{P}$ 时碰撞可忽略；$n$ 接近 $P$ 时分配失败率急剧上升，这是 CGNAT 场景下「新连接偶发失败」的数学来源。

## 四、代码实现
```bash
# Linux 侧的经典 NAPT：MASQUERADE（动态选取源地址与端口）
iptables -t nat -A POSTROUTING -s 192.168.0.0/16 -o eth0 -j MASQUERADE

# 出口地址固定时用 SNAT 更高效
iptables -t nat -A POSTROUTING -s 192.168.0.0/16 -o eth0 -j SNAT --to-source 203.0.113.5

# 限制端口范围（应对端口耗尽、便于排查）
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE --to-ports 20000-30000

# 静态端口转发（入站可达，等价于 Basic NAT 的一对一映射）
iptables -t nat -A PREROUTING -p tcp --dport 8080 -j DNAT --to-destination 192.168.1.10:80

sysctl -w net.ipv4.ip_forward=1        # NAT 生效的前提：转发本身由路由决策
```

```bash
# conntrack 表项即映射表（字段：协议族 协议 超时 状态 双向五元组 [标志]）
cat /proc/net/nf_conntrack | head -3
# ipv4 2 tcp 6 431999 ESTABLISHED src=192.168.1.10 dst=198.51.100.20 sport=41022
#   dport=443 src=198.51.100.20 dst=203.0.113.5 sport=443 dport=51000 [ASSURED] use=1

conntrack -L -p udp 2>/dev/null | head          # 定向查询 UDP 映射
sysctl net.netfilter.nf_conntrack_udp_timeout   # 决定 UDP 映射寿命
```

```c
/* 概念性伪码：出站首包路径上的 NAPT 处理顺序 */
int nat_outbound(struct sk_buff *skb, struct nf_conn *ct) {
    struct nf_conntrack_tuple *reply = &ct->tuplehash[REPLY].tuple;

    /* 1. 查/建映射：以五元组为键，分配 (pub_ip, pub_port) */
    if (!reply->dst.u.all)
        return nf_nat_alloc_mapping(ct);

    /* 2. 改写源地址与源端口（Twice NAT 还会同时改写目的） */
    if (nf_nat_manip_pkt(skb, ct, NF_NAT_MANIP_SRC) < 0)
        return -1;

    /* 3. 重算校验和：IPv4 头可增量更新，TCP/UDP 因伪头部必须重算 */
    return nat_checksum_update(skb, ct);
}
```

## 五、与其他技术对比
| 维度 | Basic NAT | NAPT | 应用层代理 | 状态化防火墙 | NPTv6 |
| --- | --- | --- | --- | --- | --- |
| 改写层次 | IP 地址 | IP + 端口 | 应用层语义 | 不改写 | IPv6 前缀 |
| 是否需公网地址池 | 需要（一址一主机） | 一址可服务数万会话 | 一址可服务多会话 | 不涉及 | 不涉及 |
| 对应用是否透明 | 除内嵌地址外透明 | 除内嵌地址外透明 | 通常不完全透明 | 透明 | 透明 |
| 入站主动可达 | 取决于映射 | 默认不可达 | 由代理决定 | 由策略决定 | 可达 |
| 破除端到端原则 | 是 | 是 | 是（更彻底） | 否（但可能拦截） | 否（保持地址语义） |
| 典型用途 | 地址池、早期部署 | 家庭/企业出口、CGNAT | HTTP 反代、API 网关 | 企业边界 | IPv6 多宿主/迁移 |

最容易混淆的对比是「NAT 与防火墙」：NAT 设备的**状态化过滤**确实阻止了大多数入站连接，但这来自「无匹配映射则丢弃」这一副作用，而非访问控制策略——一旦存在映射（出站创建或静态配置），入站即被允许，不存在基于身份的授权判断。

## 六、常见误区
- **误区一：认为 NAT 等于防火墙。** NAT 只做地址/端口转换，阻断入站源于「无映射则无路径」；RFC 2663 明确指出二者目的不同，且 NAT 内部主机默认互相信任，横向移动不受阻碍。
- **误区二：以为所有 NAT 都支持入站主动访问。** Traditional NAT/NAPT 的逻辑是「出站建表」，外部主动发起在没有静态映射或 UPnP/PCP 协助时必然失败。
- **误区三：把 NAT 与 NAPT 混为一谈。** Basic NAT 不碰端口，没有端口复用能力；两者的并发能力、穿透特性与排障方法都不同。
- **误区四：忽略超时导致「连接莫名中断」。** UDP 映射空闲几十秒即被回收，长连接若无保活会被 NAT 悄悄切断；TCP 默认 keepalive 间隔（数小时）远长于 NAT 空闲超时，因此需要应用层心跳。
- **误区五：以为地址改写只影响 IP 头。** 传输层校验和、内嵌地址的载荷、ICMP 差错报文的内嵌头、分片的后续片都需处理，否则会出现「能建连但收不到数据」「大包不通」这类疑难故障。

## 七、与开源书·权威来源对应
- RFC 2663 建立 NAT 的术语体系（Traditional NAT、Basic NAT、NAPT、Twice NAT、ALG、Realm-specific IP），并明确 NAT 与防火墙的区别。
- RFC 3022 描述 Traditional IP NAPT 的机制、映射表结构与校验和/分片处理要求。
- RFC 4787 提出 NAT 对 UDP 的行为要求（映射与过滤的独立性、端口保持、hairpinning 等），是判断 NAT 行为的标准化依据。
- RFC 6888 给出运营商级 NAT 的通用要求，含端口分配与日志留存，解释 IPv4 地址进一步复用的代价。
- Tanenbaum《Computer Networks》关于网络层与端到端原则的讨论，以及 Saltzer 等人 1984 年的「End-to-End Arguments in System Design」，提供「中间设备改写地址为何破坏架构」的理论视角。

## 八、面试题
1. **NAPT 如何用一个公网 IP 区分多台内网主机？**
   要点：为每条会话分配唯一外部端口，形成 $(proto, IP_{pub}, port_{pub})$ 与 $(IP_{priv}, port_{priv})$ 的映射；入站报文按目的端口（或加上源地址）反查还原。
2. **为什么说 NAT 不等于防火墙？**
   要点：NAT 的阻断效果来自「无映射无路径」这一状态依赖；一旦有映射入站即通，不存在策略与身份判断。真正的安全来自显式过滤规则与加密。
3. **改写地址后哪些部分必须同步修改？**
   要点：IPv4 头校验和（可增量更新）、TCP/UDP 校验和（伪头部含 IP，必须重算）、应用层内嵌地址（需 ALG）、ICMP 差错报文内嵌的被丢弃报文头，以及分片后续片的关联状态。
4. **NAPT 的并发会话上限受什么限制？**
   要点：单公网地址的可用端口数（远小于 $2^{16}$）、每协议独立计数，以及 conntrack 表容量与超时参数；地址池可线性扩展总量，但端口耗尽仍会造成新建连接失败。
5. **为什么 UDP 的映射比 TCP 更容易被回收？**
   要点：UDP 无连接状态，NAT 无法感知会话结束，只能依赖空闲超时；TCP 有状态机，可依 `ESTABLISHED`/`FIN`/`RST` 判断并及时回收或延长，因此超时设置差异很大。

## 九、演进与趋势
NAT 的演进有三条主线。**进一步复用 IPv4**：CGNAT 在运营商侧把公网地址再复用一层，代价是端口分配日志成为合规必需、可追溯性下降、对称行为更常见（打洞更难）。**向 IPv6 过渡**：NAT64/DNS64 让 IPv6-only 主机访问 IPv4 服务，DS-Lite/464XLAT 在运营商侧承载 IPv4，而 NPTv6 只翻译前缀以保留地址语义。**让 NAT 行为可预测**：RFC 4787/5382/5508 系列行为要求、PCP 的显式映射申请、以及 ICE 的连通性实测，共同把「猜测 NAT 行为」转为「测量与协商」。长期看，随 IPv6 渗透率提升，通用 NAPT 的部署范围会收窄，但在双栈共存的漫长过渡期内，NAPT 与 CGNAT 仍将是绝大多数终端流量的必经之路。

## 十、小结
NAT 通过在边界改写地址（必要时改写端口与校验和）实现 IPv4 地址复用，其中 Basic NAT 只改地址、NAPT 改地址与端口从而获得数万倍复用能力，Twice NAT 与双向 NAT 覆盖更复杂拓扑。NAPT 的映射表由出站首包创建，因此默认阻断入站、依赖超时回收、受端口空间限制，并破坏「地址即身份」与端到端可达性。三条最实用的认知是：NAT 不是防火墙、入站不可达是映射不存在而非策略禁止、所有载荷内嵌地址的协议都需要 ALG 或端点侧 NAT 感知处理。
