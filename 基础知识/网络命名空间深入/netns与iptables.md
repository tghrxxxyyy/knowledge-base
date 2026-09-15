# netns 与 iptables

> 对应 Linux man iptables(8) / iptables-extensions(8) / network_namespaces(7)；Stevens《TCP/IP Illustrated》中 NAT 与连接跟踪相关章节。

## 一、背景与挑战

容器网络的控制面几乎全部由 netfilter 完成：出网要 SNAT/MASQUERADE、入站端口发布要 DNAT、跨容器访问要 ACL。而 netfilter 的规则集本身**也是按网络命名空间隔离的状态**——这正是"每个容器可以有独立防火墙策略"的实现基础。

难点在于：规则、连接跟踪表、路由与转发开关分散在多个命名空间中，一次连接可能穿越宿主与容器两套 netns，排障时必须同时看到两侧的规则与 conntrack 状态。

## 二、核心原理

iptables 的规则组织为"表 × 链"：

- 表：`raw`（连接跟踪前）、`mangle`（改包头字段）、`nat`（地址转换）、`filter`（放行/丢弃）、`security`；
- 链：`PREROUTING` → 路由决策 → `INPUT`/`FORWARD` → `POSTROUTING`，另有 `OUTPUT`。

关键性质：**NAT 只对连接的首包生效**，后续包由 conntrack 表按五元组直接改写，不需要重复匹配规则。这解释了为什么 `nat` 表规则数量对吞吐影响远小于 `filter`，也解释了为什么丢掉 conntrack 状态（如表满、超时过短）会造成连接异常。

每个 netns 拥有独立的 iptables 规则集与独立的 conntrack 表；同一台宿主上不同容器的 NAT 规则互不可见。

## 三、形式化与数学基础

典型 NAT 链的顺序：

$$PREROUTING_{(DNAT)} \to FORWARD \to POSTROUTING_{(MASQUERADE)}$$

conntrack 状态机可写成：

$$NEW \to ESTABLISHED \to RELATED \to (CLOSED \mid TIMEOUT)$$

端口发布可写为映射函数：

$$f:\ (0.0.0.0,\ 8080) \mapsto (10.0.0.2,\ 80)$$

出网 SNAT 则是反向映射，源端口由内核从可用区间分配，回包依赖 conntrack 反查。conntrack 表容量约束决定了并发连接上限：设表容量为 $C$、每条连接的超时时间为 $\tau$、新连接速率为 $\lambda$，则稳态占用约 $\lambda \tau$，要求

$$\lambda \tau < C$$

否则表满丢包（实践中报 `nf_conntrack: table full, dropping packet`）。这也是"连接数上不去"最常见的隐性原因之一。

## 四、代码实现

```bash
# 1) 容器出网：在容器所在 netns 或宿主 POSTROUTING 上做源地址伪装
iptables -t nat -A POSTROUTING -s 10.0.0.0/24 -o eth0 -j MASQUERADE

# 2) 宿主端口发布：DNAT 到容器
iptables -t nat -A PREROUTING -p tcp --dport 8080 -j DNAT --to-destination 10.0.0.2:80

# 3) 必须开启三层转发，否则 FORWARD 根本不会发生
sysctl -w net.ipv4.ip_forward=1

# 4) 桥接流量若要经过 iptables（同桥内容器互访策略），需加载 br_netfilter
modprobe br_netfilter
sysctl -w net.bridge.bridge-nf-call-iptables=1

# 5) 查看与调优 conntrack
conntrack -L | head
sysctl -w net.netfilter.nf_conntrack_max=262144
```

注意 `DOCKER-USER` 链的设计意图：它位于 Docker 自动生成规则之前，供用户插入自定义策略而不被 Docker 重启规则时覆盖。

## 五、与其他技术对比

| 维度 | iptables | nftables | eBPF（如 Cilium）|
| --- | --- | --- | --- |
| 规则模型 | 表/链/线性匹配 | 统一规则集 + 集合/映射 | 程序挂载到 hook |
| 匹配复杂度 | 线性增长，规则多则慢 | 集合加速，优于 iptables | 哈希查找，可 O(1) |
| 与 netns 关系 | 规则按 ns 隔离 | 同样按 ns 隔离 | 可绑定 ns 与 cgroup |
| 可观测性 | 计数 + conntrack | 计数 + 更丰富元数据 | 强（可输出事件/指标）|
| 典型替代对象 | — | iptables 的现代替代 | kube-proxy 的 Service 实现 |

## 六、常见误区

1. **配了 DNAT 却忘了 `ip_forward=1`**：报文进入 FORWARD 链后被直接丢弃，表现为"规则看着对但连不通"。
2. **忽略 conntrack 表满**：只加规则不看表容量，高并发下随机丢新建连接。
3. **忽略 br_netfilter**：同桥内的容器互访默认不经过 iptables，导致策略"没生效"。
4. **把宿主 nat 表的规则当成容器可见**：规则与 conntrack 都按 netns 隔离，必须在对的 ns 中查看（`ip netns exec ns1 iptables -t nat -L -n -v`）。
5. **以为 NAT 对每个包都生效**：只有首包走 nat 表，后续靠 conntrack；因此中途改动规则不会影响已建立的连接。
6. **同宿主访问发布端口失败却不做 hairpin**：从宿主内部访问宿主 IP:端口通常需要额外的 hairpin NAT 规则。

## 七、与开源书·权威来源对应

- Linux man pages：`iptables(8)`、`iptables-extensions(8)`、`conntrack(8)`、`network_namespaces(7)`、`ip-netns(8)`。
- Stevens《TCP/IP Illustrated》卷一关于 NAT、地址转换与连接语义的章节。
- Kerrisk《The Linux Programming Interface》套接字与 netfilter 相关背景。
- Kubernetes/Cilium 官方文档中关于 iptables Service 实现与 eBPF 替代方案的说明。
- 具体默认超时、表容量与规则生成细节随内核与运行时版本变化，以官方最新文档为准。

## 八、面试题

1. **netns 之间 iptables 规则是否隔离？** 要点：是，规则集与 conntrack 表都按命名空间隔离，需在对的 ns 中查看与配置。
2. **MASQUERADE 与 SNAT 的区别？** 要点：SNAT 需要写死源地址；MASQUERADE 自动采用出接口地址，适合地址动态变化的场景，代价是每次连接需重新探测地址。
3. **如何做端口映射？** 要点：在 PREROUTING 链做 DNAT 到容器 IP:端口，并确保 ip_forward 与 FORWARD 放行。
4. **为什么 NAT 只处理首包？** 要点：连接跟踪把五元组映射记录下来，后续包直接按记录改写，避免重复匹配规则。
5. **同桥容器流量为什么不走 FORWARD？** 要点：二层桥接默认在网桥层转发，需 br_netfilter 把桥接流量送入 netfilter 的 FORWARD 链。

## 九、演进与趋势

nftables 以统一的规则集与集合匹配取代了 iptables 的多表多链模型，iptables 命令在内核侧多已由兼容层转发实现。云原生方向，Kubernetes 的 Service 实现从 iptables 线性规则逐步转向 IPVS，进一步转向 eBPF（Cilium）以消除规则规模随端点数量线性增长的问题；端口发布与 NAT 也开始由 eBPF 在更早的 hook 完成，减少一次 netfilter 遍历。

## 十、小结

netns 隔离规则与连接跟踪状态，iptables/nftables 在其中实现 NAT、转发与策略，共同构成容器网络的控制面。掌握"表与链的顺序、NAT 只处理首包、conntrack 容量约束、桥接流量需显式引入 netfilter"这四点，就能定位绝大多数容器网络的连通性问题。
