# Docker 与 Kubernetes（容器底层 / 镜像工程 / K8s 核心对象 / 调度发布 / 网络存储安全 / 排障）

> 云原生时代的部署底座。本篇把「容器原理」讲透（namespace/cgroup/OverlayFS），把「镜像工程」做细（分层/多阶段/扫描），再把「Kubernetes」铺全：架构、全量资源对象、探针、调度、滚动/金丝雀发布、网络 CNI、存储 PV/PVC、安全 RBAC、可观测性、Helm、Operator，最后给出**生产排障 SOP**。

---

## 一、容器技术全景

```text
容器 vs 虚拟机：
┌────────┬────────────────────┬──────────────────────┐
│        │ 虚拟机(VM)          │ 容器(Container)       │
├────────┼────────────────────┼──────────────────────┤
│ 隔离   │ 硬件级（Hypervisor）│ OS 级（内核 namespace）│
│ 单位   │ Guest OS + 应用     │ 应用 + 依赖（共享内核）│
│ 启动   │ 秒~分钟            │ 毫秒~秒              │
│ 密度   │ 低（GB 级）        │ 高（MB 级）          │
│ 内核   │ 独立内核           │ 共享宿主内核          │
└────────┴────────────────────┴──────────────────────┘
```

> 容器 = **Namespace（隔离视图）+ Cgroup（资源限制）+ 文件系统（rootfs/镜像）** 的组合，比 VM 更轻但隔离性弱（共享内核）。

---

## 二、Docker 原理深入

### 2.1 Namespace（六种隔离）

```text
Mount(mnt)    ：挂载点/文件系统视图
PID           ：进程编号空间（容器内 1 号进程）
Network(net)  ：网络栈（IP/端口/路由）
UTS           ：主机名与域名
IPC           ：进程间通信（共享内存/信号量）
User          ：用户与组映射（容器内 root ≠ 宿主 root）
```

### 2.2 Cgroup（资源限制）

```text
v1：按子系统（cpu/memory/blkio/net_cls）分别挂载，层级复杂。
v2（推荐）：统一层级，支持 cpu.weight、memory.max、io.max，配合 systemd。
限制示例：--memory=512m --cpus=1.5 --pids-limit=200
```

### 2.3 UnionFS / OverlayFS（镜像分层核心）

```text
OverlayFS 四层：
lowerdir  ：只读基础层（镜像各 layer）
upperdir  ：可读写层（容器修改）
workdir   ：内部临时层
merged    ：最终挂载给用户看到的统一视图
```

```text
写时复制(Copy-on-Write)：修改文件时先复制到 upperdir，原 lower 不动。
删除文件：在 upper 建 whiteout 标记，遮蔽 lower 同名文件（非真删）。
```

---

## 三、镜像工程

### 3.1 分层与复用

```text
Dockerfile 每条指令 = 一层 layer（layer 可跨镜像复用，缓存）。
同一基础镜像 + 相同指令顺序 ⇒ 直接命中缓存，秒级构建。
```

### 3.2 多阶段构建（减小体积）

```dockerfile
# 构建阶段
FROM maven:3.9 AS build
COPY . /app && RUN mvn -q package

# 运行阶段（仅拷贝产物）
FROM eclipse-temurin:17-jre
COPY --from=build /app/target/app.jar /app.jar
ENTRYPOINT ["java","-jar","/app.jar"]
```

### 3.3 镜像优化清单

```dockerfile
FROM eclipse-temurin:17-jre          # 用 jre 而非 jdk，用 distroless/scratch 更小
WORKDIR /app
COPY target/app.jar app.jar           # 依赖变动少的放前面，利用缓存
RUN groupadd -r app && useradd -r -g app app  # 非 root 运行！
USER app
HEALTHCHECK --interval=30s CMD curl -f http://localhost/health || exit 1
EXPOSE 8080
ENTRYPOINT ["java","-jar","app.jar"]
```

```text
优化要点：
- 合并 RUN（减少层数）；.dockerignore 排除 .git/target；
- 指令顺序：变动少的在前；用 distroless/scratch 基础镜像；
- 安全：非 root、只读根文件系统、cap-drop ALL、no-new-privileges。
```

### 3.4 镜像扫描与仓库

```bash
trivy image myapp:1.0        # 扫描 CVE 漏洞
# 仓库：Harbor（含漏洞扫描/签名）、registry、云厂商 ACR/ECR
# 生产建议镜像签名（cosign）+ 准入控制（拒绝未签名镜像）
```

---

## 四、Docker 网络与存储

### 4.1 网络模式

```text
bridge（默认）：容器连 docker0 网桥，NAT 出网。
host          ：共享宿主网络栈（性能高，隔离差）。
none          ：无网络。
overlay       ：跨主机容器网络（Swarm）。
```

```bash
docker run -p 8080:8080 --network mynet app   # 端口映射 + 自定义网络
```

### 4.2 存储

```bash
docker volume create data        # 命名卷（持久化，独立于容器生命周期）
docker run -v data:/var/lib/mysql mysql
docker run -v $(pwd):/app bind   # 绑定挂载（开发热更新）
docker run --tmpfs /tmp tmpfs     # 内存临时文件系统
```

### 4.3 Docker Compose（单机编排）

```yaml
version: "3.8"
services:
  web: { image: myapp, ports: ["8080:8080"], depends_on: [db] }
  db:  { image: mysql:8, environment: { MYSQL_ROOT_PASSWORD: x } }
```

---

## 五、Kubernetes 架构

```text
控制面（Control Plane）：
- kube-apiserver ：唯一入口，所有组件通过它通信（鉴权/准入/校验）
- etcd           ：集群唯一数据源（强一致 KV，Raft）
- kube-scheduler ：将 Pod 调度到合适节点
- kube-controller-manager：控制器集合（Deployment/Node/Endpoint 等）

数据面（Node）：
- kubelet   ：节点代理，管理 Pod 生命周期、上报状态
- kube-proxy：维护节点 iptables/IPVS 规则，实现 Service 转发
- 容器运行时：containerd / CRI-O（通过 CRI 接口对接 K8s）
```

> 插件：CNI（网络）、CSI（存储）、CRI（运行时）；核心扩展靠 CRD + Operator。

---

## 六、核心资源对象全景

| 类别 | 对象 | 作用 |
|------|------|------|
| 工作负载 | `Pod` | 最小调度单位（一或多个共享网络的容器） |
| | `ReplicaSet` | 维持 Pod 副本数（很少直接用） |
| | `Deployment` | 无状态应用，管理 RS，支持滚动更新 |
| | `StatefulSet` | 有状态应用（稳定网络标识/有序滚动/持久存储） |
| | `DaemonSet` | 每节点一个（日志/监控 Agent） |
| | `Job` / `CronJob` | 一次性 / 定时任务 |
| 服务发现 | `Service` | 稳定虚拟 IP + 负载均衡（ClusterIP/NodePort/LB/Headless） |
| | `Ingress` | 七层路由（域名/路径 → Service） |
| 配置 | `ConfigMap` / `Secret` | 配置 / 敏感信息（挂载或环境变量） |
| 存储 | `PV` / `PVC` / `StorageClass` | 持久卷 / 声明 / 动态供给 |
| 弹性 | `HPA` / `VPA` | 基于指标扩缩容 |
| 治理 | `ResourceQuota` / `LimitRange` | 命名空间资源上限 / 默认 Limit |
| 身份 | `ServiceAccount` + `RBAC` | 工作负载身份与权限 |
| 策略 | `NetworkPolicy` / `PodDisruptionBudget` | 网络隔离 / 驱逐保护 |

### 6.1 Pod 本质

```text
Pod = 一个 pause 容器（共享 Network/IPC/UTS 命名空间）+ 用户容器。
- 容器间通过 localhost 通信、共享 Volume。
- 一个 Pod 通常只放"紧密协作"的一组容器（sidecar 模式：日志/代理/初始化）。
```

---

## 七、Pod 生命周期与探针

```text
Pod 阶段：Pending → Running → Succeeded/Failed
容器状态：Waiting / Running / Terminated

探针（决定流量与重启）：
- livenessProbe  ：失败 ⇒ 杀掉容器重启（检测"卡死"）
- readinessProbe ：失败 ⇒ 从 Service 摘除（不杀容器，处理"启动慢/临时不可用"）
- startupProbe   ：启动保护，成功前不执行 liveness（防慢启动被误杀）
```

```yaml
livenessProbe:
  httpGet: { path: /health, port: 8080 }
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3
readinessProbe:
  tcpSocket: { port: 8080 }
  periodSeconds: 5
terminationGracePeriodSeconds: 30   # 优雅停机宽限
```

```text
优雅停机：收到 SIGTERM → 停止接收新请求 → 处理完在途请求 → 退出。
preStop hook 可用于通知注册中心下线。
```

---

## 八、调度（Scheduler）

```text
调度流程：过滤（Filter）→ 打分（Score）→ 绑定（Bind）。

调度约束：
- nodeSelector / nodeAffinity  ：偏向某些节点
- podAffinity / podAntiAffinity：同/不同节点共置（如避免同应用全在一台）
- taint + toleration          ：节点污点排挤，Pod 容忍才可调度
- 拓扑分布 topologySpreadConstraints：跨可用区/机架均匀打散
- 优先级与抢占：PriorityClass 高优可抢占低优 Pod
```

---

## 九、发布策略

```yaml
spec:
  strategy:
    rollingUpdate: { maxSurge: 25%, maxUnavailable: 25% }  # 滚动更新
```

| 策略 | 实现 | 特点 |
|------|------|------|
| 滚动更新 | Deployment 默认 | 逐步替换，零停机 |
| 重新创建 | `Recreate` | 先停后起，有短暂不可用 |
| 蓝绿 | 两套 Deployment + 切 Service | 瞬间切换，易回滚 |
| 金丝雀 | Ingress 权重 / Argo Rollouts | 先放少量流量验证 |

```bash
kubectl rollout status deploy/myapp       # 观察滚动
kubectl rollout undo deploy/myapp         # 回滚到上一版
kubectl rollout history deploy/myapp      # 查看历史
```

---

## 十、网络（CNI）

```text
网络模型：
- 每个 Pod 独立 IP（CNI 插件分配，如 Calico/Flannel/Cilium）。
- Service：ClusterIP 经 kube-proxy（iptables/IPVS）负载到后端 Pod。
- CoreDNS：集群内 DNS 解析（service.namespace.svc）。
- Ingress：外部流量入口（Nginx/ Traefik / Envoy），七层路由。
- NetworkPolicy：基于标签的 Pod 间防火墙（默认全通，需显式限制）。
```

> 服务网格（Istio/Linkerd）在应用旁注入 sidecar（Envoy），接管东西向流量，实现熔断/重试/灰度/可观测，但增加复杂度和延迟。

---

## 十一、存储（PV / PVC）

```text
PV（PersistentVolume）：集群级存储资源（由管理员或 StorageClass 动态创建）。
PVC（PersistentVolumeClaim）：Pod 对存储的"申领"（按大小/访问模式）。
StorageClass：定义 provisioner，实现动态供给（如云盘自动创建）。

访问模式：RWO（单节点读写）/ RWM（多节点读写）/ ROM（只读多节点）。
```

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
spec:
  accessModes: [ReadWriteOnce]
  resources: { requests: { storage: 10Gi } }
  storageClassName: ssd
```

---

## 十二、安全（Security）

```text
身份与权限：
- ServiceAccount：Pod 身份，对接 API（最小权限）。
- RBAC：Role/ClusterRole + RoleBinding 控制"谁能对什么资源做什么"。

工作负载安全：
- 非 root 运行（securityContext.runAsNonRoot）
- 只读根文件系统、drop 多余 Linux Capabilities
- PodSecurity Admission（替代 deprecated PSP）：privileged / baseline / restricted
- 镜像签名校验 + 准入拒绝未签名镜像

网络与数据：
- NetworkPolicy 默认拒绝，按需开放
- Secret 用外部密钥管理（Vault / 云 KMS），避免明文
- 静态加密 etcd（EncryptionConfiguration）
```

---

## 十三、可观测性

```text
Metrics：Prometheus 抓取 /metrics；kube-state-metrics 暴露对象状态；
         HPA 基于 CPU/自定义指标（KEDA 支持事件驱动扩缩）。
Logs   ：DaemonSet 收集（Fluent Bit → Kafka/ES/Loki），stdout/stderr 收集。
Traces ：OpenTelemetry 跨服务链路追踪，旁路 sidecar 上报。
告警   ：Prometheus Alertmanager → 钉钉/企微/电话。
```

---

## 十四、Helm（包管理）

```text
Chart = 模板（templates/）+ 值（values.yaml）+ 元数据（Chart.yaml）。
Release = 某 Chart 在某命名空间的具体安装实例。
```

```bash
helm repo add bitnami https://charts.bitnami.com
helm install myapp bitnami/redis -n demo --set auth.enabled=false
helm upgrade myapp bitnami/redis --set replica.replicaCount=3
helm rollback myapp 1
helm template myapp ./chart   # 渲染查看最终 YAML（排错利器）
```

> Hooks：pre-install / post-install / pre-upgrade 等，在生命周期节点执行 Job。

---

## 十五、Operator 与 CRD

```text
CRD（CustomResourceDefinition）：扩展 K8s API，定义自己的资源类型。
Operator：针对自定义资源运行的控制器（watch 资源 → reconcile 使实际态趋近期望态）。
典型场景：数据库（Prometheus Operator / Etcd Operator / TiDB）、中间件生命周期管理。
工具链：kubebuilder / operator-sdk（基于 controller-runtime，实现 reconcile 循环）。
```

---

## 十六、生产排障 SOP

```bash
# 1. 看事件（第一步，90% 问题线索在此）
kubectl get events -n demo --sort-by=.lastTimestamp
kubectl describe pod myapp-xxx -n demo     # 看状态/事件/挂载

# 2. 看日志
kubectl logs myapp-xxx -n demo --previous # 上一次崩溃日志
kubectl logs -l app=myapp -n demo         # 按标签聚合

# 3. 进容器 / 调试
kubectl exec -it myapp-xxx -n demo -- sh
kubectl debug myapp-xxx -it --image=busybox --target=app  # 临时调试容器

# 4. 常见异常速查
CrashLoopBackOff  ：看 --previous 日志（配置错/依赖未就绪/OOM）
ImagePullBackOff  ：镜像名/标签错、仓库无权限、Secret 缺失
Pending           ：资源不足/节点污点/无满足亲和性的节点/PVC 未绑定
OOMKilled         ：内存 limit 太小或真实泄漏（看 exit code 137）
NodeNotReady      ：kubelet 掉线/磁盘压力/网络分区
```

---

## 十七、GitOps（声明式交付）

```text
理念：Git 为唯一事实源，集群状态由控制器持续对齐 Git 中声明的 YAML。
工具：Argo CD（拉模式，对比 Drift 并自动同步）、Flux（CNCF 毕业）。
价值：审计可追溯、一键回滚、多环境一致、防配置漂移。
```

---

## 十八、Pod 生命周期深度剖析

### 18.1 Pod 生命周期详解

```text
Pod 完整生命周期（含所有阶段）：
┌─────────────────────────────────────────────────────────────────┐
│  Pending → Running → Succeeded/Failed/Unknown                    │
│                                                                  │
│  Pod 内部状态机：                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐      │
│  │ Pending  │──▶│ Running  │──▶│ Succeeded│──▶│  等待 GC  │      │
│  │(调度中)  │   │(运行中)  │   │(正常结束)│   │          │      │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘      │
│       │               │               │                          │
│       ▼               ▼               ▼                          │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                     │
│  │  Failed  │   │ Unknown  │   │  Waiting │                     │
│  │(异常退出)│   │(状态未知)│   │(等待启动)│                     │
│  └──────────┘   └──────────┘   └──────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

**Pod 启动流程**：

| 阶段 | 行为 | 关键配置 |
|------|------|----------|
| 调度 | Scheduler 选节点绑定 | nodeSelector/affinity/taint |
| 拉取镜像 | kubelet 拉取容器镜像 | imagePullPolicy: Always/IfNotPresent |
| 启动容器 | 按 restartPolicy 决定重启策略 | restartPolicy: Always/OnFailure/Never |
| 初始化容器 | initContainers 依次执行成功 | initContainers[].command |
| 就绪探针 | readinessProbe 成功后加入 Service | readinessProbe |
| 存活探针 | livenessProbe 失败则重启容器 | livenessProbe |
| 停止 | SIGTERM → preStop → SIGKILL | terminationGracePeriodSeconds |

### 18.2 Init Containers 详解

```yaml
apiVersion: v1
kind: Pod
spec:
  initContainers:
  - name: init-db
    image: busybox:1.36
    command: ['sh', '-c', 'until nslookup mysql-service; do echo waiting...; sleep 2; done']
  - name: init-config
    image: busybox:1.36
    command: ['sh', '-c', 'wget -O /config/app.yaml http://config-server/config']
  containers:
  - name: app
    image: myapp:1.0
```

**Init Container 特性**：

| 特性 | 说明 |
|------|------|
| 顺序执行 | 严格按定义顺序，前一个成功后才启动下一个 |
| 重启策略 | 失败会重试（受 restartPolicy 影响），直到成功 |
| 资源隔离 | 独立于主容器，有独立的资源请求/限制 |
| 终止态 | 退出后不再启动（除非 Pod 重启） |
| 典型场景 | 等待依赖服务、预下载配置、初始化数据库schema、设置权限 |

### 18.3 Sidecar 模式

```mermaid
graph TB
    subgraph Pod
        subgraph "主容器"
            A[应用容器]
        end
        subgraph "Sidecar 容器"
            B[日志收集]
            C[服务网格代理]
            D[配置更新]
        end
    end
    B -->|共享 Volume| A
    C -->|拦截流量| A
    D -->|热更新配置| A
```

| Sidecar 类型 | 工具 | 用途 |
|-------------|------|------|
| 日志收集 | Fluent Bit/Filebeat | 采集 stdout + 文件日志 |
| 服务网格 | Istio Envoy | mTLS、熔断、重试、灰度 |
| 配置更新 | Consul Template | 配置变更热加载 |
| 监控代理 | Istio Metrics | 自动注入 metrics 采集 |
| 证书管理 | Cert-manager | 证书自动轮换 |

### 18.4 Resource Requests/Limits 调优

```yaml
resources:
  requests:
    cpu: "500m"      # 调度依据：确保节点有 0.5 核空闲
    memory: "256Mi"  # OOM 判断依据
  limits:
    cpu: "1000m"     # CPU 限流（throttle），非硬限制
    memory: "512Mi"  # 超出则 OOMKill
```

**调优原则**：

| 策略 | 说明 | 注意事项 |
|------|------|----------|
| requests=limits | Guaranteed QoS，不被驱逐 | 资源浪费，适合核心服务 |
| requests<limits | Burstable QoS，弹性伸缩 | 常见选择，平衡成本与稳定 |
| 无 limits | Best-Effort QoS | 最先被驱逐，慎用 |
| CPU 粒度 | 1m=0.001核 | CPU 可压缩，超限被 throttle |
| 内存粒度 | 1Mi=1048576字节 | 内存不可压缩，超限被 OOMKill |

```text
QoS 等级与驱逐优先级：
Best-Effort（无 requests/limits）→ Burstable（requests<limits）→ Guaranteed（requests=limits）
低优先级先驱逐
```

### 18.5 HPA/VPA/KEDA 自动扩缩容

**HPA（Horizontal Pod Autoscaler）**：

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300  # 缩容冷却5分钟
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
```

**VPA（Vertical Pod Autoscaler）**：

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  updatePolicy:
    updateMode: "Auto"  # 自动重建 Pod 应用新资源
  resourcePolicy:
    containerPolicies:
    - containerName: app
      minAllowed:
        cpu: "100m"
        memory: "128Mi"
      maxAllowed:
        cpu: "4"
        memory: "8Gi"
```

**KEDA（Kubernetes Event-Driven Autoscaling）**：

| 指标源 | 触发器 | 场景 |
|--------|--------|------|
| Kafka lag | kafka | 消费积压自动扩容 |
| RabbitMQ queue | rabbitmq | 队列深度触发 |
| Prometheus | prometheus | 自定义指标 |
| Cron | cron | 定时扩缩 |
| MySQL/PG | 外部指标 | DB 连接数/慢查询 |

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
spec:
  scaleTargetRef:
    name: myapp
  minReplicaCount: 2
  maxReplicaCount: 50
  triggers:
  - type: kafka
    metadata:
      bootstrapServers: kafka:9092
      consumerGroup: mygroup
      topic: orders
      lagThreshold: "100"
```

### 18.6 NetworkPolicy 网络策略

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
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
    - protocol: TCP
      port: 8080
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: database
    ports:
    - protocol: TCP
      port: 5432
```

```text
NetworkPolicy 工作原理：
1. 默认全通：未定义策略时 Pod 间无限制
2. 默认拒绝：定义了 ingress/egress 后只放行匹配规则
3. 选择器：podSelector + namespaceSelector 做标签匹配
4. CIDR：ipBlock 放行特定 IP 段
5. 实现依赖：Calico/Cilium 支持，Flannel 不支持 NetworkPolicy
```

### 18.7 PodDisruptionBudget（PDB）

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: myapp-pdb
spec:
  minAvailable: 2    # 至少保留 2 个 Pod
  # 或 maxUnavailable: 1  # 最多不可用 1 个
  selector:
    matchLabels:
      app: myapp
```

**PDB 使用场景**：

| 场景 | 配置 | 效果 |
|------|------|------|
| 滚动更新 | minAvailable: 50% | 更新时至少一半可用 |
| 节点维护 | maxUnavailable: 1 | 驱逐时逐个进行 |
| 有状态服务 | minAvailable: 3 | 保证 quorum |

### 18.8 K8s RBAC 权限模型

```mermaid
graph LR
    SA[ServiceAccount] --> RoleBinding
    RoleBinding --> Role
    Role --> Rules[资源+操作]
    SA --> ClusterRoleBinding
    ClusterRoleBinding --> ClusterRole
    ClusterRole --> Rules2[集群资源+操作]
```

```yaml
# 命名空间级角色
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: production
  name: pod-reader
rules:
- apiGroups: [""]
  resources: ["pods", "pods/log"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list"]
---
# 集群级角色
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: secret-reader
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list"]
---
# 绑定
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods
  namespace: production
subjects:
- kind: ServiceAccount
  name: app-sa
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

### 18.9 K8s 调试利器：kubectl debug 与临时容器

```bash
# 基础调试
kubectl debug mypod -it --image=busybox:1.36 -- sh

# 复用现有容器的进程命名空间
kubectl debug mypod -it --image=busybox:1.36 --target=app

# 节点级调试（进入节点的 host PID/IPC）
kubectl debug node/worker-1 -it --image=ubuntu

# 查看 Pod 的环境变量/挂载
kubectl exec mypod -it -- env
kubectl exec mypod -it -- ls /data

# 查看事件（排障第一步）
kubectl get events -n production --sort-by=.lastTimestamp | tail -20
```

**Ephemeral Containers（临时容器）**：

```yaml
apiVersion: v1
kind: EphemeralContainer
name: debugger
image: busybox:1.36
targetNamespace: ""
command: ["sleep", "3600"]
# kubectl debug mypod -it --image=busybox --target=app
```

### 18.10 Helm Chart 最佳实践

```text
Helm Chart 结构：
mychart/
├── Chart.yaml          # 元数据（版本、依赖）
├── values.yaml         # 默认配置值
├── templates/          # 模板文件
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── hpa.yaml
│   ├── pdb.yaml
│   ├── networkpolicy.yaml
│   ├── _helpers.tpl    # 辅助模板
│   └── tests/          # 测试
├── charts/             # 依赖子 chart
└── .helmignore
```

```yaml
# values.yaml 最佳实践
replicaCount: 2
image:
  repository: myapp
  tag: "1.0"
  pullPolicy: IfNotPresent
resources:
  requests:
    cpu: 200m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 512Mi
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
```

```bash
# 开发阶段：模板渲染调试
helm template myapp ./chart -f values-dev.yaml

# 生产部署：dry-run 验证
helm upgrade myapp ./chart -f values-prod.yaml --dry-run

# 回滚
helm rollback myapp 1

# 查看历史
helm history myapp
```

## 十九、与其他板块的关系

```text
Docker/K8s ↔ 知识库：
- 云原生       ：K8s 是云原生核心；Service Mesh/可观测/ Helm 同源
- SRE与稳定性  ：HPA/探针/滚动发布/优雅停机 = 稳定性三板斧的落地
- 测试与代码质量：流水线构建镜像 → 部署测试环境
- 场景设计     ：容器 OOM、Pod 驱逐、滚动失败是生产高频故障
- 中间件       ：Kafka/Redis 等以 StatefulSet/Operator 部署
```

> **口诀**：镜像小且只读、运行非 root；Pod 配齐三类探针；用 Deployment 滚动、HPA 弹性；配置走 ConfigMap、密钥走 Secret；网络 NetworkPolicy 默认拒绝；排障先看 events 再看 logs。
