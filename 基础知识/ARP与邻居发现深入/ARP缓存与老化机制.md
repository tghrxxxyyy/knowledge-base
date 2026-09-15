# ARP缓存与老化机制

> 对应 RFC 826 (ARP)、RFC 4861 (NDP)、Bovet & Cesati《Understanding the Linux Kernel》与 Linux `net/core/neighbour.c` 邻居子系统实现。

## 一、背景与挑战

如果每次封装以太网帧都要广播一次 ARP，局域网将被解析流量淹没：设平均帧长 500 字节，ARP 请求/应答各约 60 字节，额外开销约 12%；若再计入广播对全体主机的干扰（每台主机都要上送协议栈判定是否为自己），实际代价更高。

因此必须缓存。但缓存引入了新的矛盾：**缓存越久越省事，越短越正确**。网络拓扑并非静态：网卡更换、虚机迁移、VIP 漂移、负载均衡器接管、容器重建，都会让 IP-MAC 映射变化。缓存中一条陈旧的映射会导致流量被发往已不再持有该地址的节点，形成黑洞或串流，症状往往是「时通时断」「偶发超时」这类最难排查的故障。

所以缓存机制的核心不是「存」，而是**「在何时、以何种方式验证或放弃一条映射」**，也就是老化（aging）与可达性验证（reachability detection）。

## 二、核心原理

### Linux 邻居子系统的状态机

Linux 把所有链路层地址解析（ARP、NDP、以及隧道设备的伪邻居）统一到邻居子系统（neighbour table）中。每个邻居项是一个状态机，主要状态如下：

| 状态 | 含义 | 进入条件 | 主要迁移 |
| --- | --- | --- | --- |
| NONE | 占位，尚无任何信息 | 创建时 | 有请求 → INCOMPLETE |
| INCOMPLETE | 已发解析请求，等待应答 | 首次解析 | 收到应答 → REACHABLE；超时 → 删除 |
| REACHABLE | 确认可达 | 收到应答 | `ReachableTime` 到期 → STALE |
| STALE | 映射可用但未验证 | 可达超时或收到他人通告 | 有流量 → DELAY |
| DELAY | 等待上层确认（默认约 5 秒） | STALE 且有数据要发 | 上层确认 → REACHABLE；超时 → PROBE |
| PROBE | 主动单播探测 | DELAY 超时 | 收到应答 → REACHABLE；重试耗尽 → FAILED/删除 |
| FAILED | 解析失败（负缓存） | 探测耗尽 | 有新请求 → 重试 |
| PERMANENT | 静态项，永不老化 | `nud permanent` 配置 | 仅人工删除 |
| NOARP | 不需要解析（如环回、点对点） | 设备特性 | — |

设计精髓在于：**REACHABLE 到期后不立即验证**。若立即探测，则每条邻居每次老化都要付出一次 ARP 往返；改为 STALE 后才在「真的需要发包时」触发验证（DELAY → PROBE），把验证成本与流量需求对齐。DELAY 的 5 秒窗口进一步给了上层（如 TCP 的 ACK）提供「正反馈」的机会，一旦确认就省掉整个探测过程。

### 可达时间的随机化

如果所有主机的 `ReachableTime` 相同且同时建立连接，老化与重新解析会在网络上同步发生，形成周期性尖峰。Linux 因此对基时间做随机抖动：

$$ T_{reach} \in \left[ \frac{base}{2},\ \frac{3 \cdot base}{2} \right) $$

即 `base_reachable_time/2 + random(0, base_reachable_time)`。这一技巧在 RFC 4861 中也被明确要求用于 RA 周期，是老一辈协议设计的经典手法。

### 垃圾回收与容量控制

邻居表是哈希表，桶数在表创建时固定，因此必须限制表项总数。Linux 用三个阈值控制 GC 行为（具体默认值以官方文档为准）：

- `gc_thresh1`：低于此值不回收；
- `gc_thresh2`：超过此值时，GC 最多每 5 秒运行一次（软上限）；
- `gc_thresh3`：超过此值立即触发 GC（硬上限），并可能丢弃新表项。

若表被填满且无法回收（例如大量 INCOMPLETE 项），新解析会被拒绝，表现为「新连接建立变慢或失败」——这是扫描类流量或异常流量造成的典型次生故障。

### 未解析报文队列

当解析尚未完成时，待发报文不能直接丢弃，而应挂在邻居项的 `arp_queue` 上等待。Linux 对该队列长度有上限（`unres_qlen`），超出即丢弃并计数，避免在解析长期失败时无限占用内存。这是「有限缓冲 + 显式丢弃」思想在数据面的又一实例。

## 三、形式化与数学基础

邻居项可表示为带状态与时戳的元组：

$$ e = \left( IP,\ dev,\ \text{state},\ t_{updated},\ MAC,\ \text{probes}_{left} \right) $$

可达性的时间语义：

$$ \text{state} = \text{REACHABLE} \iff t - t_{updated} < T_{reach} $$

其中 $T_{reach}$ 为随机化后的可达时间。老化的整体行为可以看成带衰减的缓存一致性策略：

$$ \text{cache}(ip, t) = \begin{cases} \text{fresh}, & t - t_{updated} < T_{reach} \\ \text{verify-on-use}, & T_{reach} \le t - t_{updated} < \infty \end{cases} $$

与 TTL 型缓存（到点即失效）不同，STALE 状态表达的是「惰性验证」：只要没有使用需求，陈旧映射可以长期驻留（受 GC 与内存压力约束），一旦要用就必须先验证。这在请求稀疏的场景下显著节省了控制流量，但在「长时间无流量后突然使用」时会引入一次验证延迟：

$$ T_{penalty} \approx \text{DELAY}(5\text{s}) \ \text{或} \ \text{一次单播探测的 RTT} $$

实际实现中，需要发包的路径会优先触发 `DELAY → PROBE` 并同时尝试发送；若能拿到上层正反馈则无额外延迟，最坏情况才会等待探测完成。

容量与丢包的关系可以量化。设表项数为 $n$、哈希桶数为 $b$，平均链长 $\lambda = n/b$；GC 未及时运行时，插入成本与查找成本都随 $\lambda$ 线性增长。因此内核对 `gc_thresh*` 的取值直接影响解析路径的 CPU 开销：

$$ C_{lookup} = O\left( 1 + \frac{n}{b} \right) $$

这也解释了为什么在大规模容器/虚拟机主机上必须上调这些阈值——它们是标准配置中极易被忽略的调优点。

## 四、代码实现

查询与调优邻居表参数：

```bash
# 查看与调整可达时间、重传、延迟探测等参数
sysctl net.ipv4.neigh.default.base_reachable_time_ms
sysctl net.ipv4.neigh.default.gc_stale_time
sysctl net.ipv4.neigh.default.retrans_time_ms
sysctl net.ipv4.neigh.default.ucast_solicit     # 单播探测次数
sysctl net.ipv4.neigh.default.mcast_solicit     # 组播/广播探测次数
sysctl net.ipv4.neigh.default.app_solicit       # 允许上层探测次数
sysctl net.ipv4.neigh.default.delay_first_probe_time   # DELAY 时长（秒）

# 容量相关阈值：大主机/容器场景需要上调
sysctl net.ipv4.neigh.default.gc_thresh1
sysctl net.ipv4.neigh.default.gc_thresh2
sysctl net.ipv4.neigh.default.gc_thresh3
sysctl net.ipv4.neigh.eth0.unres_qlen           # 未解析队列上限

# 观察状态：重点看 STALE/FAILED/INCOMPLETE 的占比
ip neigh show dev eth0
ip -s neigh show dev eth0                       # 带统计（used/confirmed/updated）
ip neigh show nud failed
ip neigh flush dev eth0                         # 清空以便复现解析流程
```

程序化读取并统计邻居状态分布（适合作为运维脚本骨架）：

```python
import subprocess
from collections import Counter

def neigh_stats(dev="eth0"):
    out = subprocess.check_output(["ip", "neigh", "show", "dev", dev]).decode()
    counter = Counter()
    for line in out.splitlines():
        # 形如：192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE
        state = line.split()[-1] if line.split() else "UNKNOWN"
        counter[state] += 1
    return counter

print(neigh_stats())      # STALE 占比高说明大量映射长期未被使用
```

内核中触发解析与状态迁移的入口（`net/core/neighbour.c`，简化示意）：

```c
/* 简化示意：需要发包但邻居不可用时，创建/更新邻居项并入队 */
int neigh_event_send(struct neighbour *neigh, struct sk_buff *skb)
{
    if (neigh->used & NUD_CONNECTED)
        return 0;

    if (neigh->nud_state & (NUD_INCOMPLETE | NUD_PROBE))
        goto out;                       /* 正在解析，报文入队等待 */
    if (neigh->nud_state & NUD_STALE)
        neigh->nud_state = NUD_DELAY;   /* 先进入 DELAY，等待上层确认 */
    else if (!(neigh->nud_state & NUD_VALID))
        neigh->nud_state = NUD_INCOMPLETE;

    neigh->updated = jiffies;
    atomic_inc(&neigh->probes);
    neigh->ops->solicit(neigh, skb);     /* 发出 ARP 请求或 NS */
    ...
out:
    return neigh->ops->enqueue(neigh, skb);   /* 挂到 arp_queue */
}
```

可达时间的随机化与 GC（简化示意）：

```c
/* 简化示意：随机化可达时间，避免全网同步老化 */
static inline unsigned long neigh_rand_reach_time(unsigned long base)
{
    return base ? (base / 2) + (get_random_u32() % base) : 0;
}

/* 简化示意：周期性 GC 的阈值语义 */
void neigh_periodic_work(struct work_struct *work)
{
    struct neigh_table *tbl = container_of(work, struct neigh_table, gc_work.work);

    if (atomic_read(&tbl->entries) < tbl->gc_thresh1)
        goto out;                                  /* 表项很少，不回收 */
    /* gc_thresh2 为软上限：超过则每 5 秒跑一次；gc_thresh3 为硬上限 */
    ...
    /* 回收过期的 STALE/FAILED 项，保留 PERMANENT 与活跃项 */
out:
    neigh_rand_reach_time(...);
}
```

## 五、与其他技术对比

| 维度 | 动态邻居项 | 静态/永久项 | NDP 邻居项 | DNS 缓存 | 连接跟踪表 | 路由缓存 |
| --- | --- | --- | --- | --- | --- | --- |
| 存储内容 | IP → MAC | IP → MAC | IPv6 → MAC | 域名 → 地址 | 五元组 → 状态 | 目标 → 下一跳 |
| 老化方式 | 状态机 + 惰性验证 | 永不老化 | 同 IPv4（NUD） | 按 TTL | 按超时 + 回收 | 已弱化/移除 |
| 失效风险 | 旧映射导致黑洞 | 手工变更导致中断 | 同左 | 陈旧 IP | 状态泄漏 | — |
| 典型故障 | 时通时断 | 迁移后不通 | 同左 | 切流不准 | 表满丢弃新连接 | — |
| 容量控制 | `gc_thresh1/2/3` | 无 | 同左 | 应用内存 | `nf_conntrack_max` | — |
| 可观测性 | `ip neigh` | `ip neigh` | `ip -6 neigh` | 应用日志 | `conntrack -L` | `ip route` |

一个值得注意的对比是「惰性验证」与「主动心跳」：邻居子系统选择惰性验证以省流量；消息队列等系统则常用主动心跳（keepalive）以尽快发现异常。二者取舍取决于「错误的代价」与「流量成本」的比较——数据面邻居错误的代价是单包黑洞（可重传恢复），而中间件节点错误的代价可能是秒级业务中断。

## 六、常见误区

- **把 `ip neigh`/`arp -a` 的所有条目当作当前有效。** 其中含 STALE、INCOMPLETE、FAILED，语义完全不同；只看条目数无意义。
- **认为调大超时能「稳定」连接。** 延长老化会让陈旧映射存活更久，故障转移后更长时间不通；正确方向是加快验证而非延长缓存。
- **忽略 GC 阈值。** 容器或虚拟化主机上邻居项动辄数万，未上调 `gc_thresh*` 会导致解析失败或性能劣化。
- **STALE 即故障。** STALE 是正常工作状态，首次使用时验证成功即可，不必也无法消除（稀疏流量下大量 STALE 是预期现象）。
- **把静态绑定当成万能解法。** 硬件更换或迁移后必须同步更新，否则绑定本身会制造中断；静态绑定适合网关等极少数关键项。
- **忽略 `unres_qlen` 与解析失败队列。** 大量并发解析失败时会丢包，表现为应用层超时而非链路错误，需看 `ip -s neigh` 的统计。
- **混淆邻居项与连接跟踪表。** 二者容量参数独立，排查「新连接失败」时要分别检查。

## 七、与开源书·权威来源对应

- RFC 826《An Ethernet Address Resolution Protocol》：提及缓存需求与「收到请求时更新自身缓存」的处理原则，是邻居缓存的原始依据。
- RFC 4861 §7.3《Neighbor Unreachability Detection》：NUD 状态机（INCOMPLETE/REACHABLE/STALE/DELAY/PROBE）与上层确认机制的规范定义，Linux 状态机与之同构。
- RFC 5227 §2.3：ARP Probe 与缓存的交互规则，避免探测污染他人缓存。
- Bovet & Cesati《Understanding the Linux Kernel》：内核定时器、工作队列与哈希表实现背景，帮助理解 GC 与状态机的运行机制。
- Love《Linux Kernel Development》：内核数据结构与并发保护的通用实践，适用于邻居表的锁与哈希设计。
- Stevens《TCP/IP Illustrated》Vol.1 第4章：ARP 缓存表的观察与老化行为的实证分析。
- Linux 源码 `net/core/neighbour.c`、`include/net/neighbour.h`：`neigh_event_send()`、`neigh_periodic_work()`、`neigh_rand_reach_time()` 与 `gc_thresh*` 语义。

## 八、面试题

1. **为什么 ARP 表项会进入 STALE？**
   要点：可达计时到期后内核不立即探测，而是标记为可疑；待到真有流量要发时才触发验证（DELAY → PROBE），把验证成本与流量需求对齐。

2. **DELAY 状态的作用是什么？**
   要点：给上层一个正反馈窗口（默认约 5 秒）。若期间 TCP 收到 ACK 等证据，邻居直接回到 REACHABLE，省掉一轮主动探测，避免无谓控制流量。

3. **`base_reachable_time` 为什么要加随机抖动？**
   要点：避免全网主机的老化与重新解析同步发生形成周期尖峰；抖动范围通常取 $[base/2,\ 1.5\,base)$。

4. **什么情况下需要上调 `gc_thresh1/2/3`？**
   要点：单主机上邻居项数量很大时（大规模容器、虚拟机、Kubernetes 节点），默认阈值会让表被填满导致新解析失败；应结合 `ip -s neigh` 的统计与内存评估上调。

5. **静态绑定与动态老化如何取舍？**
   要点：静态绑定用于极少数关键项（网关、核心设备），代价是变更时需手工同步；动态老化适合大规模、变化频繁的环境，靠惰性验证控制正确性。两者应组合而非互斥。

## 九、演进与趋势

在大规模二层网络中，依赖主机自学习与广播解析的模式已成为瓶颈。工程上的演进方向是把「分布式自学习状态」换成「控制面集中下发的一致状态」：EVPN 用 MP-BGP 分发 MAC/IP 表项，主机迁移时由控制面通告，收敛速度与可观测性都远优于广播刷表；SDN 控制器则以流表方式下发地址映射并抑制 ARP 泛洪。

内核侧的持续优化集中在容量与可观测性：邻居表阈值支持运行时调整、`ip -s neigh` 暴露更细的计数、eBPF 可用于挂钩邻居状态变化做实时监控与审计。容器网络（CNI 插件）普遍需要显式上调 `gc_thresh*` 并调整 `unres_qlen`，已成为标准化的部署清单项。

在协议侧，IPv6 的 NDP 与 IPv4 的 ARP 共享同一套内核状态机，因此 NUD 的改进（如更积极的组播探测、对上层确认的更好利用）同时惠及两代协议。更长远的看，随着 IPv6-only 与无损网络的普及，二层可达性越来越多由控制器与硬件卸载保证，主机侧的缓存机制会退化为「控制面下发的只读映射 + 兜底验证」，但惰性验证这一核心思想仍将保留。

## 十、小结

ARP 缓存把「每次发包都广播」降为「解析一次、按需验证」，其正确性由邻居子系统的状态机保证：REACHABLE 表示已确认，STALE 表示可用但未验证，DELAY 给了上层正反馈的机会，PROBE 才是真正主动探测。可达时间的随机化避免了全网同步老化，`gc_thresh1/2/3` 与 `unres_qlen` 约束了容量与内存。

排查「时通时断」类故障的正确起点是 `ip neigh` 的状态分布与 `ip -s neigh` 的统计：大量 FAILED/INCOMPLETE 指向解析失败或流量异常，大量长期 STALE 说明流量稀疏或映射已陈旧；而在容器/虚拟化主机上，容量阈值往往是真正的根因。
