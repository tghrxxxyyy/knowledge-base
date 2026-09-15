# 片上网络 NoC

> 对应 Hennessy & Patterson《Computer Architecture: A Quantitative Approach》多核互连章节，以及 Dally & Towles《Principles and Practices of Interconnection Networks》。

## 一、背景与挑战

当核数从个位数增长到数十、数百个，共享总线与全交叉开关（crossbar）在面积、功耗与线延迟上都不可持续：交叉开关的端口数与面积近似 $O(N^2)$，而全局总线的带宽被所有主设备平分。NoC（Network-on-Chip）把「网络」思想搬进芯片：以路由器（router）+ 链路（link）构成分组交换网络，用多跳换取可扩展的聚合带宽与规则化的物理布局。

NoC 的核心挑战有四类。第一，拓扑与路由必须保证无死锁，否则网络会因缓冲区循环依赖而永久停滞。第二，缓冲资源有限，需要流控机制避免丢包与饥饿。第三，面积与功耗预算严苛，路由器流水线与虚通道数量都要精打细算。第四，还必须与缓存一致性协同：一致性流量（失效、转发）具有突发与多播特征，与普通数据流竞争网络资源。

## 二、核心原理

典型 2D 网格（mesh）中，每个节点是一个路由器，连接上/下/左/右四个邻居路由器以及本地核（或 L2 切片、内存控制器）。数据被切成固定长度的 flit（flow control unit），若干 flit 组成 packet，packet 再分 head/body/tail。

路由：XY 维序路由先沿 X 维走到目标列，再沿 Y 维走到目标行。它属于「维序路由」的特例，无自适应能力但保证无死锁（因为维度单调推进，不可能形成环）。更激进的有 turn model（禁止特定转向以打破环）、odd-even、以及自适应路由（DyAD 在低负载用自适应、高负载回退确定性）。

交换与流控：store-and-forward 需整包到达才转发，延迟大；wormhole（虫洞）以 flit 为单位流水转发，只需一个 flit 的缓冲深度即可，但会引发头阻塞（head-of-line blocking）。虚通道（virtual channel, VC）把一条物理链路的缓冲分成多路逻辑队列，使不同 packet 交错推进，既缓解头阻塞，又是打破协议级死锁（如请求/响应网络分离）的标准手段。信用制（credit-based）流控以「下游可用缓冲数」为令牌，避免溢出丢包。

路由器流水线通常分为：路由计算（RC）→ 虚通道分配（VA）→ 开关分配（SA）→ 交叉开关传输（ST）。分配器常用轮询或 iSLIP/matrix arbiter，在每拍解决多输入争用同一输出的问题。

## 三、形式化与数学基础

对 $k \times k$ 的 2D 网格（节点数 $N = k^2$），最远节点间跳数（直径）：

$$D = 2(k - 1) = 2(\sqrt{N} - 1)$$

平均跳数（在均匀随机流量下近似）：

$$\bar{H} \approx \frac{2k}{3}$$

（环形的平均跳数约为 $N/4$，环形直径约为 $\lfloor N/2 \rfloor$。）

延迟模型（零负载下）：

$$Latency \approx H \cdot (t_{router}) + (L_{packet} - 1) \cdot t_{link} + t_{serialization}$$

其中 $t_{router}$ 为路由器流水线延迟，$t_{link}$ 为链路传输一拍的时间。

二分带宽（bisection bandwidth）是衡量拓扑可扩展性的关键量：把网络均分为两半所需切断的链路总带宽。对 mesh，切面为 $k$ 条链路：

$$BW_{bisect} = k \cdot B_{link} = \sqrt{N} \cdot B_{link}$$

而全交叉开关可做到 $N/2 \cdot B_{link}$，代价是 $O(N^2)$ 的开关规模。理想的均匀流量下，每节点可持续注入带宽的上界近似：

$$b_{node} \le \frac{2 B_{link}}{\sqrt{N}} \quad \text{（mesh，均匀随机流量）}$$

这解释了为什么大 mesh 上「随机远程访问」性能远差于「局部访问」——这也是把内存控制器与 L2 切片沿网格散布（NUCA 思路）的根本动机。

## 四、代码实现

```c
/* XY 维序路由 + 虚通道选择（简化模型） */
typedef struct { int x, y; } coord_t;
enum { DIR_E, DIR_W, DIR_N, DIR_S, DIR_LOCAL };

static int route_xy(coord_t cur, coord_t dst) {
    if (cur.x < dst.x) return DIR_E;        /* 先走 X 维 */
    if (cur.x > dst.x) return DIR_W;
    if (cur.y < dst.y) return DIR_N;        /* X 维到位后再走 Y 维 */
    if (cur.y > dst.y) return DIR_S;
    return DIR_LOCAL;                        /* 到达目的路由器 */
}

/* 信用制流控：下游有空间才能发送一个 flit */
static int can_send(int out_port, int vc, int credits[MAX_PORT][MAX_VC]) {
    return credits[out_port][vc] > 0;
}

static void forward_flit(packet_t *p, int out_port, int vc) {
    if (!can_send(out_port, vc, g_credits)) return;   /* 反压：保持不动 */
    buf_push(out_port, vc, p->flits[p->sent++]);
    g_credits[out_port][vc]--;
}

/* 维序路由的死锁无关性：X 维完成后才允许进入 Y 维，
   依赖关系图中不存在指向低纬度的边，故无环。 */
```

若把两个独立的物理网络（或 VC 集合）分别用于请求与响应（应答），则请求网络与响应网络各自的依赖图互相独立，可以安全承载「读请求可能依赖写响应」这类跨阶段协议，避免协议级死锁。这是实际 NoC 与一致性协议协同设计中最常见的做法。

## 五、与其他技术对比

| 维度 | 共享总线 | 全交叉开关 | 环形 | 2D 网格 NoC |
| --- | --- | --- | --- | --- |
| 面积增长 | $O(1)$ 但线宽受限 | $O(N^2)$ | $O(N)$ | $O(N)$ |
| 二分带宽 | $B$（常数） | $O(N)$ | $O(1)$ 但每跳共享 | $O(\sqrt{N})$ |
| 延迟 | 低（小规模） | 最低 | 低（环短） | 随跳数增长 |
| 可扩展核数 | ≤ 约 10 | ≤ 约 16–32 | ≤ 约 20 | 数百 |
| 主要瓶颈 | 带宽争用 | 面积/功耗/线延迟 | 链路饱和 | 跳数与缓冲 |

## 六、常见误区

1. 认为 NoC 一定比总线快：核数少时总线更简单、延迟更低，NoC 的路由与缓冲纯属额外开销。
2. 认为 mesh 天然无死锁：只有配合无环路由函数（或足够 VC）才无死锁，自适应路由需额外构造。
3. 忽略头阻塞：wormhole 下单个阻塞 packet 会堵住整条 VC，必须靠虚通道缓解。
4. 混淆拓扑与协议：拓扑决定可达带宽与延迟上界，协议（缓存一致性）决定正确性，二者需分别验证。
5. 只优化平均延迟而忽略尾部延迟：一致性流量对尾延迟敏感，高负载下的队头排队会显著拖慢同步操作。
6. 认为增加 VC 总是有益的：VC 增加交叉开关与分配器复杂度、功耗，且会稀释单 VC 的缓冲深度。

## 七、与开源书·权威来源对应

- Hennessy & Patterson《Computer Architecture: A Quantitative Approach》：互连网络分类、延迟与带宽模型。
- Dally & Towles《Principles and Practices of Interconnection Networks》：拓扑、路由、流控与路由器微架构的标准参考。
- Patterson & Hennessy《Computer Organization and Design》：多核与片上互连的入门视角。
- Tanenbaum & Wetherall《Computer Networks》：分组交换、拥塞与流控的一般原理。
- Kurose & Ross《Computer Networking: A Top-Down Approach》：排队与吞吐—延迟权衡。
- Coulouris《Distributed Systems》：跨网络的路由与复制类比。

## 八、面试题

1. 问：XY 路由为何无死锁？答：维度顺序单调推进——先走完 X 维才进入 Y 维，通道依赖图中不存在从 Y 维回到 X 维的边，故无环，无环即无循环等待。
2. 问：虚通道解决什么问题？答：一是缓解头阻塞，使不同 packet 交错推进；二是为不同消息类（请求/响应/多播）提供独立资源，破除协议级循环依赖。
3. 问：二分带宽为什么重要？答：它刻画了拓扑在最坏切分下的可扩展带宽，mesh 的 $O(\sqrt{N})$ 增长正是其相对交叉开关「用面积换可扩展性」的本质。
4. 问：信用制流控与基于速率的流控有何区别？答：信用制按下游缓冲余量精确反压，无丢包且缓冲利用率高；速率式流控按发送配额限速，实现简单但可能出现缓冲空闲。
5. 问：NoC 与一致性协议如何协同？答：把请求与响应分离到独立网络/VC，保证协议阶段图无环；同时让 home/L2 切片沿网络散布，降低平均跳数。

## 九、演进与趋势

- 拓扑多样化：环形、蝶形（butterfly）、torus、混合 ring+mesh，按规模与流量模式选择。
- 3D 堆叠与硅中介层：垂直链路大幅降低平均跳数，但带来热与 TSV 面积约束。
- 光电混合 NoC：片内光互连在长距离、高带宽场景替代电链路，缓解线延迟与功耗。
- 与缓存一致性融合：一致性 NoC（coherent NoC）把缓存状态机部分下移到网络接口，减少探针流量。
- 无线/射频 NoC 与可重构 NoC：面向特定流量模式动态改变拓扑或路由，属于研究前沿，工程落地仍有限。

## 十、小结

NoC 用「路由器 + 链路 + 分组交换」把全局总线替换为可扩展的片上网络：拓扑决定二分带宽与跳数，路由与虚通道决定无死锁与头阻塞表现，流控决定缓冲效率与吞吐上限。它的价值不在单次访问延迟，而在于让带宽随核数近似线性增长——这正是多核时代互连的必然选择。
