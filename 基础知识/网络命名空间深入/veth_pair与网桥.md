# veth pair与网桥

> 对应 Linux man veth(4) 与 bridge(8)；参考 Docker 网络模型文档。

## 一、背景与挑战
netns 之间、容器与宿主之间需要连通。veth pair 提供跨 ns 的虚拟以太网线，Linux bridge 提供二层交换。

## 二、核心原理
- veth pair：一对虚拟网卡，一端在 A netns，另一端在 B，数据从一端进从另一端出。
- bridge：虚拟交换机，把多个 veth、物理口桥接同一二层域，配合 MAC 学习转发。

## 三、形式化与数学基础
veth 对：
  vethA <-> vethB  (跨 ns 管道)
bridge 转发决策（二层）：
  if (dst_mac in fdb) forward to port
  else flood to all ports
容器常用：容器 veth -> 宿主 bridge (docker0) -> 物理网卡（经 NAT）。

## 四、代码实现
# 建立容器到宿主的连通
ip link add veth0 type veth peer name veth1
ip link set veth1 netns ns1
ip netns exec ns1 ip addr add 10.0.0.2/24 dev veth1
ip netns exec ns1 ip link set veth1 up
ip link set veth0 master br0   # 接入网桥
ip link set veth0 up

## 五、与其他技术对比
veth 是点对点二层；macvlan 让容器直接共享物理口；overlay 用于跨主机。

## 六、常见误区
1. 忘记在两端都 up 接口导致不通。
2. 混淆 bridge（二层）与 router（三层 NAT）。

## 七、与开源书/权威来源对应
- Linux man veth(4), bridge(8)
- Docker 网络文档
- xiaolincoder/hello-http

## 八、面试题
veth pair 是什么？bridge 如何转发？容器网络怎么连外网？

## 九、演进与趋势
eBPF 加速的容器网络（Cilium）逐步替代 iptables 做策略。

## 十、小结
veth + bridge 是单主机容器网络的标准拼图，理解二层转发是排障基础。
