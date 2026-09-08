# IPv6邻居发现协议NDP

> 对应 RFC 4861 (Neighbor Discovery) 与 RFC 4862 (SLAAC)。

## 一、背景与挑战
IPv6 用 ICMPv6 的 NDP 取代 IPv4 的 ARP、ICMP 重定向、路由器发现等成套机制，统一在链路层之上。NDP 以组播替代广播，并内建地址冲突检测，但需要防范伪造的邻居/路由器通告。

## 二、核心原理
NDP 包含五类报文：RS（路由器请求）、RA（路由器通告，含前缀与跳数限制）、NS（邻居请求）、NA（邻居通告）、Redirect。NS/NA 完成地址解析与可达性确认（等价于 ARP 但用组播地址 solicited-node）。无状态地址自动配置 SLAAC 由 RA 前缀 + 接口标识符生成地址。

## 三、形式化与数学基础
SLAAC 地址构造：
$$ IPv6_{addr} = prefix_{RA} \, \| \, interface\_id $$
接口标识符可由 MAC 经 EUI-64 生成或 RFC 7217 稳定隐私地址：
$$ IID = \text{hash}(prefix, NIC, secret) $$
邻居可达性检测 NUD 通过 NS 探测确认下一跳仍可达。

## 四、代码实现
Linux 查看 NDP 邻居与 RA：
```bash
ip -6 neigh show
ip -6 route show
rdmsrd  # 或 sysctl 控制 accepting_ra
```
开启 SLAAC（默认内核自动）：
```bash
sysctl -w net.ipv6.conf.eth0.accept_ra=1
```

## 五、与其他技术对比
NDP 比 ARP 功能更全（含路由发现、前缀通告），用组播而非广播更友好；SEND（RFC 3971）提供密码学防护而 ARP 无。代价是 ICMPv6 需防火墙正确放行。

## 六、常见误区
误区一是认为 IPv6 不需要 ARP 防护而忽视 NDP 欺骗，RA 伪造同样可劫持流量。误区二是关闭 RA 接受就安全，仍可能被恶意 NA 误导。

## 七、与开源书/权威来源对应
RFC 4861 定义 NDP 五类报文；RFC 4862 定义 SLAAC；Tanenbaum 第5章对比 IPv4/IPv6 解析。

## 八、面试题
问：NDP 如何取代 ARP？答：用 NS 单播/组播查询、NA 应答完成 IP-MAC 解析，且运行于 ICMPv6 之上、面向 IPv6 组播，附带路由发现能力。

## 九、演进与趋势
SEND 与隐私扩展地址（RFC 4941）增强安全与隐私；5G/物联网广泛依赖 RA/SLAAC 进行即插即用联网。

## 十、小结
NDP 以 ICMPv6 统一地址解析、路由发现与配置，是 IPv6 运行的核心。理解其报文与 SLAAC 有助于部署与防护 IPv6 网络。
