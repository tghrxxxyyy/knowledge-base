# 容器网络与netnamespace

> 对应 Baumann 2015 容器/隔离讨论与 kernel 文档 `network-namespaces.rst`。

## 一、背景与挑战
容器需独立网络栈（自身 IP、端口、路由、防火墙）却共享宿主内核协议栈。network namespace 提供独立 netns，配合 veth 对与网桥连通宿主与外部。

## 二、核心原理
新 netns 有独立 `lo`、路由表、iptables、端口空间。veth pair 像管道：一端在宿主 netns、一端在容器 netns，宿主端接 bridge（如 docker0），容器端配 IP 作默认网关。NAT（iptables MASQUERADE）使容器出网共享宿主 IP。

## 三、形式化与数学基础
地址空间隔离：
$$port(p, ns_a) \ne port(p, ns_b)\quad 可同时占用$$
连通：容器 $veth_c \leftrightarrow bridge \leftrightarrow veth_h \to NAT \to eth0 \to ext$。带宽受 `cpu`/`net_cls` cgroup 与 tc 限制。

## 四、代码实现
```bash
ip netns add c1
ip link add veth0 type veth peer name veth1
ip link set veth1 netns c1
ip addr add 10.0.0.1/24 dev veth0
ip netns exec c1 ip addr add 10.0.0.2/24 dev veth1
ip netns exec c1 ip link set veth1 up
# 宿主侧 bridge + iptables MASQUERADE 出网
```

## 五、与其他技术对比
netns 独立栈轻量；VM 有独立协议栈更重。veth+bridge 软件交换；macvlan 直挂物理。相较 host 网络，隔离强但有 NAT 开销。

## 六、常见误区
误以为新 netns 有网络：仅 lo，需配 veth/路由。误以为端口全容器独立：同 netns 内才独立。误以为 NAT 不影响性能：有 conntrack 开销。

## 七、与开源书/权威来源对应
内核 network-namespaces 文档；Baumann 2015 轻量隔离；Docker 网络模型。

## 八、面试题
问：容器如何访问外网？答：veth→bridge→宿主 NAT(MASQUERADE)→物理网卡。问：netns 隔离了什么？

## 九、演进与趋势
CNI 标准统一容器网络；eBPF 加速 datapath 取代部分 iptables；ipvlan 提升密度。

## 十、小结
network namespace + veth/bridge/NAT 在共享内核上给容器独立网络视图，是容器联网基础。
