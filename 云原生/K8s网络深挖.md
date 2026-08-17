# K8s 网络深挖（CNI / Service / Ingress / NetworkPolicy）

> Kubernetes 网络是「**每个 Pod 一个 IP、无 NAT 互通**」的扁平模型。理解 K8s 网络 = 理解四层：**容器网络（CNI）→ 服务网络（Service）→ 入口流量（Ingress）→ 网络策略（NetworkPolicy）**。本篇按「解决的问题 → 原理 → 选型关注点」拆解。

---

## 一、K8s 网络四大问题

| 问题 | 说明 |
|------|------|
| 容器间通信 | 同一节点/跨节点的 Pod 间如何互通（CNI 解决） |
| 服务发现 | Pod IP 不固定，Service 提供稳定虚拟 IP + DNS |
| 入口流量 | 外部流量如何路由到集群内 Service（Ingress） |
| 网络隔离 | 哪些 Pod 可以互相访问（NetworkPolicy） |

---

## 二、CNI 容器网络

### 2.1 核心模型

```
Pod IP = 虚拟网卡 veth pair 一端在 Pod，一端在宿主机网桥
  → 同节点 Pod：通过网桥二层互通
  → 跨节点 Pod：通过 Overlay（VXLAN）或路由（BGP）互通
```

### 2.2 主流 CNI 插件对比

| 插件 | 模式 | 特点 | 适用 |
|------|------|------|------|
| Calico | BGP/VXLAN/IPIP | 网络策略最强、性能好、支持 BGP 直连路由 | 大规模集群（主流） |
| Flannel | VXLAN/host-gw | 最简单、无网络策略 | 小集群/测试 |
| Cilium | eBPF | 内核级性能、L7 策略、可观测性最强 | 高性能/安全要求高 |
| Weave | VXLAN | 自动加密、简单 | 中小集群 |
| AWS VPC CNI | 原生 VPC | Pod IP 路由到 VPC（无 Overlay） | AWS EKS |

**选型关注点**：
- 需要网络策略（Calico/Cilium）→ 生产必须
- 性能优先 → Cilium（eBPF）或 Calico BGP 直连
- 简单优先 → Flannel（无策略需求）

### 2.3 Calico 深入

```
Calico 架构：
  Felix（节点 Agent）：配置路由、网络策略
  BIRD（BGP 客户端）：节点间交换路由信息
  etcd/CRD：存储网络策略与 IPAM

BGP 模式（无 Overlay）：
  节点间通过 BGP 通告 Pod CIDR → 直接路由（性能最优）
  
VXLAN/IPIP 模式：
  封装 Pod IP 到宿主机 IP → 跨子网兼容（云环境常用）
```

### 2.4 Service 网络原理

```
Service = 稳定的虚拟 IP（ClusterIP）+ DNS（svc-name.namespace.svc.cluster.local）
  → kube-proxy 维护 iptables/IPVS 规则：ClusterIP → Pod IP
  → 后端 Pod 变化时自动更新规则

三种类型：
  ClusterIP（默认）：集群内访问
  NodePort：节点端口暴露（30000-32767）
  LoadBalancer：云厂商 LB（NLB/ALB）
```

**iptables vs IPVS 模式**：

| 模式 | 原理 | 适用 |
|------|------|------|
| iptables | 规则链匹配（O(n)） | 小规模（<1000 Service） |
| IPVS | 哈希表（O(1)） | 大规模（>1000 Service） |

### 2.5 Ingress 深入

```
Ingress = HTTP(S) 路由规则（Host/Path → Service）
  → Ingress Controller（Nginx/Traefik/Istio Gateway）实际执行路由
  → IngressClass 指定使用哪个 Controller

高级路由：
  路径重写、TLS 终止、灰度权重、限流、认证
```

**Ingress vs Gateway API**：

| 维度 | Ingress | Gateway API |
|------|---------|-------------|
| 能力 | HTTP 路由 | TCP/UDP/gRPC + HTTP + 策略 |
| 扩展性 | 注解（非标准化） | CRD + 标准化策略 |
| 推荐 | 存量系统 | 新项目首选 |

---

## 三、NetworkPolicy（网络隔离）

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend
spec:
  podSelector:
    matchLabels:
      app: backend
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend
    ports:
    - port: 8080
```

**效果**：只允许 `app=frontend` 的 Pod 访问 `app=backend` 的 8080 端口，其他全部拒绝。

**关键点**：NetworkPolicy 需要 CNI 插件支持（Flannel 不支持，Calico/Cilium 支持）。

---

## 四、生产实践

| 实践 | 说明 |
|------|------|
| CNI 选型 | 生产用 Calico（BGP 或 VXLAN），大规模/安全用 Cilium |
| DNS | CoreDNS 是默认 DNS，确保 ndots 配置合理（避免不必要的 DNS 查询） |
| Service | 大规模用 IPVS 模式（kube-proxy-mode: ipvs） |
| Ingress | 新项目用 Gateway API，存量用 Nginx Ingress |
| NetworkPolicy | 默认拒绝所有 + 白名单放行（零信任起点） |
| MTU | Overlay 模式注意 MTU 减小（VXLAN +50 字节），避免分片 |
| 排障 | `kubectl exec` + `nslookup` + `curl` + `tcpdump` 四步定位 |

---

## 五、常见坑

- **DNS 解析慢**：ndots=5 导致不必要的搜索域追加 → 设 ndots=2 或用 FQDN
- **Service 延迟**：iptables 模式大规模下性能下降 → 切 IPVS
- **Pod 间不通**：CNI 插件未正确配置或 NetworkPolicy 过于严格
- **NodePort 端口冲突**：端口范围有限 → 用 Ingress/LB 替代
- **云环境跨 VPC**：Pod CIDR 与 VPC CIDR 冲突 → 用云原生 CNI（VPC CNI）

---

## 六、与其他板块的关系

- CNI 插件见「[Kubernetes 核心](./Kubernetes核心.md)」；
- Service/Ingress 见「[Kubernetes 核心](./Kubernetes核心.md)」；
- Service Mesh（Istio/Envoy）见「[Service Mesh](./ServiceMesh.md)」；
- 云网络见「[云网络与流量接入体系](../基础知识/中间件/云网络与流量接入体系.md)」；
- Nginx/OpenResty 见「[Nginx](../基础知识/中间件/Nginx.md)」「[OpenResty](../基础知识/中间件/OpenResty.md)」。

> 一句话：**K8s 网络 = CNI（Pod 互通）+ Service（服务发现）+ Ingress（入口路由）+ NetworkPolicy（网络隔离）——生产选 Calico/Cilium + IPVS + Gateway API + 默认拒绝 NetworkPolicy**。
