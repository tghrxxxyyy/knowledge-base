# 云原生与 K8s 面试精讲

> K8s 是云原生的事实标准。本文整理高频面试题与要点，覆盖架构、调度、网络、存储、安全与排障。

## 1. 架构与组件

**Q：K8s 有哪些核心组件？各自职责？**
- **Master（控制面）**：API Server（入口）、etcd（存储）、Scheduler（调度）、Controller Manager（控制器）。
- **Node（工作节点）**：kubelet（管理 Pod）、kube-proxy（网络规则）、容器运行时（Docker/containerd）。
- 附加：CoreDNS、Ingress Controller、CNI 插件。

**Q：API Server 为什么是中心？**
所有组件通过它读写 etcd，是唯一的 API 入口，做认证、鉴权、准入控制。

## 2. Pod 与调度

**Q：Pod 与容器的关系？**
Pod 是最小调度单位，含一个或多个共享网络/存储的容器（sidecar 模式典型）。

**Q：调度流程？**
1. 调度器监听到未绑定 Pod。
2. 过滤（Filter）：排除不满足资源/亲和/污点的节点。
3. 打分（Score）：选最优节点。
4. 绑定（Bind）。

**Q：亲和性与反亲和性？**
- `nodeAffinity`：Pod 倾向某类节点。
- `podAffinity`：Pod 倾向靠近某 Pod。
- `podAntiAffinity`：Pod 倾向远离（如打散副本）。

**Q：污点与容忍（Taint/Toleration）？**
节点打污点阻止一般 Pod 调度；Pod 配容忍才能上。

## 3. 网络

**Q：K8s 网络模型三大约定？**
1. 每个 Pod 独立 IP。
2. 节点内/跨节点 Pod 直连（无 NAT）。
3. Service 提供稳定虚拟 IP。

**Q：Service 类型？**
- ClusterIP（集群内）、NodePort（节点端口）、LoadBalancer（云负载均衡）、ExternalName（DNS）。

**Q：Ingress 是什么？**
七层路由（按域名/路径转发），由 Ingress Controller（如 Nginx/Envoy）实现。

## 4. 存储

**Q：PV / PVC / StorageClass 区别？**
- PV：集群存储资源（管理员创建或动态供给）。
- PVC：用户对存储的声明（申请）。
- StorageClass：定义存储类型与动态供给策略。

**Q：ConfigMap 与 Secret？**
- ConfigMap 存配置（非敏感）。
- Secret 存敏感（base64，应加密）。

## 5. 安全

**Q：RBAC 是什么？**
基于角色的访问控制：Role/ClusterRole + RoleBinding 绑定用户/SA 到权限规则。

**Q：ServiceAccount 作用？**
Pod 访问 API Server 的身份，最小权限原则。

**Q：Pod 安全上下文？**
`securityContext` 设 runAsNonRoot、readOnlyRootFilesystem、capabilities 降权。

## 6. 高可用与运维

**Q：如何保证 API Server 高可用？**
多副本 + 负载均衡前置；etcd 用奇数节点（3/5） raft 集群。

**Q：HPA 原理？**
根据 CPU/自定义指标自动扩缩副本数。

**Q：Pod 排障步骤？**
`kubectl describe pod`（事件）→ `logs`（日志）→ `exec` 进容器 → 查节点/网络。

## 7. 实战题

**Q：Pod 一直 Pending 怎么回事？**
资源不足、节点污点、PVC 未绑定、亲和不满足——看 `describe` 事件。

**Q：滚动更新如何不中断？**
 readinessProbe 就绪探针 + maxSurge/maxUnavailable 控制节奏。

**Q：ConfigMap 更新后容器何时生效？**
环境变量不热更；挂载卷有延迟最终更新；需重启或重载。

## 8. 面试题清单

1. 调度流程的过滤与打分？
2. 污点与容忍的使用场景？
3. Service 与 Ingress 区别？
4. PV/PVC 如何绑定？
5. RBAC 四个核心对象？
6. Pod 排障的标准流程？

## 9. 小结

K8s 面试围绕"组件职责、调度、网络模型、存储、安全、排障"六块。理解 Control Loop（期望状态 vs 实际状态）贯穿一切设计。
