# Docker 与 Kubernetes（容器原理 / K8s 核心 / Helm / 排障）

> Docker 是**容器化标准**（打包应用+依赖为镜像），Kubernetes 是**容器编排事实标准**（自动部署/扩缩/自愈）。本篇聚焦 Java 后端工程师必备的容器化知识：Docker 原理 → K8s 核心概念 → Helm 一键部署 → 日常排障。

---

## 一、Docker 原理

### 1.1 容器本质

```
容器 = 被 Namespace 隔离 + cgroup 限制的普通进程

Namespace（隔离）：
  PID：容器内 PID 从 1 开始（宿主机看到真实 PID）
  NET：独立网络栈（IP/端口/路由表）
  MNT：独立文件系统挂载点
  UTS：独立主机名
  IPC：独立进程间通信
  USER：独立用户/组映射

Cgroup（限制）：
  CPU：限制 CPU 使用率（如 0.5 核）
  Memory：限制内存（OOM Killed）
  IO：限制磁盘读写速率
  Network：限制网络带宽

容器 vs 虚拟机：
  容器：共享宿主机内核（启动快、体积小、密度高）
  虚拟机：独立内核（安全隔离强、启动慢、密度低）
```

### 1.2 镜像分层（UnionFS）

```
Docker 镜像 = 只读层叠加（每一层是文件系统差异）

FROM ubuntu:22.04          → 第1层（基础镜像，~78MB）
RUN apt-get install -y jdk → 第2层（安装 JDK）
COPY app.jar /app/         → 第3层（复制应用）
WORKDIR /app               → 第4层（工作目录）

构建缓存：每层如果不变则复用（加速构建）
写时复制（COW）：容器修改文件时才从只读层拷贝到可写层
```

### 1.3 Dockerfile 最佳实践

```dockerfile
# 多阶段构建（减少镜像体积）
FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

| 实践 | 说明 |
|------|------|
| 多阶段构建 | 编译阶段用大镜像，运行阶段用小镜像（alpine） |
| 合并 RUN | 减少层数（`&&` 连接） |
| COPY vs ADD | 优先 COPY（语义清晰），ADD 只在需要解压时用 |
| .dockerignore | 排除 .git/target/node_modules |
| 非 root 用户 | `USER 1001:1001`（安全） |

---

## 二、Kubernetes 核心概念

### 2.1 K8s 架构

```
Control Plane（控制平面）：
  kube-apiserver：所有操作的入口（RESTful API）
  etcd：存储所有集群状态（分布式 KV）
  kube-scheduler：调度 Pod 到节点
  kube-controller-manager：控制循环（Deployment/ReplicaSet/Node...）

Node（工作节点）：
  kubelet：管理 Pod 生命周期（与 API Server 通信）
  kube-proxy：维护 Service → Pod 的转发规则
  容器运行时：containerd/CRI-O（管理容器）
```

### 2.2 核心资源

| 资源 | 说明 | 类比 |
|------|------|------|
| Pod | 最小调度单元（1~N 个容器共享网络/存储） | 一组进程 |
| Deployment | 无状态应用（滚动更新/回滚/副本） | 应用部署 |
| StatefulSet | 有状态应用（稳定网络标识/存储） | 数据库/MQ |
| Service | 稳定的虚拟 IP + DNS | 负载均衡器 |
| Ingress | HTTP(S) 路由规则 | 反向代理 |
| ConfigMap / Secret | 配置 / 敏感信息 | 环境变量/配置文件 |
| PV / PVC | 持久化存储 | 磁盘挂载 |
| HPA | 自动水平扩缩 | 自动扩容 |

### 2.3 Pod 生命周期

```
Pending → Running → Succeeded/Failed

调度流程：
  API Server → Scheduler（Filter→Score→Bind）→ 目标节点 kubelet → 拉镜像 → 创建容器

探针（健康检查）：
  livenessProbe：存活检查（失败 → 重启容器）
  readinessProbe：就绪检查（失败 → 从 Service Endpoints 移除）
  startupProbe：启动检查（失败 → 不重启，等待启动完成）

重启策略（restartPolicy）：
  Always（默认）：容器退出就重启
  OnFailure：非零退出码才重启
  Never：不重启
```

### 2.4 Service 与网络

```
Service = 稳定的虚拟 IP + DNS 名称

三种类型：
  ClusterIP（默认）：集群内访问
  NodePort：节点端口暴露（30000-32767）
  LoadBalancer：云厂商 LB

DNS：service-name.namespace.svc.cluster.local
  → kube-proxy 维护 iptables/IPVS 规则：ClusterIP → Pod IP
```

---

## 三、Helm（K8s 包管理器）

### 3.1 核心概念

```
Chart = 应用包（模板 + 默认配置）
Release = Chart 的一次部署实例
Repository = Chart 仓库

Helm 优势：
  一键部署：helm install my-release ./my-chart
  版本管理：helm upgrade / helm rollback
  环境差异化：-f values-prod.yaml
  模板化：Go 模板渲染 YAML
```

### 3.2 常用命令

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm search repo nginx
helm install my-nginx bitnami/nginx -f values.yaml
helm upgrade my-nginx bitnami/nginx --set replicaCount=3
helm rollback my-nginx 1
helm list -A
helm template my-release ./chart  # 渲染模板（不部署）
helm lint ./chart                  # 语法检查
```

---

## 四、日常排障

### 4.1 Pod 排障

```bash
# 查看 Pod 状态
kubectl get pods -n <ns> -o wide

# 查看事件（第一步）
kubectl describe pod <pod> -n <ns>

# 查看日志
kubectl logs <pod> -n <ns> --tail=100
kubectl logs <pod> --previous  # 上次崩溃日志

# 进入容器
kubectl exec -it <pod> -n <ns> -- /bin/sh

# 查看资源使用
kubectl top pod <pod> -n <ns>
```

### 4.2 常见问题速查

| 问题 | 排查 |
|------|------|
| Pending | `describe pod` 看事件：资源不足/PVC/亲和性 |
| CrashLoopBackOff | `logs --previous` 看崩溃日志 |
| ImagePullBackOff | 检查镜像名 + 仓库认证 |
| OOMKilled | 增加 memory limit |
| Service 不通 | `kubectl get endpoints` 看是否有匹配 Pod |
| Ingress 404 | 检查后端 Service + 路径规则 |

---

## 五、与其他板块的关系

- K8s 网络深入见「[K8s 网络深挖](../云原生/K8s网络深挖.md)」；
- K8s 存储深入见「[K8s 存储深挖](../云原生/K8s存储深挖.md)」；
- K8s 运维实战见「[K8s 运维实战](../云原生/K8s运维实战.md)」；
- CI/CD 容器集成见「[CI-CD/11-容器化与 Kubernetes 集成](./CI-CD/11-容器化与Kubernetes集成.md)」。

> 一句话：**Docker = Namespace 隔离 + cgroup 限制 + 镜像分层；K8s = Pod 调度 + Service 服务发现 + Deployment 滚动更新——Java 后端必备：Dockerfile 多阶段构建 + K8s Pod 探针 + Helm 一键部署 + kubectl describe/logs 排障**。
