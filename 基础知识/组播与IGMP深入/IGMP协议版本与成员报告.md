# IGMP协议版本与成员报告

> 对应 RFC 1112 (v1) / RFC 2236 (v2) / RFC 3376 (v3)。

## 一、背景与挑战
路由器需要知晓某子网内是否有主机对某个组播组感兴趣，才能决定是否向该子网转发组播流。IGMP 是主机与直连路由器间的成员管理协议，其版本演进改进了离开延迟与源过滤。

## 二、核心原理
IGMPv1 主机发 Membership Report 加入，路由器靠查询超时判定离开。IGMPv2 增加 Leave Group 消息与特定组查询，缩短离开延迟。IGMPv3 支持源过滤（可指定包含/排除哪些源），是 SSM 的基础，报文类型含 Membership Report（含源列表）与 Query。

## 三、形式化与数学基础
IGMPv3 报告含过滤模式：
$$ mode = INCLUDE(S_1,\dots) \text{ 或 } EXCLUDE(S_1,\dots) $$
路由器据此维护 (S,G) 状态；查询间隔 $Q$ 与最大响应时间 $M$ 控制报告聚合：
$$ \text{report suppressed if already heard within } [0, M] $$

## 四、代码实现
Linux 查看 IGMP 状态：
```bash
cat /proc/net/igmp
ip maddr show
```
设置 IGMP 版本（接口）：
```bash
sysctl -w net.ipv4.conf.eth0.force_igmp_version=3
```

## 五、与其他技术对比
IGMP 是 IPv4 链路层成员协议，对应 IPv6 的 MLD（RFC 2710/3810）。MLDv2 功能等价于 IGMPv3，报文承载于 ICMPv6。

## 六、常见误区
误区一是报告每主机都发，实际有抑制机制避免风暴。误区二是 v3 才能用 SSM，v1/v2 不支持源过滤。

## 七、与开源书/权威来源对应
RFC 2236 与 RFC 3376 定义 v2/v3；RFC 4607 依赖 v3 源过滤；xiaolincoder 笔记提及 IGMP 作用。

## 八、面试题
问：IGMPv3 相比 v2 最大改进？答：支持源过滤（INCLUDE/EXCLUDE 指定源），支撑 SSM 只接收期望源，避免无关源流量。

## 九、演进与趋势
MLDv2 在 IPv6 中对应；轻量组播在数据中心因运维复杂常改用应用层复制或 SDN 组播。

## 十、小结
IGMP 管理主机对组播组的成员关系，v2 加快速离开、v3 加源过滤，是组播转发状态在接入段建立的前提。
