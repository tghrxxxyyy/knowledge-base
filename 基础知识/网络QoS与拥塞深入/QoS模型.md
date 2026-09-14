# QoS模型

> 对应 RFC 1633（Integrated Services 架构）；RFC 2205（RSVP）；RFC 2475（DiffServ 架构）；RFC 2998（DiffServ 框架）；Kurose & Ross《Computer Networking: A Top-Down Approach》QoS 章节。

## 一、背景与挑战
同一条链路上同时跑着语音、视频会议、网页浏览、批量备份和软件更新。它们对网络的要求完全不同：语音要求低时延与低抖动（对丢包容忍度中等），视频要求稳定带宽，网页要求低时延但流量很小，备份只要求吞吐、对时延不敏感。而 IP 的默认语义是尽力而为（best effort）：所有包排队等待同一个 FIFO 队列，先到先服务。

QoS 要回答的是：在总容量固定的前提下，如何让关键业务在拥塞时仍然得到可预期的服务。这里最关键的一句话是——QoS 不能凭空增加带宽，它只能重新分配已有资源。任何声称 QoS 能「创造带宽」的说法都不成立，它能做的是牺牲低优先级业务的确定性来换取高优先级业务的确定性。

## 二、核心原理
历史上形成两大模型。

**IntServ（集成服务）**：为每条流提供端到端资源预留。发送端用 RSVP 沿着路径逐跳发起预留请求，沿途路由器执行准入控制（admission control）——若剩余资源不足以满足新流的请求，就拒绝该预留。预留成立后，该流获得明确的带宽与时延承诺。IntServ 定义了 Guaranteed Service 与 Controlled Load Service 两类服务（分别由 RFC 2212 与 RFC 2211 规定）。问题在于状态量：核心路由器要维护每条流的状态，路由器状态数随流数线性增长，在骨干网不可扩展。

**DiffServ（区分服务）**：放弃逐流状态，退回「类」的粒度。在网络边界（信任边界）对包做分类、计量、标记，把流量归入少量行为聚合（BA）；核心路由器只按 DSCP 对应的每跳行为（PHB）处理，不区分单个流。核心因此保持无状态（或只有极少的类级状态），可扩展性大幅提升。代价是保证变成「相对/统计」的类级保证，而不是逐流硬保证。

Best-Effort 是这两者之外的基线：不分类、不预留、不保证。

## 三、形式化与数学基础
IntServ 的准入控制本质是约束满足。设链路容量 $C$，已有预留集合 $\{B_f\}$，新流请求 $B_{new}$，则准入条件为
$$\sum_{f \in \mathcal{F}} B_f + B_{new} \le \eta \cdot C, \qquad 0 < \eta \le 1$$
其中 $\eta$ 为链路利用率上限（留出突发与协议开销余量）。Guaranteed Service 给出的端到端时延上界形如（符号含义同 RFC 2212，含令牌桶参数 $(r, b)$、峰值速率 $p$、MTU $M$、每跳服务速率 $R_i$ 与固定时延 $D_i$、速率相关项 $C_i$）：
$$D = \frac{(b-M)}{R}\cdot\frac{p-R}{p-r} + \frac{M}{R} + \sum_i \frac{C_i}{R_i} + \sum_i D_i$$
这个式子说明：时延上界由令牌桶参数、服务速率和跳数共同决定，而不是一个可以无条件承诺的常数。

DiffServ 的类级保证则弱化为聚合约束：属于类 $C_k$ 的所有流共享一个保障额度 $G_k$，
$$\sum_{f \in C_k} B_f \le G_k$$
调度侧用 WFQ / DRR 类算法按权重分配剩余带宽：类 $k$ 至少获得
$$R_k \ge \frac{w_k}{\sum_j w_j}\, C$$
在链路空闲时，未使用的额度可被其它类借用（statistical multiplexing），这是 DiffServ 相比 IntServ 在效率上的优势。

## 四、代码实现
边界路由器与核心路由器的职责分工，用伪代码表达最清楚：
```text
边界（Edge）路由器 —— 有分类器与计量器：
  dscp = multifield_classify(pkt)        # 五元组 + 应用识别
  if not meter_ok(sla_for(src, dscp)):   # 令牌桶计量
      dscp = remark_down(dscp)           # 超规降级或丢弃
  pkt.dscp = dscp

核心（Core）路由器 —— 只见 DSCP，不看流：
  cls  = phb_of(pkt.dscp)                # 映射到行为聚合
  if not enqueue(pkt, queue[cls]):       # 队列满 ⇒ 按类丢弃
      drop(pkt, cls)
  schedule()                             # WFQ / DRR：按类权重出队
```
用 Linux 的 `tc` 落地一个最简 DiffServ 边界：分类打标 + 类级调度。
```bash
# 1) 边界打标：把 443 端口的交互流量标为 AF21
iptables -t mangle -A POSTROUTING -p tcp --dport 443 -j DSCP --set-dscp-class AF21
# 2) 核心侧按 DSCP 分类到 HTB 类
tc qdisc add dev eth0 root handle 1: htb default 30
tc class add dev eth0 parent 1:  classid 1:1  htb rate 100mbit ceil 200mbit
tc class add dev eth0 parent 1:1 classid 1:10 htb rate 40mbit ceil 100mbit   # EF 类
tc class add dev eth0 parent 1:1 classid 1:20 htb rate 40mbit ceil 100mbit   # AF 类
tc filter add dev eth0 protocol ip parent 1:0 prio 1 u32 \
  match ip tos 0xb8 0xfc flowid 1:10        # EF：0xb8 为 DSCP EF 左移后的 ToS 值
```

## 五、与其他技术对比
| 维度 | Best-Effort | IntServ | DiffServ |
| --- | --- | --- | --- |
| 保证粒度 | 无 | 每流 | 每类（行为聚合） |
| 状态量 | 无 | O(流数) | O(类数) |
| 信令 | 无 | RSVP 逐跳预留 | 无（边界标记即可） |
| 准入控制 | 无 | 有（逐跳） | 无（改为边界计量） |
| 可扩展性 | 最好 | 差 | 好 |
| 典型时延保证 | 无 | 有明确上界 | 类级相对保证 |
| 部署现实 | 默认 | 少见（边缘/专用网络） | 主流 |

## 六、常见误区
- 认为 QoS 能凭空增加带宽。它只重新分配已有容量，拥塞下高优先级业务的收益来自低优先级业务的让渡。
- 认为 DiffServ 能逐流保证。它只提供类级保证，同一类内部流之间没有隔离。
- 认为部署 IntServ 很普遍。逐流状态导致的扩展性问题使它在骨干网基本不可行，多见于企业边缘与专用网络。
- 认为打了 DSCP 标记就获得优先。标记只提供信息，实际效果取决于沿途设备是否信任该标记并按 PHB 调度。
- 认为 QoS 只在拥塞时才有意义。这是对的，但恰恰因此不能靠「加大带宽」替代 QoS——峰值拥塞总会发生。
- 忽略信任边界。终端自行打标的高优先级标记若被无条件信任，会被滥用为「抢占资源」，因此需要边界重标记。

## 七、与开源书·权威来源对应
- RFC 1633：Integrated Services 架构，定义逐流预留、准入控制与两类服务的基本模型。
- RFC 2205：RSVP 协议规范，说明预留消息如何在路径上建立与刷新软状态。
- RFC 2475：DiffServ 架构，定义 DS 域、边界与核心的职责划分、traffic conditioning 组件。
- RFC 2998：DiffServ 框架与逐跳行为的组织方式，说明可扩展性的设计取舍。
- Kurose & Ross《Computer Networking: A Top-Down Approach》：QoS 章节以调度与整形为主线对比两模型，并给出「QoS 不增加带宽」的明确表述。
- Tanenbaum《Computer Networks》：QoS 与集成/区分服务章节，提供教学式对比与调度算法（FIFO/PQ/WFQ）说明。

## 八、面试题
1. IntServ 与 DiffServ 的区别？要点：前者逐流预留 + 准入控制、状态 O(流数)、扩展性差；后者边界标记 + 类级 PHB、状态 O(类数)、可扩展但保证较弱。
2. QoS 能增加带宽吗？要点：不能，只能在固定容量下重新分配，收益来自优先级与隔离，而非总量提升。
3. 准入控制为什么必要？要点：防止预留总量超过链路容量导致已承诺业务的保证被破坏，是 IntServ 保证成立的前提。
4. 为什么骨干网选 DiffServ？要点：核心只需按 DSCP 调度，无需维护逐流状态，转发性能与可扩展性都更好。
5. WFQ 提供了什么保证？要点：按权重分配带宽，使类 $k$ 至少获得 $w_k/\sum w_j$ 的份额，同时保留统计复用的效率。
6. QoS 与 SLA 的关系？要点：SLA 是商业承诺，QoS 机制是兑现手段；没有边界计量与重标记，SLA 无法被强制。

## 九、演进与趋势
DiffServ 仍是主流框架，演进主要发生在两处：一是与主动队列管理结合，用 AQM 控制排队时延（而不只是分配带宽）；二是把「类」的划分与自动化策略下发（SDN/控制器）结合，减少手工配置。此外，5G 网络切片借用 QoS 框架表达切片级保证，数据中心则更关注基于拥塞控制（如 DCQCN 类）的端到端低时延，而非静态分类。具体规范以官方最新文档为准。

## 十、小结
QoS 的本质是在容量固定的网络里做资源分配决策：IntServ 用逐流预留换取强保证但牺牲扩展性，DiffServ 用类级调度换取扩展性但只给出相对保证。选择哪一个，取决于你能承受多少状态、需要多强的承诺、以及是否愿意在边界投入计量与重标记的运维成本。
