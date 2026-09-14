# UPnP与NAT-PMP自动端口映射

> 对应 RFC 6886（NAT Port Mapping Protocol）、RFC 6887（Port Control Protocol）、RFC 6888（Carrier-Grade NAT 通用要求），以及 UPnP Forum 的 Internet Gateway Device（IGD）规范。

## 一、背景与挑战
NAPT 的核心行为是「出站建表、入站查表」，因此**外部无法主动发起**到内网主机的连接。这对家庭与小型办公场景是硬约束：联机游戏需要被好友直连、P2P 客户端需要接受入站连接、监控摄像头与远程桌面需要外网可达。
传统解法是手工配置端口转发（静态映射），但要求用户理解内网 IP、端口与协议，且 DHCP 分配的内网地址一变配置就失效。自动端口映射协议的目标是：让内网主机**主动向网关申请**一条映射，并能在不再需要时撤销，即「即插即用的入站可达」。

## 二、核心原理
存在两条并行且不兼容的技术路线。
**路线一：UPnP IGD（SSDP 发现 + SOAP 控制）。** 分三步：一是**发现**——客户端向组播地址 `239.255.255.250:1900` 发送 SSDP `M-SEARCH`（HTTPU 风格，走 UDP），网关以 `HTTP/1.1 200 OK` 单播响应，其中 `LOCATION` 指向设备描述 XML；二是**描述**——GET 该 XML，解析出 `WANIPConnection:1`（或 `WANPPPConnection:1`）服务的控制 URL；三是**控制**——用 SOAP over HTTP 调用动作，核心动作包括 `GetExternalIPAddress`、`AddPortMapping`（参数含 `NewRemoteHost`/`NewExternalPort`/`NewProtocol`/`NewInternalPort`/`NewInternalClient`/`NewEnabled`/`NewPortMappingDescription`/`NewLeaseDuration`）、`DeletePortMapping` 与 `GetGenericPortMappingEntry`。
**路线二：NAT-PMP / PCP（轻量 UDP 请求-响应）。** NAT-PMP 由 Apple 提出：客户端向**默认网关**的 UDP 5351 端口发请求，操作码包括 `0`（请求外部地址）、`1`（映射 UDP）、`2`（映射 TCP），响应携带结果码、生存期与实际分配的外部端口。协议极简（请求头 2 字节版本加操作码，响应 4 字节），无 XML、无 HTTP、无多播。
PCP（RFC 6887）是 NAT-PMP 的继任者，保持轻量风格但大幅扩展能力：`MAP`（建立映射，可建议外部端口）、`PEER`（第三方映射，让 A 为 B 申请映射）、`ANNOUNCE`（通告当前外部地址）；支持 **IPv6**（申请前缀供内网分配、防火墙打孔）；带 nonce 与可选认证标签，防止同一 NAT 后的其他主机劫持映射；生存期过半前必须续约。PCP 报文为固定 24 字节起始头（版本、操作码、保留、生存期、客户端 IP），响应含 `RESULT_CODE`（如 `SUCCESS`、`NOT_AUTHORIZED`、`NO_RESOURCES`、`UNSUPP_VERSION`），无需解析 SOAP/XML，实现成本远低于 UPnP。
安全含义需要注意：NAT-PMP 与 UPnP IGD 的早期版本都**没有认证**——同一 NAT 后的任何主机（或任何能到达网关 5351/1900 端口的主机）都能创建映射，甚至可指定 `NewInternalClient` 指向别的内网主机做端口劫持。因此公网侧必须阻断 5351 与 1900，不信任网络应关闭 UPnP。

## 三、形式化与数学基础
映射请求是一个从「内部端点 + 协议 + 生存期」到「外部端点」的函数：

$$ \text{Map}(IP_{int}, port_{int}, proto, lifetime) \to (IP_{ext}, port_{ext}) $$

外部端口可能由网关自由选择（请求给 0 表示「请分配」）或由客户端建议（可能被拒绝）。生存期语义要求周期续约，最佳实践是在半衰期续约以容忍丢包：

$$ \text{renew at } t = \frac{T_{expire}}{2} $$

若在 $T_{expire}$ 内未收到续约，网关删除映射：$no\ renew\ for\ T_{expire} \Rightarrow mapping \notin table$。
端口分配竞争可量化：设端口池大小 $P$、已被其他主机占用 $U$，则一次请求成功的概率为

$$ \Pr(success) = \frac{P - U}{P} $$

当 $U \to P$ 时请求以 `NO_RESOURCES`（PCP）或对应错误码失败，这与 NAT 端口耗尽问题同源。

## 四、代码实现
```python
# 使用 miniupnpc 通过 UPnP IGD 建立映射
import miniupnpc

u = miniupnpc.UPnP()
u.discoverdelay = 200          # 毫秒
if u.discover() == 0:
    raise SystemExit("no IGD found")

igd = u.selectigd()            # 建立到网关的控制连接
print("external ip:", u.externalipaddress())
print("lan addr:", u.lanaddr)

# 建议外部端口 = 内部端口；生存期 3600 秒；空描述串表示不填
if not u.addportmapping(8080, 'TCP', u.lanaddr, 8080, 'demo', '', 3600):
    # 常见失败原因：网关不允许、端口被占用、UPnP 被关闭
    raise SystemExit("addportmapping failed")
# 多数实现需要按 1/2 生存期循环续约，否则映射到期即被删除
```

```c
/* NAT-PMP：向默认网关的 5351 端口发 UDP 请求（概念性示意） */
#include <string.h>

/* 映射 TCP 端口：版本=0，操作码=2，保留 2 字节，内部端口，建议外部端口，生存期 */
static void build_map_tcp(unsigned char buf[12], unsigned short in_port,
                          unsigned short sug_ext_port, unsigned int lifetime) {
    memset(buf, 0, 12);
    buf[1] = 0x02;                                    /* opcode: map TCP */
    buf[4] = (unsigned char)(in_port >> 8);
    buf[5] = (unsigned char)(in_port & 0xff);
    buf[6] = (unsigned char)(sug_ext_port >> 8);
    buf[7] = (unsigned char)(sug_ext_port & 0xff);
    buf[8]  = (unsigned char)(lifetime >> 24);
    buf[9]  = (unsigned char)(lifetime >> 16);
    buf[10] = (unsigned char)(lifetime >> 8);
    buf[11] = (unsigned char)(lifetime & 0xff);
    /* 实际工程应使用 libnatpmp 等成熟库并处理重传（UDP 不可靠） */
}
```

```bash
# 安全核查：应阻断来自 WAN 的 UDP/5351（NAT-PMP/PCP）与 UDP/1900（SSDP）
# PCP 客户端用法示例（具体参数以工具官方文档为准）
pcp map --protocol tcp --internal-port 8080 --lifetime 3600 --gateway 192.168.1.1
```

## 五、与其他技术对比
| 维度 | UPnP IGD | NAT-PMP | PCP | 手工静态转发 | TURN 中继 |
| --- | --- | --- | --- | --- | --- |
| 发现方式 | SSDP 组播（1900/udp） | 直接发默认网关 5351/udp | 同 NAT-PMP，可配服务器 | 人工 | 客户端预配置 |
| 控制协议 | SOAP over HTTP + XML | 二进制 UDP | 二进制 UDP | 无 | 二进制/TLS |
| 认证 | 原始规范无（IGD:2 改进） | 无 | 有（nonce + 认证标签） | 依赖路由器管理面 | 强（凭据） |
| IPv6 支持 | 有限 | 无 | 有（前缀映射） | 不适用 | 有 |
| 生存期与续约 | 支持 | 支持（建议 1/2 续约） | 支持 | 无 | 不适用 |
| 主要风险 | 无认证导致映射被滥用 | 同左（可做内网端口劫持） | 显著降低 | 配置漂移 | 带宽成本 |

UPnP IGD 的优势是生态广泛（几乎所有家用路由器都支持）与功能完整；劣势是实现臃肿、攻击面大。NAT-PMP/PCP 的优势是极简与可靠，缺点是需要网关显式支持。TURN 中继是「最后手段」：不依赖网关配合，但把带宽成本转移到服务器侧。

## 六、常见误区
- **误区一：开启 UPnP 一定方便且安全。** 事实相反：早期 IGD 规范没有认证，局域网内任何主机都可创建映射，甚至指定别的主机为 `NewInternalClient` 做端口劫持；SSDP 也曾被用于反射放大攻击。加固要求是公网侧阻断 1900/5351、默认关闭 UPnP、仅在受信网络显式开启，并优先选择带认证的实现。
- **误区二：映射一旦建立就永久有效。** 映射带生存期，到期后网关删除；客户端必须在生存期过半时续约，否则表现为「一开始能用，过一段时间突然连不上」。
- **误区三：把 UPnP 当作穿透的通用答案。** 它只解决「网关本身可被申请」的情形；对称 NAT、CGNAT、以及关闭 UPnP 的网关都无法处理，仍需 STUN/ICE/TURN。
- **误区四：以为请求的端口一定被采纳。** 建议端口可能冲突或被策略拒绝，响应中的实际端口才是权威值。
- **误区五：忽略协议字段。** 映射必须区分 TCP/UDP，只映射 TCP 会导致 QUIC 等 UDP 流量仍不可达。

## 七、与开源书·权威来源对应
- RFC 6886 定义 NAT Port Mapping Protocol 的报文格式、操作码与生存期/续约语义。
- RFC 6887 定义 Port Control Protocol，包括 `MAP`/`PEER`/`ANNOUNCE` 操作、认证与 IPv6 前缀映射。
- RFC 6888 给出运营商级 NAT 的通用要求，含端口分配与日志留存，可与家庭网关映射行为对照。
- UPnP Forum 的 IGD 规范与 `WANIPConnection` 服务模板定义 SSDP/SOAP 的动作集，具体版本以官方最新规范为准。
- Stevens《TCP/IP Illustrated》关于 UDP 与 ICMP 的章节可用于理解 NAT-PMP 在 UDP 上的可靠性设计（协议本身不做重传，需应用层处理）。

## 八、面试题
1. **UPnP 与 NAT-PMP 的主要区别？**
   要点：发现与控制方式不同——UPnP IGD 走 SSDP 组播发现加 SOAP/HTTP 控制，协议栈重、攻击面大；NAT-PMP/PCP 直接向网关发二进制 UDP 请求，极简且 PCP 支持认证与 IPv6 前缀映射。
2. **映射为什么需要续约？**
   要点：网关为每个映射设定生存期，到期自动删除以回收端口资源；客户端应在生存期过半时续约，容忍报文丢失，避免映射在使用中失效。
3. **为什么说 UPnP 是安全风险？**
   要点：早期规范无认证，局域网内任意主机可创建或劫持映射；SSDP 可被用于反射放大；缓解手段是公网侧阻断 1900/5351、默认关闭、按需显式开启、使用带认证的实现。
4. **NAT-PMP 在 UDP 上如何保证可靠性？**
   要点：协议本身不保证；客户端按固定间隔重传并对响应做校验（版本、操作码、结果码、客户端地址），超时视为网关不支持。
5. **PCP 的 `PEER` 操作用来解决什么？**
   要点：允许内网主机 A 请求网关为「另一个端点 B」建立映射，用于第三方协调场景，并需通过认证限制滥用。

## 九、演进与趋势
趋势是从「网关自治的私有协议」走向「可认证、可审计、支持 IPv6」的 PCP：RFC 6887 明确定位为 NAT-PMP 的替代，并已被部分 CPE 与 UPnP IGD:2 生态吸收。安全加固成为默认要求——多数家用路由器出厂仍开启 UPnP，但主流固件与运营商策略倾向默认关闭或限制为仅受信接口，企业网络普遍阻断 SSDP 与 5351。另一条平行路线是**放弃依赖网关**：WebRTC 的 ICE/STUN/TURN 不要求路由器配合，成为跨 NAT 通信的事实标准。IPv6 普及后，端到端可达性回归会进一步降低对端口映射协议的依赖，但 UPnP/PCP 在「需要长期被动监听端口」的服务（监控、远程桌面、家用 NAS）上仍有不可替代的位置。

## 十、小结
UPnP IGD、NAT-PMP 与 PCP 共同解决「NAPT 阻断入站」带来的可达性问题：内网主机主动向网关申请「外部端点 ↔ 内部端点」的映射，并携带生存期以支持自动回收。UPnP 生态最广但协议最重且早期无认证；NAT-PMP 极简但能力有限；PCP 在保持轻量的同时补齐认证、IPv6 前缀映射与第三方映射，是演进方向。工程上必须记住三点：映射需要按半衰期续约、建议端口不一定被采纳、无认证的映射能力本身就是攻击面。
