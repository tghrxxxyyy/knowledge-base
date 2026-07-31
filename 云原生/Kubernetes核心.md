# Kubernetes 核心

## 〇、本体介绍

**Kubernetes（K8s）是什么**：容器编排的事实标准。它把「在哪些节点上跑多少个容器、怎么暴露、挂了怎么拉起、流量怎么分发」从人工运维变成**声明式**的自动调谐——你描述「期望状态（Spec）」，控制器不断把「实际状态（Status）」向 Spec 拉齐。

**解决什么痛点**：容器多了以后，谁调度、谁发现、谁负载均衡、谁自愈、谁扩缩容、谁灰度发布——纯手工或脚本不可持续。K8s 提供一套统一的编排原语。

**核心概念**：Pod（最小调度单元）、Deployment/StatefulSet/DaemonSet（工作负载）、Service（稳定入口）、Namespace（隔离）、ConfigMap/Secret（配置）、PV/PVC（存储）、CRD/Operator（扩展）。

**适用场景**：微服务、弹性 Web 服务、有状态中间件、批处理（Job/CronJob）、多环境一致交付。
**不适用场景**：单机小项目（杀鸡用牛刀）、强隔离多租户（需配合虚拟化）、对调度延迟极敏感（调度约 100 pods/s 量级）。

> 关联：本文件是 `云原生/K8S.md`（早期截图笔记）的结构化文字版，截图里看不清的图在此以文字 + 表格补完。

---

## 一、架构总览：控制平面 + 工作节点

**控制平面（Control Plane）**
- **kube-apiserver**：所有操作的唯一入口（kubectl、控制器、kubelet 都打它），负责鉴权、校验、把状态写进 etcd。可水平扩展（多实例 + LB）。
- **etcd**：集群唯一事实源，存全部状态（Pod/Service/Secret/Node…），用 **Raft** 保证一致与复制。单点风险高，必须备份 + 多副本高可用。
- **kube-scheduler**：监听「新创建、未分配节点」的 Pod，挑节点。两阶段：**Filter（过滤不可行节点）→ Score（给可行节点打分）→ Bind**。
- **kube-controller-manager**：跑一堆控制器循环（ReplicaSet 保副本数、Node 检故障、Endpoint 维护…），实现「期望 vs 实际」的调谐。

**工作节点（Node）**
- **kubelet**：节点代理，确保 PodSpec 描述的容器真正跑起来并健康，向 API Server 上报状态。
- **kube-proxy**：在节点上维护 Service 转发规则（iptables 或 IPVS 模式）。
- **容器运行时**：containerd / CRI-O（K8s 1.24 起不再内置 Docker，走 CRI 标准）。

---

## 二、声明式 API 的本质：Spec / Status / Reconcile

- 你写 YAML 描述 **Spec**（如 `replicas: 3`）；集群实时汇报 **Status**（如 `readyReplicas: 2`）。
- 控制器**无限循环**地对比 diff，直到 Status 与 Spec 一致——这就是声明式系统的心脏，区别于「下一条命令就完事」的命令式。

> 例子：Deployment 说要 3 个副本，ReplicaSet Controller 发现只有 2 个，就创建第 3 个，直到对齐。

---

## 三、Pod：最小调度单元

- **本质**：一组**共享 Network/IPC Namespace、可共享 Volume** 的容器（典型是「1 业务容器 + 1 sidecar」）。
- **Pod 内共享**：同一 IP、端口空间、IPC；通过 `volumes` 声明的卷可被多容器挂载（如 sidecar 采集日志）。
- **Init 容器**：普通容器启动前**串行**跑、且必须全成功，适合做前置依赖检查（如 `while ! nc -z mysql 3306` 等 DB 就绪）。
- **两种 Pod**：自主式（无控制器，挂了不重建，仅测试）；受控式（Deployment/StatefulSet/DaemonSet 管理，自愈、弹性、滚动更新）。

### Pod 生命周期阶段
`Pending`（已接收但未调度/镜像未拉完）→ `ContainerCreating` → `Running`（至少一个容器在跑）→ `Succeeded` / `Failed`。`Unknown` 多为节点通信失败。

### 探针（Probe）
- **liveness**：失败 → **重启容器**，用于检测「死锁等无法自愈」状态。
- **readiness**：失败 → **不重启**，只是把 Pod 从 Service Endpoints 摘除，停止收新流量，用于「初始化中 / 依赖未就绪」。
- **startup**：保护慢启动应用，启动阶段前不触发 liveness。

> 经典坑：把「是否就绪」误配成 liveness，导致初始化慢的 Pod 被反复重启。

---

## 四、工作负载类型

| 类型 | 适用 | 关键特征 |
|------|------|---------|
| Deployment | 无状态（Web） | 滚动更新、回滚、副本 |
| StatefulSet | 有状态（DB） | 稳定网络标识、持久存储、有序扩缩 |
| DaemonSet | 每节点一个（agent） | 日志采集、Node Exporter、安全 agent |
| Job / CronJob | 批处理 / 定时 | 跑完即止 / 周期执行 |

---

## 五、调度流程（Filter → Score → Bind）

1. **Filter（可行性）**：CPU/内存够不够？Pod 是否能容忍节点 Taint？是否匹配 nodeSelector/nodeAffinity？所需卷在节点可用？是否到 Pod 上限？
2. **Score（打分，0~100）**：资源均衡（偏好整体利用率均匀）、软亲和/反亲和、拓扑分布（TopologySpread）、镜像本地性（已有镜像的节点加分）。
3. **Bind**：选最高分节点绑定。典型吞吐约 100 pods/s。

### 亲和 / 反亲和 / 污点
- **NodeSelector**：精确匹配标签。
- **NodeAffinity**：规则化地「偏好/必须」某些节点。
- **PodAffinity / AntiAffinity**：把 Pod 拉近 / 打散到其他 Pod 附近（高可用）。
- **Taint / Toleration**：节点「污点」排斥 Pod，Pod 需「容忍」才能调度上去——用于隔离专用节点（如 GPU 节点）。

---

## 六、网络模型（三条铁律）

1. 每个 Pod 有自己独立的 IP。
2. 任意两个 Pod 通信**无需 NAT**。
3. 节点上的 agent 能与本节点所有 Pod 通信。

- **CNI（Container Network Interface）**：网络插件接口，实现 Pod 网络。主流：**Calico**（BGP 路由 + NetworkPolicy）、**Cilium**（eBPF，高性能 + 可观测）、**Flannel**（简单 VXLAN Overlay）。
- **Service**：稳定虚拟 IP（ClusterIP）按 label selector 负载到后端 Pod；Pod 增删时 Endpoints Controller 更新端点列表；kube-proxy 写 iptables/IPVS 规则转发。类型：ClusterIP / NodePort / LoadBalancer。
- **CoreDNS**：集群内 DNS，`my-service.default.svc.cluster.local` 可解析到 Service。

---

## 七、存储：PV / PVC / StorageClass

- **PV（PersistentVolume）**：集群级存储资源（由管理员或动态供给）。
- **PVC（PersistentVolumeClaim）**：Pod 对存储的「申领」。
- **StorageClass**：定义「动态供给」的存储类型（如云盘 SSD）。
- CSI（Container Storage Interface）：存储插件标准，对接各家云盘/NFS/Ceph。

> 对比容器可写层：PVC 挂载的卷**不随 Pod 删除而消失**，是有状态服务持久化的关键。

---

## 八、弹性：HPA / VPA / Cluster Autoscaler

- **HPA（Horizontal Pod Autoscaler）**：按 CPU / 内存 / 自定义指标扩缩 Pod 副本数。
- **VPA（Vertical）**：调整单个 Pod 的 request/limit（与 HPA 可能冲突，需设计）。
- **Cluster Autoscaler**：节点级扩缩（Pod 因资源不足 Pending 时加节点）。

---

## 九、滚动更新与零停机发布

- Deployment 滚动更新：先起新版本 Pod，readiness 通过后入 Service，再逐步替换旧 Pod。
- 关键参数：`maxUnavailable`（允许同时不可用的副本数）、`maxSurge`（允许超出期望的副本数）。零停机常设 `maxUnavailable=0`。
- readinessProbe 保证「真就绪才接流量」；出问题 `kubectl rollout undo` 一键回滚。

---

## 十、生产排障速查

| 现象 | 第一步 | 常见原因 |
|------|--------|---------|
| Pod `CrashLoopBackOff` | `kubectl logs --previous` | 应用崩溃、配置缺失、启动失败、资源受限（指数退避重启） |
| Pod `Pending` | `kubectl describe pod` / `get events` | 资源不足、缺 PVC、nodeSelector 不符、Taint 无 toleration、节点不可调度 |
| Service 不通 | `get svc` / `get endpoints` | selector 错、端点空、Pod 不健康 |
| Node `NotReady` | `describe node` | kubelet 挂、网络问题、disk/memory pressure |
| 集群内 DNS 失败 | 查 CoreDNS Pod / 日志 | CoreDNS 未就绪、网络策略、Service 连通 |
| 能通 Pod 但出不了外网 | 查 DNS / NetworkPolicy / NAT | 出网网关、防火墙、CNI 配置 |

---

## 十一、高可用控制平面

多 API Server（前加 LB）+ 多 Controller-Manager + 多 Scheduler + **高可用 etcd 集群**，消除单点。etcd 备份是「救命稻草」。

---

## 十二、与其他板块的关系

- **场景设计 / 稳定性三板斧**：liveness/readiness、HPA、滚动更新是限流/熔断/降级的落地载体。
- **架构 / 系统架构**：微服务、事件驱动在 K8s 上才有标准运行底座。
- **源码系列 / Nacos/Sentinel/RocketMQ**：以 Deployment/StatefulSet 形态运行，Service 提供稳定入口。
- **CI/CD / GitOps**：镜像构建 → Helm → GitOps 同步到集群。

---

## 十三、速查表

| 动作 | 命令 |
|------|------|
| 看 Pod | `kubectl get pod -o wide` |
| 看事件 | `kubectl get events --sort-by=.lastTimestamp` |
| 描述排障 | `kubectl describe pod <p>` |
| 看日志（上次） | `kubectl logs <p> --previous` |
| 进 Pod | `kubectl exec -it <p> -- sh` |
| 滚动状态 | `kubectl rollout status deploy/<d>` |
| 回滚 | `kubectl rollout undo deploy/<d>` |
| 扩缩容 | `kubectl scale deploy/<d> --replicas=5` |

---

## 面试高频问题（20+ 条）

1. **K8s 核心组件？** API Server（入口/状态）、etcd（Raft 状态存储）、Scheduler（调度）、Controller-Manager（调谐）、kubelet（节点代理）、kube-proxy（Service 规则）、容器运行时。
2. **为什么 API Server 是核心？** 所有 kubectl/控制器/kubelet 都打它，它做鉴权校验并写 etcd；可水平扩展。
3. **etcd 为什么是单点风险？** 它存全部集群状态，挂了新变更无法持久、调度/API 退化；必须多副本 + 备份。
4. **声明式 vs 命令式？** 声明式写「期望状态（Spec）」，控制器循环调谐；命令式是「下一条指令就完事」。
5. **Pod 内容器如何共享？** 共享 Network/IPC Namespace 与声明卷；故同 Pod 同 IP、可共享 emptyDir 日志卷。
6. **Init 容器作用？** 普通容器前串行、必须全成功，做前置依赖检查。
7. **Pod 生命周期阶段？** Pending→Running→Succeeded/Failed；CrashLoopBackOff 是启动即退、指数退避重启。
8. **liveness 和 readiness 区别？** liveness 失败重启容器（检测死锁）；readiness 失败摘流量不重启（检测就绪）。
9. **Deployment vs StatefulSet？** 无状态用 Deployment（副本互换）；有状态用 StatefulSet（稳定标识/存储/有序）。
10. **DaemonSet 用途？** 每节点跑一个（日志采集、Node Exporter、安全 agent）。
11. **调度两阶段？** Filter（过滤不可行）→ Score（0~100 打分）→ Bind（选最高分）。
12. **NodeAffinity / PodAntiAffinity？** 前者按标签偏好节点；后者把 Pod 打散到其他 Pod 附近做高可用。
13. **Taint / Toleration？** 节点污点排斥 Pod，Pod 需容忍才能调度；用于专用/GPU 节点隔离。
14. **K8s 网络三原则？** 每 Pod 一 IP、Pod 互通无 NAT、节点 agent 通本节点 Pod。
15. **CNI 是什么、常见插件？** 网络插件接口；Calico（BGP+策略）、Cilium（eBPF）、Flannel（VXLAN）。
16. **kube-proxy 的 iptables vs IPVS？** IPVS 哈希转发、大规模性能更好；iptables 链式匹配、规则多时变慢。
17. **Service 类型？** ClusterIP（集群内）、NodePort（节点端口）、LoadBalancer（云负载均衡）。
18. **PV/PVC/StorageClass？** PV 存储资源、PVC 申领、StorageClass 动态供给；CSI 对接存储后端。
19. **HPA 原理？** 按 CPU/内存/自定义指标自动调副本数；与 VPA（改 request/limit）可能冲突。
20. **零停机发布怎么做？** 滚动更新 + `maxUnavailable=0` + readinessProbe 保证就绪才接流量；可 `rollout undo` 回滚。
21. **Pod Pending 常见原因？** 资源不足、缺 PVC、nodeSelector 不符、Taint 无 toleration、节点不可调度。
22. **Pod 为什么不能被重新调度到别的节点？** 一旦调度落定，除非被删/节点故障/亲和策略，一般不挪；重建由控制器在新节点拉起新 Pod。
23. **CRI/CNI/CSI 区别？** 分别是容器运行时、网络、存储的接口标准。
24. **K8s 为什么弃用 Docker 运行时？** 1.24 起走 CRI 标准，用 containerd/CRI-O；镜像与 Dockerfile 仍通用。
25. **Operator 和 Controller 区别？** Operator = 业务级的 Controller，把领域运维知识编码进 CRD+调和循环（如 etcd-operator）。
