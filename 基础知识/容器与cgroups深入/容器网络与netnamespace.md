# 容器网络与netnamespace

> 对应 kernel 文档 network-namespaces.rst 与 veth/bridge 内核文档；Docker 网络模型。

## 一、背景与挑战

容器需要独立的网络栈——自己的 IP、端口、路由表、防火墙规则——却又共享宿主内核协议栈。若每个容器都直接绑宿主端口会冲突且无法隔离。Linux 的 network namespace（netns）提供独立的网络视图，再配合 veth 对（veth pair）、网桥（bridge）与 NAT 把容器连到宿主与外部网络。这是「看起来像独立主机、实则共享内核」的关键一环。

隔离与连通是一对矛盾：太隔离则容器上不了网，太连通则失去隔离。容器网络的工程核心就是在这之间取得平衡，并兼顾性能（NAT 有 conntrack 开销）与可观测性（CNI 标准化）。

第三类难点是「地址规划与转发环」：默认 Linux 不转发容器间流量（`ip_forward` 关闭时），且若忘记为 FORWARD 链放行，会出现「能 ping 通宿主、ping 不通外网」这类典型症状。理解数据包在四个位置（容器 ns、veth、网桥、宿主 NAT）的流向，是排查此类问题的唯一可靠方法。

## 二、核心原理

新建一个 netns 后，它自带独立的 `lo`、独立的路由表、独立的 iptables/nftables 规则与独立的端口空间。veth pair 是一种「管道式」虚拟网卡：一端放进容器 netns、另一端留在宿主 netns（或接到网桥），两端像一根虚拟网线互发帧。宿主侧通常把另一端接到 Linux 网桥（如 `docker0`），由网桥做二层转发；容器侧配 IP 并把网桥设为默认网关。

容器出公网时，宿主用 iptables 的 `MASQUERADE` 做源地址转换（SNAT），把容器私有 IP 改成宿主公网 IP，回包再由 conntrack 表反向 NAT 回来。入方向暴露服务则靠 `DNAT`（端口映射）。这套机制让成百容器共用一个宿主出口 IP，同时保持各自的网络命名空间隔离。

网桥本身是一个二层交换设备：它学习 MAC 与端口的映射（FDB），同网段容器间通信无需经过宿主三层栈，直接二层转发；只有跨网段/出网才上升为三层经 NAT。这一点解释了为何「容器间互访很快而访问外网较慢」。

## 三、形式化与数学基础

地址空间隔离：同一端口 $p$ 在不同 netns 中可同时占用且互不冲突：

$$ port(p, ns_a) \ne port(p, ns_b)\quad 可同时绑定 $$

连通路径（容器出网）：

$$ veth_c \leftrightarrow bridge \leftrightarrow veth_h \xrightarrow{MASQUERADE} eth0 \to ext $$

回包经 conntrack 表反向映射回对应容器。带宽与隔离还受 `net_cls`/`net_prio` cgroup 与 `tc`（traffic control）整形限制，实现容器间公平带宽。

| 流量方向 | 关键机制 | 表/链 |
| --- | --- | --- |
| 容器 → 外网 | SNAT（源地址改写） | nat/POSTROUTING |
| 外网 → 容器服务 | DNAT（端口映射） | nat/PREROUTING 或 DOCKER 链 |
| 容器 ↔ 容器（同网段） | 网桥二层转发 | FDB 学习 |
| 回包 | conntrack 反查 | conntrack 表 |

## 四、代码实现

```bash
# 创建 netns 并用 veth pair 连通宿主网桥
ip netns add c1
ip link add veth0 type veth peer name veth1
ip link set veth1 netns c1                 # 一端移入容器
ip addr add 10.0.0.1/24 dev veth0
ip link set veth0 up

ip netns exec c1 ip addr add 10.0.0.2/24 dev veth1
ip netns exec c1 ip link set veth1 up
ip netns exec c1 ip route add default via 10.0.0.1  # 网关指向宿主侧

# 宿主侧接网桥 + 出网 NAT
brctl addif docker0 veth0                 # 或 ip link set veth0 master docker0
iptables -t nat -A POSTROUTING -s 10.0.0.0/24 -j MASQUERADE
```

```bash
# 排查连通性：按「四位置」逐一确认
ip netns exec c1 ip addr                  # 1) 容器内有无 IP
ip netns exec c1 ip route                 # 2) 容器内默认路由是否指向网桥
ip netns exec c1 ping -c1 10.0.0.1        # 3) 能否到达宿主侧 veth
sysctl net.ipv4.ip_forward                # 4) 宿主是否开启转发（应为 1）
iptables -t nat -L POSTROUTING -n -v      # 5) SNAT 规则是否命中
```

## 五、与其他技术对比

| 维度 | netns + veth/bridge | host 网络 | macvlan | ipvlan |
| --- | --- | --- | --- | --- |
| 隔离性 | 强（独立栈） | 无（共享宿主） | 强 | 强 |
| 性能 | NAT 有开销 | 最佳 | 近宿主 | 近宿主 |
| 外部可达 | 需 NAT/端口映射 | 直接 | 直接（有 MAC） | 共享 MAC |
| 适用 | 通用容器 | 高性能/信任 | 需要真 IP | 高密度 |

netns 独立栈轻量；VM 有独立协议栈更重。veth + bridge 是软件交换；macvlan/ipvlan 让容器直接挂在物理网络，免去 NAT 但运维更复杂。相较 host 网络，netns 隔离强但有 NAT 开销。

| 数据面实现 | 机制 | 特点 |
| --- | --- | --- |
| iptables | netfilter 规则链 | 通用，规则多则慢 |
| nftables | 统一框架、集合查询 | 规则多时更高效 |
| eBPF（Cilium 等） | 程序化数据面 | 绕过部分 conntrack，可观测性强 |

## 六、常见误区

- 误以为新 netns 自带网络。错，初始只有 `lo`，需手动配 veth/路由才能通信。
- 误以为端口在容器间天然独立。错，只有同 netns 内才独立；跨 netns 默认不通。
- 误以为 NAT 不影响性能。错，conntrack 表与 SNAT/DNAT 有 CPU 与连接数开销。
- 误以为容器 IP 在宿主外可直接路由。错，默认经 MASQUERADE，外部看到的是宿主 IP。
- 误以为 netns 隔离了所有资源。错，它只隔离网络栈，CPU/内存仍由 cgroups 管。
- 误以为开了 veth 就能出网。错，还需宿主开启 `ip_forward` 并放行 FORWARD 链，否则只能同网段互通。

## 七、与开源书·权威来源对应

- 内核文档 `Documentation/networking/network-namespaces.rst` 与 `veth.rst`/`bridge.rst`。
- Docker 官方文档「Container networking」与 bridge 驱动。
- Baumann 2015「Unikernels」关于轻量网络隔离的讨论。
- Stevens《TCP/IP Illustrated》卷 1 关于网桥、NAT 与路由。

## 八、面试题

1. 容器如何访问外网？（veth → bridge → 宿主 MASQUERADE(NAT) → 物理网卡。）
2. netns 隔离了什么？（IP、端口、路由、iptables、网卡等网络栈视图。）
3. veth pair 像什么？（一根跨 netns 的虚拟网线，两端互为对端。）
4. 为何大流量场景 NAT 有瓶颈？（conntrack 表项与 SNAT 状态维护开销。）
5. 容器能 ping 通宿主但上不了外网，查什么？（宿主 `ip_forward` 是否为 1、FORWARD 链是否放行、SNAT 规则是否命中。）
6. 同网段容器间通信经过宿主协议栈吗？（不经过三层，网桥按 FDB 做二层转发。）

## 九、演进与趋势

CNI（Container Network Interface）标准统一了容器网络插件；eBPF 加速数据面（如 Cilium 用 eBPF 取代部分 iptables，降低 NAT/conntrack 开销并提升可观测性）。ipvlan/macvlan 提升地址密度；服务网格（sidecar）把流量管理上移。可编程数据面（eBPF + XDP）正把容器网络推向接近宿主性能且仍保持强隔离。

网络模型本身也在简化：Cilium 引入「无 kube-proxy」模式，用 eBPF 直接实现服务负载均衡，避免 iptables 规则随服务数线性膨胀；IPv6 与双栈成为默认规划方向（地址空间充裕，可省去部分 NAT）；SRv6/网络切片等技术则在多集群互联场景中承担新的转发职责。整体趋势是「数据面向内核可编程、配置向声明式」。

## 十、小结

network namespace + veth/bridge/NAT 在共享内核上给容器独立网络视图：netns 负责「隔离」，veth/bridge 负责「连通」，MASQUERADE 负责「出网」。理解这条数据通路，是排查容器联网、端口冲突与跨主机通信问题的基础。排查时按「容器 IP → 容器路由 → veth 对端 → 宿主转发 → SNAT 规则」五步逐一验证，绝大多数联网问题都能被迅速定位。
