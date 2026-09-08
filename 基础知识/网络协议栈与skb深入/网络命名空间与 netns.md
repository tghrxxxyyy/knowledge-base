# 网络命名空间与 netns

> 对应 Linux 内核 network namespace 文档与 xiaolincoder/hello-http 关于容器网络隔离的说明。

## 一、背景与挑战
容器技术需要独立的网络视图（独立 IP、路由、端口、网卡）。Linux 网络命名空间（netns）把网络栈资源（接口、路由表、iptables、socket 等）隔离，使进程看到不同的网络环境。

## 二、核心原理
每个 netns 持有一套独立的网络资源：网络设备列表、路由表、netfilter 规则、以及 /proc/net 视图。进程通过设置其 nsproxy 关联某个 netns。veth 成对虚拟网卡可跨 netns 连接，一端在容器、一端在宿主，配合网桥实现容器联网；docker 默认即用此模型。

## 三、形式化与数学基础
一个进程 p 的网络视图 V(p) = netns(p).{ifaces, routes, rules}。跨 netns 通信需经一对 veth 或物理/隧道设备，等价于在不同「网络栈实例」间经网卡转发，满足各自命名空间内的路由判定。

## 四、代码实现
```bash
ip netns add ns1
ip link add veth0 type veth peer name veth1
ip link set veth1 netns ns1
ip netns exec ns1 ip addr add 10.0.0.2/24 dev veth1
ip netns exec ns1 ip link set veth1 up
```

## 五、与其他技术对比
BSD jail 也有网络隔离但粒度不同；虚拟机用独立内核实现更强隔离。Kubernetes 的 Pod 网络模型建立在与 netns 之上（每 Pod 一 netns，通过 CNI 插件连接）。

## 六、常见误区
误区一：netns 隔离进程——隔离的是网络资源，进程仍同属一个 PID 命名空间除非另行隔离。误区二：loopback 跨 netns 共享——各自有独立 lo。误区三：切换 netns 自动迁移 socket——已绑定旧 netns 的 socket 仍属原 netns。

## 七、与开源书/权威来源对应
内核 Documentation/networking/net_namespace.rst；xiaolincoder/hello-http 图示容器网络；Kleppmann《DDIA》讨论隔离与多租户。

## 八、面试题
veth 如何连通两个 netns？容器默认网络模型？netns 隔离了哪些资源？为何需要 CNI？

## 九、演进与趋势
eBPF 与 Cilium 用基于 netns 与 socket 的 eBPF 程序实现更灵活的服务网格与网络策略，部分替代 iptables。

## 十、小结
网络命名空间把网络栈资源虚拟化，是容器网络隔离的基石；veth 对与网桥在其上构建出 Pod/容器联网模型。
