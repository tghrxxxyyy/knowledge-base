# Kubernetes 架构

> 本页以架构示意图为主（截图来自学习笔记），下方三张图分别展示 Kubernetes 的整体架构与核心组件，未对图片内容做文字转录。如需细节请直接查看原图。

![](images/WEBRESOURCE186214b51fa74011e9bd8076575629ed截图.png)

![](images/WEBRESOURCEe0668032ae9061b09a6bdda9721fd2c4截图.png)

![](images/WEBRESOURCEec93347bad114329009dfb43b396c647截图.png)

## 核心架构（Master / Node / etcd）

Kubernetes 采用典型的主从（控制面 + 数据面）架构：

```mermaid
graph TD
    subgraph Master[控制平面 Control Plane]
        API[kube-apiserver]
        SCHED[kube-scheduler 调度器]
        CM[kube-controller-manager]
        ETCD[(etcd 存储)]
    end
    subgraph Node1[Worker Node]
        K1[kubelet]
        P1[Pod]
        P2[Pod]
    end
    subgraph Node2[Worker Node]
        K2[kubelet]
        P3[Pod]
    end
    API --- SCHED
    API --- CM
    API --- ETCD
    K1 --- API
    K2 --- API
```

### 控制平面组件

| 组件 | 职责 |
|---|---|
| kube-apiserver | 集群唯一入口，所有增删改查与鉴权都经它，是 RESTful 与 etcd 之间的网关 |
| etcd | 分布式键值存储，保存集群全部状态（唯一真相源），需奇数节点保证仲裁 |
| kube-scheduler | 监听未调度 Pod，按资源、亲和性、污点等选最优 Node |
| kube-controller-manager | 运行各类控制器（ReplicaSet、Node、Endpoint 等），驱动实际状态趋近期望状态 |
| cloud-controller-manager | 对接云厂商（负载均衡、节点生命周期等） |

### 工作节点组件

| 组件 | 职责 |
|---|---|
| kubelet | 每个 Node 上的 Agent，管理 Pod 生命周期、上报状态 |
| kube-proxy | 维护节点网络规则（iptables/IPVS），实现 Service 的负载与转发 |
| 容器运行时 | containerd / CRI-O / Docker（经 CRI 接入） |

核心理念：**声明式 API + 调谐循环（Reconcile Loop）**。用户声明"期望状态"，控制器持续将"实际状态"纠正为期望状态。

## 核心对象

### Pod

最小调度单元，包含一个或多个共享网络/存储的容器。通常一个 Pod 跑一个主容器。

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx
  labels: { app: nginx }
spec:
  containers:
    - name: nginx
      image: nginx:1.25
      ports:
        - containerPort: 80
```

### Deployment

管理 Pod 副本与滚动更新的无状态工作负载控制器。

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deploy
spec:
  replicas: 3
  selector:
    matchLabels: { app: nginx }
  template:
    metadata:
      labels: { app: nginx }
    spec:
      containers:
        - name: nginx
          image: nginx:1.25
          resources:
            requests: { cpu: "100m", memory: "128Mi" }
            limits:   { cpu: "500m", memory: "256Mi" }
```

### Service

为一组 Pod 提供稳定虚拟 IP 与负载均衡，解决 Pod IP 易变问题。

```yaml
apiVersion: v1
kind: Service
metadata:
  name: nginx-svc
spec:
  selector: { app: nginx }
  ports:
    - port: 80
      targetPort: 80
  type: ClusterIP   # 还有 NodePort / LoadBalancer
```

### Ingress

管理外部 HTTP/HTTPS 路由到 Service，通常配合 Ingress Controller（如 nginx、Traefik）。

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-ingress
spec:
  rules:
    - host: example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: nginx-svc
                port:
                  number: 80
```

### ConfigMap / Secret

ConfigMap 存非敏感配置，Secret 存敏感数据（base64，建议结合加密 provider）。

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  LOG_LEVEL: "INFO"
  app.properties: |
    server.port=8080
---
apiVersion: v1
kind: Secret
metadata:
  name: app-secret
type: Opaque
stringData:
  DB_PASSWORD: "s3cr3t"
```

在 Pod 中引用：

```yaml
env:
  - name: LOG_LEVEL
    valueFrom:
      configMapKeyRef: { name: app-config, key: LOG_LEVEL }
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef: { name: app-secret, key: DB_PASSWORD }
```

### PV 与 PVC

PersistentVolume（PV）是集群存储资源，PersistentVolumeClaim（PVC）是 Pod 对存储的请求。

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-nfs
spec:
  capacity: { storage: 10Gi }
  accessModes: [ReadWriteOnce]
  nfs:
    server: 10.0.0.10
    path: /exports/data
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pvc-nfs
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests: { storage: 5Gi }
```

## 工作负载类型

| 类型 | 适用场景 | 特点 |
|---|---|---|
| Deployment | 无状态服务 | 滚动更新、回滚、副本 |
| StatefulSet | 有状态（DB、MQ） | 稳定网络标识、有序部署/扩缩 |
| DaemonSet | 每个节点都跑（日志/监控 Agent） | 节点级守护 |
| Job / CronJob | 一次性 / 定时任务 | 完成即退出 / 按调度周期 |

## 网络模型与 Service 发现

K8s 网络三约定：
1. 每个 Pod 有独立 IP，Pod 间无需 NAT 直连；
2. Node 上的 Pod 可与所有 Node 上的 Pod 通信；
3. 容器内看到的 IP 与外部访问一致（扁平网络）。

Service 发现支持：
- **环境变量**：Pod 启动时注入 `SVC_PORT_xxx` 变量（依赖启动顺序）；
- **DNS**：CoreDNS 提供 `<service>.<namespace>.svc.cluster.local`，推荐方式。

```bash
kubectl run client --rm -it --image=busybox -- nslookup nginx-svc.default.svc.cluster.local
```

kube-proxy 通过 iptables 或 IPVS 把 ClusterIP 转发到后端 Pod（endpoint 由 Endpoints 对象维护）。

## 调度与亲和性

Scheduler 经历：预选（Filter，淘汰不满足节点）→ 优选（Score，打分选最优）。

### 常见调度约束

```yaml
spec:
  affinity:
    nodeAffinity:          # 节点亲和：倾向带 gpu 标签的节点
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 1
          preference:
            matchExpressions:
              - { key: gpu, operator: In, values: ["true"] }
    podAntiAffinity:       # Pod 反亲和：尽量不与该服务其他实例同节点
      requiredDuringSchedulingIgnoredDuringExecution:
        - labelSelector:
            matchExpressions:
              - { key: app, operator: In, values: ["nginx"] }
          topologyKey: kubernetes.io/hostname
  tolerations:             # 容忍污点：允许调度到有专用污点的节点
    - key: "dedicated"
      operator: "Equal"
      value: "high-cpu"
      effect: "NoSchedule"
```

## HPA 弹性伸缩

Horizontal Pod Autoscaler 基于 CPU/内存或自定义指标自动调整副本数（需 metrics-server）。

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: nginx-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: nginx-deploy
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

## 滚动更新与回滚

Deployment 默认 `RollingUpdate`，按 maxSurge/maxUnavailable 平滑替换。

```bash
kubectl set image deployment/nginx-deploy nginx=nginx:1.26
kubectl rollout status deployment/nginx-deploy
# 出错时回滚
kubectl rollout undo deployment/nginx-deploy
kubectl rollout undo deployment/nginx-deploy --to-revision=2
kubectl rollout history deployment/nginx-deploy
```

## Helm

Helm 是 K8s 的包管理器，用 Chart（模板 + values）管理复杂应用部署。

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm install my-nginx bitnami/nginx -n demo --set replicaCount=3
helm upgrade my-nginx bitnami/nginx --set replicaCount=5
helm rollback my-nginx 1
helm uninstall my-nginx -n demo
```

Chart 结构：

```
mychart/
├── Chart.yaml          # 名称、版本、依赖
├── values.yaml         # 默认参数
├── templates/          # 受控的 yaml 模板
│   ├── deployment.yaml
│   └── service.yaml
└── charts/             # 子 Chart
```

模板片段示例：

```yaml
# templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}-app
spec:
  replicas: {{ .Values.replicaCount }}
  template:
    spec:
      containers:
        - name: app
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
```

## 运维排查命令

```bash
kubectl get pods -A                     # 查看所有命名空间 Pod
kubectl describe pod <pod>              # 查看事件/调度失败原因
kubectl logs <pod> [-c <container>]     # 查看日志
kubectl logs <pod> --previous           # 崩溃容器上一轮日志
kubectl exec -it <pod> -- sh            # 进入容器
kubectl get events --sort-by=.lastTimestamp
kubectl top nodes / top pods            # 资源使用（需 metrics-server）
kubectl port-forward svc/nginx-svc 8080:80  # 本地端口转发调试
kubectl apply -f xxx.yaml --dry-run=server  # 服务端校验
kubectl get all -n demo                 # 查看命名空间全部资源
```

常见故障定位思路：
- Pod `Pending` → 资源不足/污点/PVC 未绑定；
- `CrashLoopBackOff` → 容器启动即退出，看 `--previous` 日志；
- `ImagePullBackOff` → 镜像名错/未授权；
- Service 不通 → 查 endpoints 是否就绪、selector 是否匹配。

## 与云原生全景（CNCF）关系

Kubernetes 是 CNCF（云原生计算基金会）的**毕业级（Graduated）**核心项目，也是云原生全景图的基石。围绕它形成了庞大的生态：

```mermaid
graph TD
    K8S[Kubernetes 编排] --> NET[网络: Cilium/Flannel/Calico]
    K8S --> MON[可观测: Prometheus/Grafana/OpenTelemetry]
    K8S --> SVC[服务网格: Istio/Linkerd]
    K8S --> CI[CI/CD: Argo CD/Tekton]
    K8S --> STORE[存储: Rook/CSI 插件]
    K8S --> SEC[安全: OPA/Gatekeeper/Falco]
```

CNCF 全景图分层（示意）：
- **Provisioning（供应）**：Terraform、镜像构建工具；
- **Runtime（运行时）**：containerd、CRI-O；
- **Orchestration（编排）**：Kubernetes；
- **App Definition（应用定义）**：Helm、Operator 框架；
- **Observability（可观测）**：监控、日志、追踪；
- **Platform（平台）**：托管 K8s（EKS/GKE/AKS）。

> 学习建议：先掌握本文核心对象与命令，再深入 Operator、服务网格、GitOps 等进阶主题。
