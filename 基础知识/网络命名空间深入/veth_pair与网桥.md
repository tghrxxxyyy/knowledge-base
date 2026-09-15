# veth pair 与网桥

> 对应 Linux man veth(4) / bridge(8) / ip-link(8)；Stevens《TCP/IP Illustrated》卷二（链路层与桥接）。

## 一、背景与挑战

netns 之间默认完全隔离，两个命名空间里的协议栈互不可见。要在它们之间建立通路，需要一个"跨命名空间的二层线缆"：一端在 A 的栈里、另一端在 B 的栈里，从一端发出的帧从另一端收到。veth pair 正是这个抽象。

把多个容器接到同一二层域，又需要一个虚拟交换机来做学习和转发——这就是 Linux bridge。二者组合构成单主机容器网络的标准拼图。

## 二、核心原理

**veth pair** 是一对虚拟以太网接口，本质是一根"管道"的两端：对一端执行发送，会在另一端触发接收路径（包含完整的收包处理、netfilter、协议栈上升）。两点性质很关键：

- 两端不可分割，删除任一端另一端一并消失；
- 一端可以在宿主 netns，另一端被移入容器 netns（`ip link set <dev> netns <pid|name>`）。

**Linux bridge** 是软件交换机：把若干端口（veth 的一端、物理网卡）加入同一 br0，桥维护 **FDB（转发数据库）** 记录"MAC → 端口"的映射，转发决策为：

- 目的 MAC 在 FDB 中 → 只从对应端口发出（monoflood 反例见下）；
- 未学习到 → 向除入端口外的所有端口**泛洪（flood）**；
- 广播/组播 → 泛洪。

FDB 表项有老化时间（默认约 5 分钟），到期删除以适应迁移。桥自身也是一个网络接口，可配 IP 作为容器的默认网关。

## 三、形式化与数学基础

转发规则可写成：

$$fwd(dst) = \begin{cases} port \in FDB(dst) & \text{命中} \\ all \setminus \{in\} & \text{未命中（泛洪）} \end{cases}$$

FDB 表项存活时间服从老化机制：设老化时间为 $A$、某 MAC 的发包间隔期望为 $\Delta$，则表项可用性大致要求 $\Delta < A$，否则每轮都要重新泛洪学习。桥内 MAC 表容量的压力可用端口数 $n$ 与平均 MAC 数 $m$ 估计为 $O(nm)$。

veth 的性能关键参数是 MTU 与队列：容器路径上的总开销为

$$MTU_{inner} = MTU_{outer} - Overhead_{encap}$$

以 VXLAN 为例，外层封装开销约为 $20_{(IP)} + 8_{(UDP)} + 8_{(VXLAN)} = 36$ 字节，故 1500 的物理口上内层常用 1450 以避免分片。此外，veth 会带来约一次内存拷贝或页翻转级别的成本，是容器网络相对裸机最主要的固有开销之一。

## 四、代码实现

```bash
# 创建 veth pair，把一端放入 ns1，另一端接宿主网桥
ip link add veth0 type veth peer name veth1
ip link set veth1 netns ns1

# 容器侧配置
ip netns exec ns1 ip addr add 10.0.0.2/24 dev veth1
ip netns exec ns1 ip link set veth1 up
ip netns exec ns1 ip link set lo up

# 宿主侧配置：加入网桥并启用
ip link add br0 type bridge
ip link set veth0 master br0
ip link set veth0 up
ip link set br0 up
ip addr add 10.0.0.1/24 dev br0          # 作为容器默认网关

# 排障：查看转发数据库与端口状态
bridge fdb show br br0
bridge link show
ip -s link show veth0                    # 核对收发包计数
```

排障的第一原则是核对两端计数：若 `veth0` 的 TX 增长而 `veth1` 的 RX 不增长，说明问题在 netns 归属或接口状态，而非上层协议。

## 五、与其他技术对比

| 维度 | veth + bridge | macvlan | ipvlan | 覆盖网络（VXLAN） |
| --- | --- | --- | --- | --- |
| 层次 | 二层点对点 + 虚拟交换 | 二层，共享物理口 | 二/三层，共享物理口 | 跨主机二层封装 |
| 隔离方式 | 独立 netns + 桥 | 独立 netns，直接对物理网 | 独立 netns，共享 MAC | 跨主机隧道 |
| 宿主参与转发 | 是（经桥与 NAT） | 否（绕过宿主栈） | 视模式 | 是（隧道端点） |
| 是否支持 netfilter 策略 | 是 | 受限 | 受限 | 是 |
| 典型用途 | 单主机容器默认网络 | 高性能直连、需独立 MAC | L2 受限环境的直连 | 跨主机大二层（K8s CNI）|

## 六、常见误区

1. **忘记把接口 up**：veth 与 br0 默认 down，任一端未启用即不通。
2. **混淆 bridge 与 router**：bridge 做二层转发不修改 IP；跨网段通信仍需三层路由与 NAT。
3. **两端 IP 不在同一子网却挂同一桥**：桥能转发二层帧，但主机的路由与 ARP 无法完成互联。
4. **忽略 MTU 不一致**：容器 MTU 大于隧道可用值会导致大包被静默丢弃，表现为"小包通、大包挂"。
5. **忘记网桥自身需要 IP 才能当网关**：只把 veth 接上桥而不给 br0 配地址，容器无处设置默认路由。
6. **以为删除容器会自动清理 veth**：异常退出常残留宿主侧 veth，需要按需清理。

## 七、与开源书·权威来源对应

- Linux man pages：`veth(4)`、`bridge(8)`、`ip-link(8)`、`ip-netns(8)`。
- Stevens《TCP/IP Illustrated》卷二关于链路层、网桥与以太网交换的章节。
- Kerrisk《The Linux Programming Interface》网络接口与 ioctl 相关背景。
- Docker 与 Kubernetes CNI 官方文档中 bridge 插件的 veth 拓扑说明。
- 具体默认老化时间、队列长度与参数名随内核版本变化，以官方最新文档为准。

## 八、面试题

1. **veth pair 是什么？** 要点：一对虚拟以太网接口，一端发送在另一端触发接收，用于跨 netns 的二层连通。
2. **bridge 如何转发？** 要点：查 FDB 得到目的端口；未学习到时向除入端口外所有端口泛洪。
3. **容器如何访问外网？** 要点：veth 接入宿主桥，桥提供网关，宿主做 SNAT/MASQUERADE 并开启转发。
4. **为什么容器网络 MTU 常设小于 1500？** 要点：VXLAN 等封装占用外层头部，需避免分片或丢包。
5. **macvlan 相比 veth+bridge 的取舍？** 要点：macvlan 绕过宿主栈、性能更好，但宿主与容器难以直接通信、netfilter 策略受限。

## 九、演进与趋势

CNI 生态在 bridge 插件之外提供 macvlan/ipvlan/vlan 等高性能方案；跨主机侧由 VXLAN/Geneve 或 BGP 路由方案承担。eBPF 正在把"查 FDB、做策略、做 NAT"合成为一次程序执行，减少 veth 与 netfilter 的多次穿越。硬件侧，SmartNIC 与 DPU 把部分封装/转发卸载出去，把 veth 路径的固有拷贝成本进一步压缩。

## 十、小结

veth 提供跨 netns 的二层线缆，bridge 提供带 MAC 学习的二层交换，二者组合是单主机容器网络的标准拓扑。理解 FDB 与泛洪、网桥自身的 IP 语义、以及 MTU 与封装开销，是容器网络排障的必备基础。
