# NDP无状态地址自配置SLAAC

> 对应 RFC 4862 (IPv6 Stateless Address Autoconfiguration)、RFC 4861 (Neighbor Discovery)、RFC 4941 (Privacy Extensions)、RFC 7217 (Stable Opaque IID)。

## 一、背景与挑战

IPv4 时代主机联网依赖 DHCP：一台没有地址的主机无法用 IP 通信，因此必须先用链路层广播/组播向服务器申请地址，再由服务器维护租约状态。这套机制可用但引入了中心化依赖——没有 DHCP 服务器的网络（临时组网、家庭网络、物联网批量部署）就无法自动配置。

IPv6 的设计目标之一是**即插即用**：主机只要接入链路，就能自行推导出一个可路由的地址，无需任何服务器的状态。依据是 IPv6 地址的 128 位结构天然被划分为「网络前缀 + 接口标识符」，前缀可由路由器通告，接口标识符可由主机自行生成，二者拼接即得全球单播地址。

但「自行生成」引出三个必须解决的问题：**唯一性**（地址是否会与他人冲突）、**隐私**（接口标识符若由 MAC 推导，则可被跨网络长期追踪）、**可路由性**（前缀必须真实有效且被上游网络接受）。SLAAC 及其隐私扩展正是围绕这三点展开的。

## 二、核心原理

### 地址生成的两步法

**第一步：获取前缀。** 主机接入链路后向 `ff02::2`（所有路由器）发送路由器请求（RS），或在无请求时被动等待路由器周期性发送的路由器通告（RA）。RA 中携带前缀信息选项（Prefix Information Option），含前缀值、前缀长度（通常 /64）、以及 A 标志（Autonomous，可自主配置）与 L 标志（On-link）。

**第二步：生成接口标识符（IID）并拼接。** 三种主流方式：

- **EUI-64**：把 48 位 MAC 从中间插入 `FF:FE` 并翻转第 7 位（U/L 位）得到 64 位 IID。实现简单但泄漏 MAC，且同一网卡跨网络地址一致，可被长期追踪。
- **隐私扩展（RFC 4941）**：随机生成 IID，配合 preferred/valid 生命周期定期更换，用于出站连接；同时保留一个基于 EUI-64 或稳定算法的「稳定地址」用于入站。
- **稳定不透明 IID（RFC 7217）**：用带密钥的伪随机函数对「前缀 + 接口名 + 网络标识 + DAD 次数」求值，得到**同一网络内稳定、跨网络不可关联**的地址。兼顾服务器可预期性与隐私。

### 重复地址检测（DAD）

地址在配置前处于 tentative（暂定）状态，此时不得用于收发普通流量（只能收发 NDP）。主机向该地址对应的请求节点组播地址发送邻居请求（NS），若在 `RetransTimer` 内无人以邻居通告（NA）应答，则认为地址唯一，转入 preferred 状态；若收到 NA，则标记冲突并放弃该地址。

DAD 的关键细节是：探测使用的源地址必须为未指定地址 `::`，目标为「待检测地址的请求节点组播组」，这样即使地址已被占用，也不会有两个节点同时使用同一源地址。

### 地址生命周期状态机

RFC 4862 定义了四个状态与两个时间参数：`preferred_lifetime` 与 `valid_lifetime`。

| 状态 | 条件 | 可否收发新连接 |
| --- | --- | --- |
| Tentative | 正在 DAD | 否（仅 NDP） |
| Preferred | $t < t_{pref}$ | 可以（新连接优先选它） |
| Deprecated | $t_{pref} \le t < t_{valid}$ | 存量连接可续，新连接不选 |
| Invalid | $t \ge t_{valid}$ | 否，地址被移除 |

RA 可以刷新这两个时间，因此地址会随路由器的通告周期性续期；一旦路由器停止通告（如上游撤销前缀），地址会自然走向 invalid 并被回收，这是 SLAAC 无需显式撤销机制的优雅之处。

## 三、形式化与数学基础

地址构造：

$$ A = \text{prefix}_{/64} \ \|\ \text{IID}_{64} $$

EUI-64 的构造（$b_7$ 为第一个字节的第 7 位，即 U/L 位）：

$$ \text{IID} = \left( MAC_{[0:3]} \oplus 0x02 \right) \| \texttt{FF:FE} \| MAC_{[3:6]} $$

RFC 7217 的稳定 IID（$\mathrm{PRF}$ 为伪随机函数，$K$ 为本机秘密）：

$$ \text{IID} = \mathrm{PRF}\left( K,\ \text{prefix} \ \|\ \text{net\_iface} \ \|\ \text{network\_id} \ \|\ \text{DAD\_counter} \right) $$

其安全性依赖两点：$K$ 不出本机，故外部无法通过已知前缀预测其他网络中的地址；计数 $DAD\_counter$ 保证冲突时能生成新地址而不陷入死循环。

DAD 的成功条件可形式化为：

$$ \text{use } A \iff \neg \exists\, \text{NA}\left( \text{target} = A \right) \ \text{在 } T_{retrans} \text{ 内} $$

DAD 的失败概率在**合法随机 IID** 前提下极低。以 64 位随机 IID 与链路内 $m$ 台主机计，冲突概率近似为生日问题的形式：

$$ P_{collision} \approx \frac{m(m-1)}{2 \cdot 2^{64}} $$

即 $m = 10^{4}$ 时概率约 $10^{-12}$ 量级。真正会造成大量冲突的是 EUI-64 与「固定随机种子」类实现——虚拟化环境中若成千上万台虚拟机克隆自同一镜像且未重新生成 IID，会集体冲突。

吞吐与时延上，DAD 引入的启动延迟为：

$$ T_{dad} = \text{DupAddrDetectTransmits} \times \text{RetransTimer} $$

RFC 4862 建议 `DupAddrDetectTransmits = 1`、`RetransTimer = 1000ms`，即至少约 1 秒。RFC 4429 的乐观 DAD（Optimistic DAD）允许地址在 DAD 期间以 optimistic 状态有限使用，把这一秒的启动延迟降到接近 0，代价是冲突时需回退。

## 四、代码实现

内核侧的 SLAAC 状态与参数由 `net/ipv6/addrconf.c` 维护，用户可见的控制面如下：

```bash
# 1) 接受 RA 并启用自动配置（默认已开）
sysctl net.ipv6.conf.eth0.accept_ra=1
sysctl net.ipv6.conf.eth0.autoconf=1

# 2) 地址生成方式与隐私扩展
#    use_tempaddr: 0 关闭；1 使用但不优先；2 使用且优先临时地址
sysctl net.ipv6.conf.eth0.use_tempaddr=2
sysctl net.ipv6.conf.eth0.temp_prefered_lft=86400     # 1 天
sysctl net.ipv6.conf.eth0.temp_valid_lft=604800       # 7 天
sysctl net.ipv6.conf.eth0.addr_gen_mode=1             # 1=EUI-64, 2=稳定隐私(RFC 7217)

# 3) DAD 参数
sysctl net.ipv6.conf.eth0.dad_transmits=1
sysctl net.ipv6.conf.eth0.accept_dad=1                # 0 关闭 DAD（危险）

# 4) 观察地址状态：带 tentative/deprecated 标记
ip -6 addr show dev eth0
# inet6 2001:db8::1/64 scope global dynamic mngtmpaddr ...
#        valid_lft 2591984sec preferred_lft 604784sec
```

主动请求路由器通告并观察前缀：

```bash
rdisc6 -1 eth0            # 发送 RS 并打印 RA 内容
# 关注：A 标志（自主配置）、前缀长度、valid/preferred lifetime、RDNSS 选项
```

DAD 过程的抓包验证（能看到源地址为 `::` 的 NS）：

```bash
tcpdump -i eth0 -nn 'icmp6 and (ip6[40] == 135 or ip6[40] == 136)'
# 135 = NS：src ::, dst ff02::1:ffXX:XXXX（请求节点组播）
# 136 = NA：仅当冲突时才出现
```

地址状态的程序化读取：

```python
import subprocess, re

out = subprocess.check_output(["ip", "-6", "addr", "show", "dev", "eth0"]).decode()
# 提取 wasm global 地址与其 valid/preferred 生命周期
for line in out.splitlines():
    m = re.search(r"inet6 (\S+)/(\d+) scope global (\w*)", line)
    if m:
        print("addr=", m.group(1), "plen=", m.group(2), "flag=", m.group(3))
```

对于克隆虚拟机的批量部署，需要在镜像首次启动时清除或重置 DAD 之外的 IID 来源（例如强制 `addr_gen_mode=2` 或让云平台注入随机 IID），否则会成规模冲突。

## 五、与其他技术对比

| 维度 | SLAAC | DHCPv6 有状态 | DHCPv6-PD | 静态配置 | 隐私扩展（RFC 4941） | 稳定 IID（RFC 7217） |
| --- | --- | --- | --- | --- | --- | --- |
| 是否需要服务器 | 否（只需 RA） | 是 | 是 | 否 | 否（叠加在 SLAAC 上） | 否 |
| 地址来源 | RA 前缀 + 本机 IID | 服务器下发 | 服务器下发前缀 | 人工 | 随机 IID | PRF 计算的 IID |
| DNS 下发 | 需 RDNSS（RFC 6106） | 原生支持 | 原生支持 | 手工 | 同 SLAAC | 同 SLAAC |
| 地址稳定性 | 取决于 IID 方式 | 稳定（按租约） | 稳定 | 稳定 | 会轮换 | 同网络内稳定 |
| 可追踪性 | EUI-64 可追踪 | 较低 | 较低 | 低 | 最低 | 低 |
| 运维可视性 | 弱（无租约表） | 强 | 强 | 强 | 同 SLAAC | 中 |
| 典型场景 | 家庭、IoT、移动 | 企业、审计要求 | ISP 给客户分配 | 服务器/网关 | 终端出站 | 服务器 + 云主机 |

正确认知是**二者并非互斥**：RA 中的 M 标志（Managed）表示「地址请找 DHCPv6」，O 标志（Other）表示「其他配置找 DHCPv6」，因此可以「SLAAC 管地址、DHCPv6 管 DNS/NTP」组合使用，这也是企业网常见的部署方式。

## 六、常见误区

- **认为 SLAAC 一定暴露 MAC。** 只有 EUI-64 方式暴露；隐私扩展与 RFC 7217 稳定 IID 都不基于 MAC。
- **认为 SLAAC 完全不需要服务器。** 地址配置确实不需要，但 DNS 等参数仍需 RDNSS（RFC 6106）或 DHCPv6。
- **把 DAD 当成强一致性机制。** DAD 只能检测「探测那一刻」的冲突，若两台主机几乎同时探测，二者都可能通过（重复地址极小概率但非零）。
- **关闭 DAD 以加速启动。** 会显著提高地址冲突概率，尤其在克隆虚拟机批量开机时；应改用乐观 DAD（RFC 4429）或增强 DAD（RFC 7527）。
- **把「/64」当作可调项。** SLAAC 的 IID 是 64 位，因此 A 标志的前缀必须是 /64，否则主机无法拼接；非 /64 只能用 DHCPv6。
- **忽略 `deprecated` 状态。** 前缀被撤销后地址不会立即失效，仍可维持存量连接，会导致「看起来还在用旧地址」的现象。
- **认为隐私地址可以替代稳定地址。** 临时地址用于出站，入站连接需要稳定地址（或 DNS 记录），二者需并存。

## 七、与开源书·权威来源对应

- RFC 4862《IPv6 Stateless Address Autoconfiguration》：地址生成、tentative/preferred/deprecated/invalid 状态机与 DAD 的规范定义。
- RFC 4861《Neighbor Discovery for IP version 6》：RS/RA/NS/NA/Redirect 五类报文、前缀信息选项与 A/L/M/O 标志。
- RFC 4941《Privacy Extensions for Stateless Address Autoconfiguration in IPv6》：临时地址生成与生命周期建议值。
- RFC 7217《A Method for Generating Semantically Opaque Interface Identifiers》：稳定不透明 IID 的 PRF 构造与安全检查。
- RFC 6106《IPv6 Router Advertisement Options for DNS Configuration》：RDNSS/DNSSL 选项，使纯 SLAAC 组网可用。
- RFC 4429《Optimistic DAD》：乐观地址状态与启动延迟优化。
- Tanenbaum《Computer Networks》第5章：IPv6 地址结构与自动配置的定位。
- Linux `net/ipv6/addrconf.c`：SLAAC 状态机、`addr_gen_mode` 与 DAD 的真实实现。

## 八、面试题

1. **SLAAC 如何保证地址不冲突？**
   要点：通过 DAD——配置前把地址置为 tentative，向请求节点组播发 NS（源地址为 `::`），若无 NA 应答则认为唯一。冲突概率随 IID 空间指数下降，但并非绝对不可能。

2. **为什么 SLAAC 的前缀必须是 /64？**
   要点：接口标识符固定为 64 位，前缀也必须是 64 位才能拼成 128 位地址。长度不为 64 的前缀无法用于 A 标志，只能改用 DHCPv6。

3. **隐私扩展与 RFC 7217 稳定 IID 的区别？**
   要点：隐私扩展生成随机地址并定期轮换，用于出站以抗追踪；RFC 7217 用带密钥 PRF 生成「同网络内稳定、跨网络不可预测」的地址，便于服务器侧可预期性。生产中常同时使用两者。

4. **RA 中的 A/M/O 标志分别是什么意思？**
   要点：A（Autonomous）表示该前缀可用于 SLAAC；M（Managed）表示地址应通过 DHCPv6 获取；O（Other）表示其他配置（DNS、NTP）应通过 DHCPv6 获取。三者可组合。

5. **为什么克隆虚拟机容易出现 IPv6 地址冲突？**
   要点：若 IID 由镜像中的固定值或固定随机种子生成，批量开机后会得到相同地址，DAD 同时失败或成规模冲突。解法是每台机器重新生成 IID（如 `addr_gen_mode=2`）或由平台注入唯一值。

## 九、演进与趋势

SLAAC 的演进围绕「更快」与「更安全」。启动延迟方面，乐观 DAD（RFC 4429）允许地址在探测期间有限使用；增强 DAD（RFC 7527）让主机在冲突时主动使用邻居的 MAC 作为源发送 NS，使对端能直接判定冲突而无需等待。二者共同把 DAD 的秒级延迟压缩到毫秒级。

安全方面，SEND（RFC 3971）用密码学签名（CGA，加密生成地址）保护 NS/NA/RA，使邻居发现可被验证；但由于部署复杂、需要 PKI 支持，实际普及有限，更多依赖 RA Guard、NDP 监控等交换机侧手段。

在多网络接口与多宿主场景，RFC 6724 的默认地址选择规则（最长前缀匹配、优先选择范围、优先源地址与目的地址匹配等）决定了 `getaddrinfo` 返回的地址顺序与内核实际选用的源地址，是 SLAAC 多地址环境下的关键配套机制。容器与移动网络（5G 的 IPv6-only 承载）进一步推动了纯 SLAAC + RDNSS 的部署形态。

## 十、小结

SLAAC 用「RA 提供前缀 + 主机自行生成 IID」的两步法，把地址配置从「服务器下发」变成「主机推导」，消除了中心化依赖。DAD 保证唯一性，隐私扩展（RFC 4941）与稳定不透明 IID（RFC 7217）分别解决抗追踪与可预期性，地址生命周期状态机则让前缀撤销自然生效而无需显式回收。

需要记住三个边界：前缀必须是 /64；SLAAC 不负责 DNS（需 RDNSS 或 DHCPv6）；DAD 只是概率性唯一而非强一致。理解这三点，才能正确设计企业网与云计算环境中的 IPv6 地址方案。
