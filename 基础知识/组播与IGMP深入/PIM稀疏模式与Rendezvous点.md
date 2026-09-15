# PIM稀疏模式与Rendezvous点

> 对应 RFC 4601（Protocol Independent Multicast - Sparse Mode, PIM-SM）与 RFC 7761（PIM 更新整合版）。

## 一、背景与挑战

组播路由协议要在网络中建立从源到接收者的分发树。密集模式（PIM-DM）假设接收者密集，用「泛洪-剪枝」把流推到全网再剪掉无关分支，适合 LAN 但浪费 WAN 带宽。稀疏模式（PIM-SM）假设接收者稀疏、分散，借助一个汇聚点（Rendezvous Point, RP）按需建树，更适合大规模、跨域网络。难点是：如何让「不知道源在哪」的接收者与「不知道谁在收」的源在稀疏网络中高效汇合，同时避免 RP 成为单点与性能瓶颈。

## 二、核心原理

PIM-SM 中接收者先经 IGMP 加入，其 DR（指定路由器）向 RP 发送 `(*, G)` Join，建立以 RP 为根的共享树（RPT），接收者即可收流。源侧 DR 发现新源后，向 RP 发送 `Register` 单播封装把首包送给 RP，RP 沿 RPT 下发；同时 RP 向源发送 `(S, G)` Join，建立以源为根的源树（SPT）的一段。数据可在 RPT 上传输，也可由接收者侧 DR 触发 `(S, G)` Join 直接切到 SPT（更短路径、减轻 RP 负担）。RP 可静态配置、或用 BSR/Auto-RP 动态发现。切换阈值 `spt-threshold` 控制何时切源树（通常按速率）。PIM-SM 的「协议无关」指它不依赖特定单播路由协议，只用单播路由表做 RPF。

## 三、形式化与数学基础

共享树状态（以 RP 为根）：

$$ RPT:\ (*, G),\quad root=RP $$

源注册后建立源树（以源 $S$ 为根）：

$$ SPT:\ (S, G),\quad root=S $$

SPT 切换由速率阈值触发：

$$ \text{切换到 SPT} \iff rate(S,G) > spt\_threshold $$

最后一跳路由器维护 `(*, G)` 与 `(S, G)` 两份状态：前者用于快速收到流，后者用于优化路径。RP 失效影响仅限「尚未切 SPT」的流量，已切 SPT 的数据不经 RP。共享树路径长度通常大于源树，故高吞吐流切 SPT 收益明显：

$$ cost(RPT) \ge cost(SPT) \quad (\text{多数拓扑}) $$

## 四、代码实现

```text
# FRR/Quagga 配置 PIM-SM（示意）
router pim
 ip pim rp-address 192.0.2.1        # 静态 RP
 interface eth0
  ip pim sm                          # 在接口启用 PIM-SM
```

查看邻居与组播路由状态：

```bash
vtysh -c 'show ip pim neighbor'
vtysh -c 'show ip mroute'
ip mroute show                       # 内核组播路由（Linux）
```

动态 RP 发现（BSR）：

```text
router pim
 ip pim bsr-candidate Loopback0
 ip pim rp-candidate Loopback0 group-list 224.0.0.0/4
```

## 五、与其他技术对比

| 协议 | 建树方式 | 适合 | RP |
| --- | --- | --- | --- |
| PIM-DM | 泛洪-剪枝 | 接收者密集 | 无 |
| PIM-SM | RP 汇聚按需 | 接收者稀疏 | 有 |
| PIM-SSM | 直接 (S,G) 源树 | 指定源 | 无（无需 RP） |

PIM-DM 适合密集；PIM-SM 以 RP 按需适合稀疏；PIM-SSM 进一步简化去掉 RP，仅用 (S,G) 源树。PIM-SM 的复杂度主要来自 RP 与 RPT/SPT 切换。

## 六、常见误区

1. 以为 RP 是性能瓶颈——数据在 SPT 切换后不经 RP，RP 仅负责初始汇合与注册。
2. 以为 SPT 一定更优——某些低速率场景 RPT 已够，切 SPT 反而增加 (S,G) 状态与切换开销。
3. 忽略 RP 的单点——RP 故障会影响未切 SPT 的流，需用 Anycast-RP（MSDP/PIM 备份）提升可用。
4. 混淆 RPT 与 SPT 切换时机——切换由最后一跳 DR 发起，源侧不知接收者已切树。
5. 以为 PIM-SM 依赖某单播协议——它「协议无关」，只用单播路由表做 RPF 判定。

## 七、与开源书·权威来源对应

- RFC 4601（Estrin et al.）：定义 PIM-SM、RPT 与 RP 注册机制，是标准本身。
- RFC 7761：整合 PIM 各变体的更新版，修正若干行为细节（如 DR 选举、断言处理）。
- Kurose & Ross《Computer Networking》ch4：组播路由与 RPF 的入门。
- Tanenbaum《Computer Networks》ch5：组播路由协议对比。
- RFC 4611 / MSDP：Anycast-RP 与域间组播背景。

## 八、面试题

1. PIM-SM 为何先走 RPT 再切 SPT？
   要点：RPT 无需源信息即可让接收者快速收流；随后按速率阈值切到源树获得更短路径、减轻 RP 负担。
2. 源如何把首包送给 RP？
   要点：源 DR 用 `Register` 单播封装首包到 RP，RP 解封沿 RPT 下发并反向建 (S,G) 树。
3. RP 失效影响什么流量？
   要点：仅影响「尚未切 SPT」的流；已切 SPT 的数据不经 RP，不受影响（需 Anycast-RP 容错）。
4. 为什么叫「协议无关」？
   要点：PIM-SM 不绑定特定 IGP，只借用单播路由表做 RPF 接口判定来建树。

## 九、演进与趋势

PIM-SSM（RFC 4607）在视频等指定源场景成主流，去掉 RP 简化部署；BIER（RFC 8279）以比特索引转发免建树；SDN 用控制器集中算树替代分布式 PIM；Anycast-RP 用 MSDP/PIM 备份消解单点。域间组播（MBGP + MSDP）则在运营商网络互联 ASM 域。

## 十、小结

PIM-SM 以 RP 汇聚、按需建立共享树并可选切源树，是大规模稀疏组播的标准方案。理解 RP 角色、RPT/SPT 切换与注册机制，是运维与排错 PIM 网络的核心——记住「RP 仅负责初始汇合，高吞吐流终将走 SPT」，便能正确判断性能与故障。
