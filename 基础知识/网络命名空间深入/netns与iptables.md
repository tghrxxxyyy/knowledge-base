# netns与iptables

> 对应 Linux man iptables(8) 与 network_namespaces(7)；参考 Vonng/ddia。

## 一、背景与挑战
每个 netns 拥有独立 iptables/nftables 规则与 conntrack 表。容器网络策略、NAT、端口映射都落在各自 netns 中。

## 二、核心原理
规则按 netns 隔离：在 ns1 中 `iptables -L` 看不到宿主规则。典型用途：容器出网 MASQUERADE、入站 DNAT 端口映射、网络策略 ACL。

## 三、形式化与数学基础
NAT 链顺序：
  PREROUTING(DNAT) -> FORWARD -> POSTROUTING(MASQUERADE)
conntrack 状态机：
  NEW -> ESTABLISHED -> RELATED
端口映射：
  host:8080 -> DNAT -> 10.0.0.2:80

## 四、代码实现
# 在命名空间内配置 NAT
ip netns exec ns1 iptables -t nat -A POSTROUTING -s 10.0.0.0/24 -j MASQUERADE
ip netns exec ns1 iptables -A FORWARD -i br0 -o br0 -j ACCEPT
# 宿主端口映射
iptables -t nat -A PREROUTING -p tcp --dport 8080 -j DNAT --to 10.0.0.2:80

## 五、与其他技术对比
nftables 是 iptables 的现代替代，规则集更统一；eBPF 可在更早的 hook 处理。

## 六、常见误区
1. 在宿主配 DNAT 却忘了开转发 ip_forward=1。
2. 忽视 conntrack 表满导致新建连接丢包。

## 七、与开源书/权威来源对应
- Linux man iptables(8)
- network_namespaces(7)
- Vonng/ddia

## 八、面试题
netns 间 iptables 是否隔离？MASQUERADE 作用？如何做端口映射？

## 九、演进与趋势
Kubernetes 用 eBPF/Cilium 取代 iptables 做 Service 与 NetworkPolicy。

## 十、小结
netns 隔离规则表，iptables 在其内实现 NAT 与策略，是容器网络控制面。
