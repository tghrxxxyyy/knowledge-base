# NAT穿透与STUNTURNICE

> 对应 RFC 8489（STUN，替代 RFC 5389）、RFC 8656（TURN，替代 RFC 5766）、RFC 8445（ICE）与 RFC 8838（Trickle ICE）。

## 一、背景与挑战
NAT 让内网主机「能出不能进」：出站首包建立映射，入站只在匹配已有映射且满足过滤规则时才能通过。两个位于不同 NAT 之后的主机想直接建立连接时，双方都不知道自己在公网的映射端点，也不知道对方能否到达自己——这是 P2P 通信、实时音视频与在线游戏的核心难题。
若完全依赖中继，带宽成本随会话数线性增长；若完全不依赖中继，对称 NAT 场景又必然失败。因此需要一套**分层协商**机制：先发现自己的公网映射，再交换候选地址并实测连通性，全部失败时用中继兜底。这就是 STUN + ICE + TURN。

## 二、核心原理
**STUN 的角色是「地址反射镜」**，不转发数据。客户端发送 Binding 请求，服务器在响应中回填客户端所见的源端点：$(IP_{pub}, port_{pub}) = \text{XOR-MAPPED-ADDRESS}(\text{请求源地址})$。STUN 报文由 20 字节头（类型、长度、4 字节魔术字 `0x2112A442`、96 位事务 ID）与 TLV 属性组成；`XOR-MAPPED-ADDRESS` 把地址与端口同魔术字（及事务 ID 高位）异或，避免中间设备误判并防止 NAT 重写该属性；`MESSAGE-INTEGRITY` 用 HMAC-SHA1 保护完整性，`FINGERPRINT` 用 CRC-32 区分 STUN 与其他协议；认证分短期与长期凭据两种机制。
**ICE 的角色是「路径协商」**。它把可用地址枚举为候选：`host`（本机接口地址）、`srflx`（server-reflexive，经 STUN 发现的公网映射）、`prflx`（peer-reflexive，连通性检查中从对端报文学到的地址）、`relay`（TURN 中继地址）。候选优先级为

$$ priority = (2^{24}) \cdot type\_pref + (2^{8}) \cdot local\_pref + (256 - component\_id) $$

其中 `type_pref` 通常取 host=126、prflx=110、srflx=100、relay=0。候选对优先级为

$$ pair\_priority = 2^{32} \cdot \min(G, D) + 2 \cdot \max(G, D) + \begin{cases} 1 & G > D \\ 0 & G \le D \end{cases} $$

ICE 按优先级顺序对候选对发送 STUN Binding 请求（连通性检查），通过后进入 `Succeeded`；角色（controlling/controlled，由 `ICE-CONTROLLING`/`ICE-CONTROLLED` 与 tie-breaker 决定）在成功后选择最终使用的候选对（nomination）。可采用「激进提名」（第一个成功即选中）或「常规提名」（等待更高优先级候选）。
**TURN 的角色是「中继兜底」**。客户端向 TURN 服务器申请一个分配（Allocation），服务器分配公网中继地址与端口。此后必须为对端 IP 显式安装**权限**，服务器才转发该 IP 的入站报文（防止被当作开放中继）；可用 `ChannelBind` 把对端绑定到 16 位通道号，之后数据用 4 字节 `ChannelData` 头封装（比 36 字节的 `Send`/`Data` 指示省带宽）。传输上可用 UDP、TCP、TLS。TURN 保证可达但把全部流量搬到服务器，因此优先级被刻意设为最低。
**打洞（hole punching）**是这一切的基础：当两端几乎同时向对方的 `srflx` 地址发包时，各自的出站包会在自己的 NAT 上创建「向对端」的映射与过滤许可，随后到达的对端报文恰好命中该许可而被放行。UDP 打洞成功率高，TCP 打洞（同时打开）成功率显著更低，因为 NAT 与协议栈对同时打开的容忍度差异很大（TCP 的 ICE 见 RFC 6544）。

## 三、形式化与数学基础
候选集合是各来源的并集：$C = C_{host} \cup C_{srflx} \cup C_{prflx} \cup C_{relay}$。连通性检查的成功集合为

$$ S = \left\{ (i, j) \;\middle|\; check(c_i, c_j) = Succeeded \right\} $$

选中的候选对是成功集合中优先级最高者：$(i^*, j^*) = \arg\max_{(i,j) \in S} pair\_priority(c_i, c_j)$。若 $S = \varnothing$，本次 ICE 失败（需重启 ICE 或依赖已预先选定的 relay）。
打洞成功的直觉解释是：两端需同时在其 NAT 上存在「出站映射到对端」与「入站许可来自对端」。对锥形 NAT（端点无关映射 EIM），映射与目标无关，一旦任一方发过包，对端就能命中；对**对称 NAT**（地址端口相关映射 APDM），每次访问新目标都分配新端口，即 $ext(i, d_1) \ne ext(i, d_2)$（$d_1 \ne d_2$），对端无法预知应发往哪个外部端口，打洞失败概率极高。
此时可尝试**端口预测**（生日悖论式扫描）：若对端外部端口在 $N$ 个可能值中近似随机选取，己方尝试 $k$ 个源端口、对端尝试 $m$ 个目标端口，命中概率约为

$$ \Pr(hit) \approx \frac{k \cdot m}{N} $$

当 $N \approx 2^{16}$ 时，达到可接受命中率需要上万次探测，代价与安全告警都不可接受，因此工程上宁可转向 TURN。

## 四、代码实现
```python
# 用 STUN 发现自身公网映射（示意；生产代码建议使用 aioice/aiortc 等成熟库）
import os
import socket
import struct

MAGIC_COOKIE = 0x2112A442
BINDING_REQUEST = 0x0001

def stun_binding(server=("stun.example.org", 3478), timeout=1.0):
    txid = os.urandom(12)
    header = struct.pack("!HHI", BINDING_REQUEST, 0, MAGIC_COOKIE) + txid
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    sock.sendto(header, server)
    data, _ = sock.recvfrom(2048)
    # 解析 TLV：type(2) len(2) value(len)，len 按 4 字节对齐
    # 关键属性：0x0020 = XOR-MAPPED-ADDRESS
    return data
```

```python
# ICE 候选优先级与候选对优先级（RFC 8445 规定公式）
def candidate_priority(type_pref, local_pref, component_id):
    # type_pref: host=126, prflx=110, srflx=100, relay=0
    return (1 << 24) * type_pref + (1 << 8) * local_pref + (256 - component_id)

def pair_priority(g, d):
    return (1 << 32) * min(g, d) + 2 * max(g, d) + (1 if g > d else 0)

host  = candidate_priority(126, 65535, 1)
srflx = candidate_priority(100, 65535, 1)
relay = candidate_priority(0,   65535, 1)
print(pair_priority(host, srflx), pair_priority(host, relay))
# 含 relay 的候选对优先级恒低于 host/srflx 组合，实现“直连优先、中继兜底”
```

```text
# WebRTC 的 STUN/TURN 配置与本地候选行形式（信令通道负责交换 SDP）
iceServers = [
  { urls: "stun:stun.example.org:3478" },
  { urls: "turn:turn.example.org:3478?transport=udp", username: "user", credential: "pass" }
]
a=candidate:1 1 udp 2130706431 192.0.2.10 50000 typ host
a=candidate:2 1 udp 1694498815 198.51.100.7 50071 typ srflx raddr 192.0.2.10 rport 50000
a=candidate:3 1 udp 16777215 203.0.113.9 49152 typ relay raddr 0.0.0.0 rport 0
```

## 五、与其他技术对比
| 维度 | STUN | TURN | ICE | UPnP/PCP | 纯服务器中继（SFU） |
| --- | --- | --- | --- | --- | --- |
| 作用 | 发现公网映射 | 转发数据 | 协商可用路径 | 请求网关建映射 | 应用层转发 |
| 是否转发媒体 | 否 | 是 | 否（只协商） | 否 | 是 |
| 依赖对端配合 | 不需要 | 不需要 | 需要（双向检查） | 不需要 | 不需要 |
| 对称 NAT 下可用 | 帮助有限 | 可用 | 视情况（常落回 relay） | 仍不可用 | 可用 |
| 带宽成本 | 极低 | 高（全部走服务器） | 低（成功时 P2P） | 低 | 高 |
| 部署复杂度 | 低 | 中高（需大带宽与配额） | 中（需信令与凭据） | 依赖网关 | 中 |

ICE 的设计哲学是「**先便宜后昂贵**」：优先级公式把 relay 压到最低，保证只要直连可行就不会使用中继。这与「纯打洞」（省带宽但对称 NAT 下必然失败）和「纯中继」（稳定但成本高）形成互补三角。

## 六、常见误区
- **误区一：有 STUN 就一定能打洞。** STUN 只告诉你「你的公网映射是什么」，不负责可达性。对称 NAT 下每次访问新目标都换外部端口，对端无法预知目标端口，必须回落到 TURN。
- **误区二：把 STUN 服务器当中继。** STUN 只回显地址，不转发任何数据；把它当中继配置会导致连接完全不通。
- **误区三：以为 ICE 只需一次候选交换。** ICE 有完整状态机（候选对在 `Frozen`/`Waiting`/`In-Progress`/`Succeeded`/`Failed` 间迁移）、角色协商、nomination，以及失败后的 ICE 重启。
- **误区四：忽略 `prflx` 与角色冲突。** 对端报文中出现的未预期地址要作为 peer-reflexive 候选纳入；两端同时声明同一角色时需按 tie-breaker 与错误响应重新协商。
- **误区五：忽略 TURN 的配额与安全。** TURN 必须鉴权、限制分配数与带宽，并只对已安装权限的 IP 转发，否则会被滥用为开放中继或放大器。
- **误区六：以为 TCP 打洞与 UDP 一样容易。** TCP 需要「同时打开」这一不常被 NAT 与协议栈支持的特性，成功率远低于 UDP。

## 七、与开源书·权威来源对应
- RFC 8489 定义 STUN 的报文结构、事务模型、`XOR-MAPPED-ADDRESS` 与认证机制（取代 RFC 5389）。
- RFC 8656 定义 TURN 的分配、权限、通道与数据封装（取代 RFC 5766），并给出 UDP/TCP/TLS 传输形态。
- RFC 8445 定义 ICE 的候选类型、优先级公式、候选对优先级、连通性检查与 nomination，是本文公式的直接来源。
- RFC 8838 定义 Trickle ICE（候选增量交换以缩短建立时间）；RFC 6544 定义 ICE 的 TCP 利用，二者与主体机制配合使用。
- Stevens《TCP/IP Illustrated》关于 UDP、TCP 连接建立与 ICMP 的章节可解释「映射 + 过滤许可」与同时打开的底层行为。

## 八、面试题
1. **ICE 为什么需要 TURN？**
   要点：当两端处于对称 NAT、双重 NAT 或严格企业策略下时打洞必然失败；TURN 以服务器中继保证可达性，代价是全部媒体走服务器，因此其候选优先级被设为最低。
2. **STUN 与 TURN 的本质区别？**
   要点：STUN 只做地址反射（Binding 请求/响应），不转发数据；TURN 是分配式中继，转发全部流量并需要权限与鉴权。二者常同时部署，由 ICE 决策使用哪一个。
3. **候选优先级公式为什么把 relay 设为 0？**
   要点：让 host/srflx 候选对天然优先，实现「直连优先、中继兜底」，在不牺牲可达性的前提下最小化服务器带宽。
4. **打洞成功的关键条件是什么？**
   要点：双方几乎同时向对方映射地址发包，使各自 NAT 上同时建立出站映射与入站许可；要求映射为端点无关或至少地址相关（锥形），对称 NAT 下条件难以满足。
5. **TURN 为什么需要 Permission 与 Channel 两套机制？**
   要点：Permission 按对端 IP 限制转发范围，防止中继被当作开放代理；Channel 把对端绑定到 16 位通道号以压缩封装开销（4 字节对 36 字节），高吞吐场景显著降低带宽消耗。

## 九、演进与趋势
WebRTC 把 ICE/STUN/TURN 标准化进浏览器与移动端，使这套机制成为跨 NAT 通信的事实标准；配套演进包括 Trickle ICE（不等候选收集完毕就交换）与 ICE 重启（网络切换后平滑重协商）。传输侧，QUIC（RFC 9000）用连接 ID 而非四元组标识连接，天然容忍 NAT 重绑定与迁移，其路径验证机制与 ICE 的连通性检查思想一脉相承。部署侧，TURN 的规模化（多云分布式中继、按区域就近中继）成为成本优化重点。长期看，IPv6 端到端可达性回归会降低打洞需求，但在双栈与 CGNAT 长期共存的现实下，ICE/STUN/TURN 仍将是不可或缺的基础设施。

## 十、小结
NAT 穿透的本质是一个分层协商问题：STUN 负责「我是谁」（发现公网映射），ICE 负责「我们怎么走」（枚举候选、按优先级实测连通性、nomination），TURN 负责「走不通时怎么办」（中继兜底，优先级最低）。掌握候选类型（host/srflx/prflx/relay）、两个优先级公式、以及对称 NAT 导致打洞失败的原因，就掌握了 WebRTC 与 P2P 实时通信的底层逻辑。工程上还要记住：STUN 不转发数据、TURN 必须鉴权与限流、TCP 打洞远比 UDP 困难。
