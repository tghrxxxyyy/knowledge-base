# QoS模型

> 对应 RFC 1633（IntServ）；RFC 2475（DiffServ）；RFC 2998（DiffServ 框架）。

## 一、背景与挑战
网络资源有限，不同业务（语音、视频、网页、备份）对时延/丢包/带宽要求迥异。QoS（服务质量）目标是按需分配资源、保障关键业务。

## 二、核心原理
两大模型：IntServ（集成服务）用 RSVP 逐流预留资源，保证强但扩展性差；DiffServ（区分服务）把流量归类到少量行为聚合（PHB），在网络边界标记、核心按类调度，可扩展。Best-Effort 是“无 QoS”基线。

## 三、形式化 / 数学基础
IntServ 资源预留：对每流 $f$ 预留带宽 $B_f$、时延上界 $D_f$，路径上每跳准入控制 $\sum B_f \le C_{link}$。
DiffServ 聚合：流量归入类 $C_k$，类级保证 $\sum_{f\in C_k} B_f \le G_k$（$G_k$ 为类保障）。
调度：WFQ 按权重分配带宽，保证类 k 至少 $w_k/\sum w$ 份额。

## 四、代码实现
```text
边界路由器：
  classify(pkt) -> DSCP
  mark(pkt, dscp)
核心路由器：
  enqueue(pkt, queue[dscp_class])
  schedule() -> WFQ by class weight
```

## 五、与其他技术对比
IntServ 强保证但 O(流数) 状态难扩展；DiffServ 可扩展但仅“类级”保证、无逐流硬保障。对比 Best-Effort 完全无差别。

## 六、常见误区
误区一：QoS 能凭空增加带宽。错，只是更优调度已有带宽。误区二：DiffServ 能逐流保证。错，只到类级。误区三：部署 IntServ 很普遍。错，因扩展性差少用。

## 七、与开源书 / 权威来源对应
- CS-Notes：https://github.com/CyC2018/CS-Notes
- RFC 1633、RFC 2475、RFC 2998、Kurose & Ross 第 6 章（QoS）。

## 八、面试题
1. IntServ 与 DiffServ 区别？2. QoS 能增加带宽吗？

## 九、演进与趋势
DiffServ 仍是主流；与主动队列管理（AQM，如 CoDel）结合降时延；5G 网络切片借 QoS 框架。

## 十、小结
QoS 用 IntServ（逐流预留）或 DiffServ（类级调度）按需保障带宽与时延，DiffServ 因可扩展而主流。
