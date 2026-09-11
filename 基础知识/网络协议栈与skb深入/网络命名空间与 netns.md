# 网络命名空间与 netns

> 对应 Linux 内核 network namespace 文档（Documentation/networking/net_namespace.rst）、xiaolincoder/hello-http 容器网络说明，及 Kleppmann《DDIA》隔离与多租户。

## 一、背景与挑战

容器技术需要**独立的网络视图**：独立的 IP、路由表、端口、网卡、iptables 规则。若所有容器共享宿主网络栈，端口冲突、路由互相干扰、安全边界崩塌。Linux **网络命名空间（network namespace，netns）** 把网络栈资源虚拟化，使每个 netns 内的进程看到不同的网络环境。挑战在于：netns 隔离了哪些资源、如何跨 netns 通信、以及已建立的 socket 在切换 netns 后归属如何。

## 二、核心原理

每个 netns 持有一套独立的网络资源视图：

- 网络设备列表（interface list，如 `eth0`、`lo`）。
- 路由表（含策略路由）、邻居表（ARP/ND）。
- netfilter 规则（iptables / nftables）、conntrack。
- `/proc/net` 等网络相关视图。

进程通过其 `nsproxy` 关联某个 netns。跨 netns 通信靠**成对虚拟网卡 `veth`**：一端在容器 netns、一端在宿主（或网桥）netns，构成一条「虚拟网线」。配合**网桥（bridge）** 与 NAT，多个容器可连成局域网并访问外网——这正是 Docker 默认模型。Kubernetes 的 Pod 网络建立在此之上（每 Pod 一 netns，通过 CNI 插件连接）。

容器网络排障时常遇到「容器能 ping 通 IP 却不通域名」，本质是 netns 内 DNS 解析（依赖 `/etc/resolv.conf` 与独立路由）未正确配置，而非 netns 本身故障。另一常见坑是「veth 一端 up 另一端 down」导致单向通——两端的 `link up` 必须都完成。CNI 插件的价值正在于把上述繁琐的 veth 创建、IP 分配、路由与 NAT 规则自动化，使 Pod 网络对应用透明。理解 netns 的隔离边界，也能避免在排查时误把「跨 netns 不可见」当成网络故障。

## 三、形式化与数学基础

一个进程 $p$ 的网络视图可表示为其 netns 内资源的投影：

$$
V(p) = netns(p).\ \{ifaces,\ routes,\ rules,\ sockets\}
$$

跨 netns 通信需经一对 veth 或物理 / 隧道设备，等价于在不同「网络栈实例」间经网卡转发，满足各自命名空间内的路由判定：

$$
\text{若 } dst \in V(p_a),\ \text{则经 veth 对转发至 } netns_b \text{ 再走其路由}
$$

创建新 netns 时，内核初始化独立的 `loopback`（各 netns 有自己独立的 `lo`，默认 `DOWN` 需手动 `up`），以及独立的路由与 netfilter 实例。

## 四、代码实现

```bash
# 创建 netns 并连通宿主（命令以 iproute2 文档为准）
ip netns add ns1
ip link add veth0 type veth peer name veth1
ip link set veth1 netns ns1            # 一端移入 ns1
ip addr add 10.0.0.1/24 dev veth0
ip link set veth0 up
ip netns exec ns1 ip addr add 10.0.0.2/24 dev veth1
ip netns exec ns1 ip link set veth1 up
ip netns exec ns1 ip link set lo up   # 记得启用独立 lo
```

```bash
# 在 ns1 内运行命令（验证隔离）
ip netns exec ns1 ip route show        # 看到的是 ns1 独立路由表
```

## 五、与其他技术对比

- **BSD jail**：也有网络隔离，但粒度与实现机制不同（更偏向整体 jail 环境）。
- **虚拟机**：用独立内核实现更强隔离，代价是资源开销大。
- **Kubernetes Pod 网络**：建立在 netns 之上（每 Pod 一 netns），通过 CNI 插件（bridge / flannel / Calico）连接。
- **eBPF / Cilium**：基于 netns 与 socket 的 eBPF 程序实现更灵活的服务网格与网络策略，部分替代 iptables。

## 六、常见误区

- **误区一：netns 隔离进程**——它隔离的是网络资源；进程仍同属一个 PID 命名空间，除非另行隔离。
- **误区二：loopback 跨 netns 共享**——每个 netns 有独立 `lo`，需各自 `up`。
- **误区三：切换 netns 自动迁移 socket**——已绑定旧 netns 的 socket 仍属原 netns。
- **误区四：netns 间直接互通**——必须显式用 veth / 隧道连接，否则互相不可见。

## 七、与开源书·权威来源对应

- Linux 内核 `Documentation/networking/net_namespace.rst`。
- xiaolincoder/hello-http 图示容器网络与 netns。
- Kleppmann《Designing Data-Intensive Applications》隔离与多租户。
- Docker / Kubernetes 网络模型官方文档（CNI 插件机制）。

## 八、面试题

- veth 如何连通两个 netns？为什么需要网桥？
- 容器默认网络模型是什么？CNI 解决什么？
- netns 隔离了哪些资源？loopback 是否共享？
- 已绑定的 socket 在切换 netns 后归属如何？

在多 netns 场景下，跨命名空间的服务发现与治理催生了服务网格（如基于 eBPF 的 Cilium）——它利用 netns 与 socket 层钩子，在不变更应用的前提下实现流量管理、加密与可观测。多租户平台则通过为每个租户分配独立 netns 实现强网络隔离，再经 CNI 与overlay（VXLAN 等）打通跨主机通信。未来方向是把网络策略的「声明式配置」与 netns 运行时深度结合，使隔离与连通都可编程、可审计。

## 九、演进与趋势

eBPF 与 Cilium 用基于 netns 与 socket 的 eBPF 程序实现更灵活的服务网格与网络策略，部分替代 iptables；多集群、跨主机 netns 互联（Overlay / VXLAN）持续演进。具体实现以官方文档与内核版本为准。

在大规模容器平台中，netns 常与 cgroup、iptables / nftables、eBPF 协同构成完整网络栈：netns 提供隔离边界，CNI 负责连通，网络策略（如 CiliumNetworkPolicy）负责访问控制。理解「一个 Pod = 一个 netns + 一对 veth + 网桥 / 路由」的底层模型，能帮助在出问题时快速区分是隔离配置、IP 分配还是路由 NAT 哪一环出错，而不是笼统地重启容器。

## 十、小结

网络命名空间把网络栈资源虚拟化，是容器网络隔离的基石；veth 对与网桥在其上构建出 Pod / 容器联网模型，使多租户、多应用的网络环境既隔离又可互联。
