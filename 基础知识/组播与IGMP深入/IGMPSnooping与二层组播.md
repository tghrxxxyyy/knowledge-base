# IGMP Snooping与二层组播

> 对应 IEEE 802.1D 相关实践 与 RFC 4541 (Snooping)。

## 一、背景与挑战
二层交换机默认对未知目的 MAC 进行泛洪，组播帧若被广播到所有端口会浪费带宽并打扰无关主机。IGMP Snooping 让交换机「偷听」IGMP 报文，从而只在有成员的端口转发表。

## 二、核心原理
启用 Snooping 的交换机监听主机的 IGMP Report/Leave 与路由器的 Query，构建「组播 MAC → 端口集合」的转发表。收到组播数据帧时仅向对应成员端口转发，未加入的端口不接收。路由器端口需特殊识别以转发查询与接收报告。

## 三、形式化与数学基础
组播 MAC 由组播 IP 映射（IPv4 取低 23 位）：
$$ MAC = 01:00:5E:00:00:00 \mid (group\_ip \& 0x007FFFFF) $$
因此多个组可能映射同一 MAC，需 IGMP 状态区分。端口集合：
$$ Ports(G) = \{ p \mid p \text{ 有成员 report for } G \} $$

## 四、代码实现
Linux 桥接开启 snooping：
```bash
echo 1 > /sys/class/net/br0/bridge/multicast_snooping
bridge mdb show
```
交换机（厂商）通常全局使能：
```text
ip igmp snooping
```

## 五、与其他技术对比
无 Snooping 时组播在 VLAN 内泛洪，行为接近广播；Snooping 精确转发但需正确识别路由器端口，否则报告无法上送导致退化为泛洪。

## 六、常见误区
误区一是 Snooping 能跨三层工作，它只是二层优化。误区二是不配路由器端口也能正常，实际查询/报告交互会异常。

## 七、与开源书/权威来源对应
RFC 4541 规定 Snooping 原则；IEEE 802.1D 桥接；运营商与数据中心广泛部署。

## 八、面试题
问：为什么组播 IP 会映射到同一 MAC？答：IPv4 组播 MAC 只用 23 位承载组地址，32 位组地址压缩会冲突，需上层 IGMP 区分具体组。

## 九、演进与趋势
硬件卸载 MDB 表规模增大；EVPN 以 BGP 分发二层组播成员，支持跨数据中心 Snooping 状态同步。

## 十、小结
IGMP Snooping 通过监听成员报文在二层精确转发组播，避免 VLAN 内泛洪，是组播网络带宽效率的关键优化。
