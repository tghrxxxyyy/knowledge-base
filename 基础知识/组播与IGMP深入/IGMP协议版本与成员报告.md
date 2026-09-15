# IGMP协议版本与成员报告

> 对应 RFC 1112（IGMPv1）/ RFC 2236（IGMPv2）/ RFC 3376（IGMPv3, MLDv2 对应 IPv6）。

## 一、背景与挑战

路由器需要知道「某子网内是否有主机对某个组播组感兴趣」，才能决定是否向该子网转发对应组播流。IGMP（Internet Group Management Protocol）就是主机与直连路由器之间的成员管理协议。其版本演进解决两个核心痛点：离开延迟（v1 靠查询超时被动发现离开，慢）与源过滤（v2 只能「加入任意源」，v3 才能「指定收哪些源」）。理解版本差异是组播互通、平滑升级与排错的基础——版本不匹配会导致成员状态建立失败或 SSM 不可用。

## 二、核心原理

IGMPv1（RFC 1112）：主机发 `Membership Report` 加入某组；路由器周期性发 `General Query`，靠「查询超时无回应」判定组空、停止转发。无显式离开机制，离开延迟高（需等若干查询周期）。IGMPv2（RFC 2236）：增加 `Leave Group` 消息与「特定组查询（Group-Specific Query）」——主机离开时主动发 Leave，路由器随即发特定组查询确认是否还有成员，显著缩短离开延迟；并引入「查询器选举」（同网段多个路由器选一个发查询）。IGMPv3（RFC 3376）：支持源过滤——Report 可带 `INCLUDE/EXCLUDE` 源列表，是 SSM 的基础；报文含多组记录，支持「状态变更增量报告」，减少带宽。

## 三、形式化与数学基础

IGMPv3 报告含过滤模式与源记录：

$$ mode = INCLUDE(\{S_1,\dots\})\ \text{或}\ EXCLUDE(\{S_1,\dots\}) $$

路由器据模式维护 (S,G) 状态。查询间隔 $Q$ 与最大响应时间 $M$ 控制报告聚合（抑制风暴）：

$$ \text{主机在 }[0,M]\text{ 内随机延时回复；若已听到他人 Report 则抑制自身} $$

离开延迟在 v2/v3 中被「特定组查询 + 最后成员查询」压缩：

$$ T_{leave} \approx LastMemberQueryInterval \times LastMemberQueryCount $$

远小于 v1 的「查询超时（约 $Q\times$ 健壮系数）」。查询器选举保证同网段只有一个路由器发 General Query，避免重复查询风暴：

$$ querier = \min_{r\in routers} IP(r) \quad (\text{地址最小者当选}) $$

## 四、代码实现

```bash
# 查看 Linux 接口 IGMP 状态
cat /proc/net/igmp
ip maddr show

# 强制接口使用指定 IGMP 版本
sysctl -w net.ipv4.conf.eth0.force_igmp_version=3

# 抓包观察 Query/Report（tcpdump）
tcpdump -i eth0 igmp
```

IPv6 对应协议为 MLD（MLDv1 ~ IGMPv2，MLDv2 ~ IGMPv3），承载于 ICMPv6：

```bash
ip -6 maddr show
tcpdump -i eth0 icmp6
```

## 五、与其他技术对比

| 版本 | 离开机制 | 源过滤 | 查询器选举 |
| --- | --- | --- | --- |
| IGMPv1 | 无（超时） | 否 | 无 |
| IGMPv2 | Leave + 特定组查询 | 否 | 有 |
| IGMPv3 | Leave + 源过滤 | 是（INCLUDE/EXCLUDE） | 有 |
| MLDv2（IPv6） | 等价 v3 | 是 | 有 |

IGMP 是 IPv4 链路层成员协议；对应 IPv6 的 MLD（RFC 2710/3810），MLDv2 功能等价于 IGMPv3，报文承载于 ICMPv6 而非独立协议号。

## 六、常见误区

1. 以为每主机都发 Report——实际有抑制机制（同组只一人发，避免风暴）。
2. 以为 v3 才可用 SSM——v1/v2 不支持源过滤，SSM 必须用 v3。
3. 以为 v2 的 Leave 立即生效——需路由器发特定组查询确认「最后成员」离开才停转发。
4. 混淆 IGMP（主机-路由器）与 PIM（路由器-路由器）——前者管成员，后者管跨网建树。
5. 以为版本可混用无代价——v3 主机在 v2 网段会退化为 v2 语义，源过滤失效。

## 七、与开源书·权威来源对应

- RFC 1112（Deering 1989）：IGMPv1，成员报告与通用查询。
- RFC 2236（Fenner 1997）：IGMPv2，Leave 与特定组查询、查询器选举。
- RFC 3376（Cain et al. 2002）：IGMPv3，源过滤，SSM 基础。
- RFC 4607：依赖 v3 源过滤实现 SSM。
- RFC 2710 / 3810：MLDv1 / MLDv2（IPv6 对应）。
- Tanenbaum《Computer Networks》ch5：IGMP 版本演进概述。

## 八、面试题

1. IGMPv3 相比 v2 最大改进？
   要点：支持源过滤（INCLUDE/EXCLUDE 指定源），支撑 SSM 只接收期望源，避免无关源流量。
2. v2 如何缩短离开延迟？
   要点：主机发 Leave，路由器回特定组查询确认最后成员，迅速停转发，而非等查询超时。
3. Report 抑制机制目的？
   要点：同组多主机只需一人发 Report，避免每成员都发造成链路风暴。
4. 为什么需要查询器选举？
   要点：同网段多路由器时只一个发 General Query，避免重复查询与状态冲突。

## 九、演进与趋势

MLDv2 在 IPv6 中对应 IGMPv3；轻量组播在数据中心因运维复杂常改用应用层复制或 SDN 组播；IGMP/MLD Querier 下沉到接入交换机，减少对接入路由器的依赖。随着 SSM 普及，IGMPv3 成为新部署的默认要求，v1/v2 主要存在于遗留设备。

## 十、小结

IGMP 管理主机对组播组的成员关系：v1 靠超时、v2 加快速离开、v3 加源过滤。它是组播转发状态在接入段建立的前提——没有 IGMP，路由器无从得知该不该向子网转发某组流。理解版本差异与抑制机制，方能在混合组网中正确部署 SSM 与避免成员状态错乱。
