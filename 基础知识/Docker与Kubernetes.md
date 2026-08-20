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

## 十八、与其他板块的关系

```text
Docker/K8s ↔ 知识库：
- 云原生       ：K8s 是云原生核心；Service Mesh/可观测/ Helm 同源
- SRE与稳定性  ：HPA/探针/滚动发布/优雅停机 = 稳定性三板斧的落地
- 测试与代码质量：流水线构建镜像 → 部署测试环境
- 场景设计     ：容器 OOM、Pod 驱逐、滚动失败是生产高频故障
- 中间件       ：Kafka/Redis 等以 StatefulSet/Operator 部署
```

> **口诀**：镜像小且只读、运行非 root；Pod 配齐三类探针；用 Deployment 滚动、HPA 弹性；配置走 ConfigMap、密钥走 Secret；网络 NetworkPolicy 默认拒绝；排障先看 events 再看 logs。
