# IGMP Snooping与二层组播

> 对应 RFC 4541（Considerations for Internet Group Management Protocol (IGMP) and Multicast Listener Discovery (MLD) Snooping Switches）与 IEEE 802.1D（桥接）。

## 一、背景与挑战

二层交换机对未知目的 MAC 默认泛洪（flood）。组播帧目的 MAC 通常不是已学习的单播地址，若直接泛洪，VLAN 内所有端口都收到——浪费带宽、打扰无关主机、还可能形成临时环路。IGMP Snooping 让交换机「偷听」主机的 IGMP 报文，从而在二层精确知道「哪个端口有某组的成员」，只往成员端口转发组播，把组播限制在需要的链路。没有 Snooping，二层组播实际上退化成广播，完全失去组播的带宽优势。这是数据中心与园区网部署组播的必备优化。

## 二、核心原理

启用 Snooping 的交换机监听三层 IGMP 交互：主机的 Report（加入）/Leave（离开）与路由器的 Query（通用组查询、特定组查询）。据此构建「组播 MAC → 成员端口集合」的 MDB（multicast database）。收到组播数据帧时仅向对应成员端口转发。路由器端口需被特殊识别：交换机要把路由器的 Query 转发给它、并把主机的 Report 上送给路由器（否则路由器收不到 Report 会停止转发该组）。未加入的端口不收数据帧，避免 VLAN 内泛洪。当成员离开（Leave）或查询超时无响应，交换机从 MDB 删除该端口；若无任何成员，则该组帧不再向此 VLAN 转发。Snooping 是纯二层行为，不改变三层组播协议。

## 三、形式化与数学基础

IPv4 组播 MAC 由组地址低 23 位映射（前缀 `01:00:5E:00:00:00`）：

$$ MAC = \text{01:00:5E:00:00:00} \mid (group\_ip\ \&\ \text{0x007FFFFF}) $$

由于只用 23 位承载 28 位组地址（D 类低 28 位），多个组会映射到同一 MAC（冲突率约 1/32），需上层 IGMP 状态区分具体组。成员端口集合：

$$ Ports(G)=\{\,p\mid p\text{ 收到过 }G\text{ 的 IGMP Report 且未 Leave}\,\} $$

数据帧仅向 $Ports(G)$ 与所有路由器端口转发。交换机维护 MDB 的更新规则：

$$ MDB(G) \leftarrow MDB(G)\cup\{p\}\ \text{on Report};\quad MDB(G)\setminus\{p\}\ \text{on Leave/timeout} $$

硬件 MDB 表项容量有限，超量时相关组退化为泛洪，需监控表使用率。

## 四、代码实现

```bash
# Linux 桥接开启 IGMP Snooping
echo 1 > /sys/class/net/br0/bridge/multicast_snooping
bridge mdb show          # 查看 MDB 表（组 -> 端口）

# 厂商交换机（示意）全局使能
# ip igmp snooping
# ip igmp snooping vlan 10
```

查看某组对应的二层端口：

```bash
bridge mdb show dev br0 | grep 01:00:5e
```

## 五、与其他技术对比

| 状态 | 转发行为 | 带宽 |
| --- | --- | --- |
| 无 Snooping | VLAN 内泛洪（近似广播） | 浪费 |
| 有 Snooping | 仅成员端口 | 精确 |
| Snooping 但无路由器端口 | Report 无法上送 → 退化为泛洪 | 浪费 |

正确识别路由器端口是关键；缺失会导致查询/报告交互异常、状态退化为泛洪。硬件 MDB 表项有容量上限，超大组播规模需关注表溢出。Snooping 不跨三层，跨子网建树仍靠 PIM/RPF。

## 六、常见误区

1. 以为 Snooping 能跨三层工作——它只是二层优化，跨子网仍需 PIM 等组播路由。
2. 不配路由器端口也能正常——实际路由器收不到 Report，会停止转发该组，最终退化为泛洪或断流。
3. 忽略 MAC 冲突——多个组共享同一 MAC 时，仅靠二层无法区分，需 IGMP 状态辅助。
4. 以为 Snooping 解决所有组播问题——它不建立跨交换机的组播树，那由 PIM/RPF 负责。
5. 以为 MDB 无限大——硬件表项有限，超量时可能退化为泛洪，需监控。
6. 忽略查询器角色——若网段无路由器发 Query，需配交换机作 IGMP Querier，否则成员超时后被清。

## 七、与开源书·权威来源对应

- RFC 4541：规定 Snooping 交换机的行为原则（转发规则、路由器端口识别、查询处理）。
- IEEE 802.1D：桥接与过滤数据库基础，MDB 即桥接表的组播扩展。
- 数据中心/运营商部署实践：MDB 规模与硬件表项限制是运维要点。
- RFC 4541 同时覆盖 MLD Snooping（IPv6），与 IGMP Snooping 机制同构。
- Tanenbaum《Computer Networks》ch5：交换机转发与泛洪的背景。

## 八、面试题

1. 为什么组播 IP 会映射到同一 MAC？
   要点：IPv4 组播 MAC 仅用 23 位承载组地址，28 位组地址压缩必冲突，需上层 IGMP 区分具体组。
2. 不配路由器端口会怎样？
   要点：主机 Report 无法上送路由器，路由器停止转发该组，Snooping 退化为泛洪或断流。
3. Snooping 与组播路由的关系？
   要点：Snooping 管二层精确转发，组播路由（PIM/RPF）管跨子网建树，二者各司其职。
4. MDB 表溢出有何后果？
   要点：超出硬件容量时相关组退化为泛洪，带宽优势丧失，需扩容或限速。
5. 为何需要 IGMP Querier？
   要点：无路由器时交换机需代发 Query，否则成员状态超时清除，组播断流。

## 九、演进与趋势

在 EVPN/VXLAN 数据中心，二层组播成员状态通过 BGP 在跨越子网与机柜间同步，Snooping 扩展到 fabric 级。把 IGMP Querier 下沉到每个 leaf 交换机，避免依赖外部路由器。

- 硬件遥测可实时上报 MDB 表使用率，预防溢出导致泛洪，提前扩表或限速。
- 对时延敏感的金融行情场景，Snooping 精度直接决定抖动与尾延迟表现。
- 在虚拟化环境中，vSwitch 的 Snooping 实现直接影响东西向组播带宽与隔离性。

硬件卸载 MDB 表规模增大；EVPN 以 BGP 分发二层组播成员状态，支持跨数据中心 Snooping 同步；IGMP/MLD Querier 功能下沉到接入交换机，减少对路由器的依赖。在容器/虚拟化场景，vSwitch 的 Snooping 实现直接影响东西向组播带宽。基于 Telemetry 的 MDB 表使用率监控，帮助提前发现溢出风险。

## 十、小结

IGMP Snooping 通过监听成员报文在二层精确转发组播，避免 VLAN 内泛洪，是组播网络带宽效率的关键优化。其正确性高度依赖「路由器端口识别」与「MDB 维护」——忽略二者，优化反而退化成问题。记住：Snooping 只解决二层，跨子网建树仍靠 PIM/RPF，且 MDB 表容量是隐性上限。
