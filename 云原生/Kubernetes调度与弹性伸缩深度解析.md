# Kubernetes 调度与弹性伸缩深度解析

> 本文深入 K8s 的调度（Scheduler）机制与弹性伸缩（HPA/VPA/CA）原理，覆盖调度流程、亲和性、资源请求与限制、扩缩容策略与实战陷阱。内容基于 K8s 公开设计与实践，版本特性以官方文档为准。

## 1. 调度在做什么

K8s Scheduler 的职责：为**未绑定节点的 Pod** 挑选一个合适的节点。它不直接跑容器，只做"决策"，真正的启动由 kubelet 执行。

调度是"偏好 + 约束"的匹配过程：既要满足硬性约束（资源够、节点选择器匹配、污点容忍），又要在满足条件的节点里按优先级挑最优。

## 2. 调度流程

### 2.1 两大阶段

- **过滤（Filtering / Predicates）**：剔除不满足约束的节点（资源不足、端口冲突、亲和性不满足、污点不容忍）。
- **打分（Scoring / Priorities）**：对剩余节点打分，择优（如最少请求资源、均衡分布、镜像本地性）。

### 2.2 关键约束

- **资源请求（requests）**：调度依据的是 requests 而非 limits。节点可用资源 = 总量 - 已分配 requests。
- **节点选择器 / 亲和性**：硬性要求落在特定节点/拓扑。
- **污点与容忍（Taint & Toleration）**：节点排斥 Pod，除非 Pod 容忍。
- **拓扑分布（TopologySpreadConstraints）**：跨可用区/机架均匀分布。

## 3. 资源 requests 与 limits

### 3.1 requests

- 调度与配额依据。
- 设太小 → 节点超卖，运行时争抢；设太大 → 调度困难、利用率低。

### 3.2 limits

- 运行时上限（CPU 可 throttled，内存超了 OOMKill）。
- 只设 limits 不设 requests 是反模式：调度器不知真实需求。

### 3.3 QoS 等级

- **Guaranteed**：requests == limits，最高优先级，最后被驱逐。
- **Burstable**：requests < limits，中等。
- **BestEffort**：都不设，最低，节点压力大时首先被驱逐。

## 4. 亲和性与反亲和性

- **节点亲和（nodeAffinity）**：Pod 偏好/要求特定节点（按标签）。
- **Pod 亲和/反亲和（podAffinity/podAntiAffinity）**：Pod 间同/不同拓扑共存。
- 反亲和常用于"同服务多副本分散到不同节点/可用区"以提升可用性。

注意：反亲和性在大规模下调度开销大，需权衡。

## 5. 污点与容忍

- 给节点打污点（如 master 节点 `NoSchedule`），普通 Pod 不上。
- 专用节点（GPU/大内存）用污点隔离，特定 Pod 用容忍独占。
- 驱逐（NoExecute）污点会让不容忍的 Pod 被移走。

## 6. HPA：横向 Pod 自动伸缩

### 6.1 原理

HPA 周期（默认 15s）采集 Pod 指标（CPU 利用率 = 实际使用/requests），与目标比对，调整副本数。

```
desiredReplicas = ceil(currentReplicas * (currentMetric / targetMetric))
```

### 6.2 指标来源

- 默认：CPU（基于 requests 的利用率）。
- 自定义指标：QPS、消息堆积、P99，需 metrics-server + 自定义适配器（如 Prometheus Adapter）。
- 外部指标：如队列长度。

### 6.3 注意

- 必须设 requests 否则 CPU 利用率无从计算。
- 扩缩有冷却（stabilization）防止抖动。
- 下限/上限设合理，避免无限扩或缩到 0（除非允许）。

## 7. VPA：垂直 Pod 自动伸缩

VPA 调整 Pod 的 requests/limits（即给更多/更少资源）。它需**重建 Pod** 才能生效（重建由 Eviction 机制触发），因此与 HPA 同用需谨慎（二者可能冲突）。

适用：无法水平扩展的有状态单实例、或调优资源 request 不准的场景。

## 8. Cluster Autoscaler：节点级伸缩

当 Pod 因资源不足无法调度（Pending），Cluster Autoscaler 增加节点；当节点长期低利用率，缩容回收。

- 需云厂商支持（自动增删节点）。
- 缩容有保护（Pod 有防驱逐注解、DaemonSet、本地存储则跳过）。
- 与 HPA 配合：HPA 扩 Pod → 资源不足 → CA 扩节点。

## 9. 多副本与可用性

- **PodDisruptionBudget（PDB）**：保证自愿中断（升级、缩容）时最少可用副本数，防止一次性全杀。
- **拓扑分布**：跨可用区分散，单 AZ 故障不致命。
- **优雅终止**：preStop + terminationGracePeriod 让流量摘掉再退出。

## 10. 调度性能与大规模

- 集群大（数千节点）时，过滤+打分开销上升。
- 优化：调度器插件化（Scheduler Framework）、比例采样、等价类缓存。
- 多调度器：不同负载用不同策略。

## 11. 弹性策略组合

典型生产组合：

- HPA 按 QPS/CPU 扩 Pod。
- CA 在节点不够时扩节点。
- VPA 调优单 Pod 资源（若不与 HPA 冲突）。
- PDB 保障升级不中断。
- 定时 HPA：大促前预设副本，避免冷启动慢。

## 12. 常见踩坑

1. **不设 requests**：调度器盲目放置，节点超卖，运行时 CPU throttled 或 OOM。
2. **只设 limits 不设 requests**：调度依据缺失，资源核算失真。
3. **HPA 基于 CPU 但服务 CPU 用不满**：应换 QPS/自定义指标。
4. **反亲和导致无法调度**：要求太分散又节点不足，Pod Pending。
5. **VPA 与 HPA 冲突**：同时调资源与副本，行为难预期；通常二选一或分维度。
6. **无 PDB 滚动升级**：一次性杀光副本，服务中断。
7. **CA 缩容误杀有状态**：未配保护，丢失本地状态；需注解防驱逐。
8. **OOM 频繁**：limits 内存设太低，应据实际峰值调。

## 13. 资源治理建议

- 用监控数据（实际利用率）反推 requests，而非拍脑袋。
- 设合理的 limit/request 比例（如 limit = 1.5–2× request）。
- 关键服务设 Guaranteed QoS。
- 用命名空间 ResourceQuota + LimitRange 约束。
- 定期审查"资源大户"与"长尾低利用率"。

## 14. 与成本优化的关系

弹性伸缩直接关系成本：

- 高峰自动扩、低谷自动缩，避免常备过量。
- CA 回收闲置节点省云费用。
- 但过度激进缩容会影响突发承接，需留余量。

## 15. 小结

K8s 调度是"约束过滤 + 偏好打分"的匹配，弹性伸缩是 HPA（Pod 级）+ CA（节点级）+ VPA（资源级）的协同。落地铁律：**必须设 requests、用 PDB 保中断安全、指标选对（CPU 非万能）、HPA/VPA 防冲突、CA 配防驱逐保护**。资源治理是稳定性与成本的交汇点。
