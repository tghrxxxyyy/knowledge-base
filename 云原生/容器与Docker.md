# 容器与 Docker 深入（容器运行时 / Buildkit / 多架构构建 / 安全加固）

> 容器 = 被 Linux 内核特性隔离的普通进程。本篇深入拆解：容器运行时（containerd/CRI-O）、Buildkit 构建优化、多架构镜像构建、安全加固。

---

## 一、核心概念

```
容器 ≠ 小虚拟机
容器 = 被 Namespace（视图隔离）+ cgroup（资源限制）隔离的普通进程
镜像 = 只读模板（分层存储）
容器 = 镜像的运行实例（可写层）
仓库 = 镜像分发（Docker Hub/Harbor/ECR）
```

---

## 二、容器 vs 虚拟机

| 维度 | 容器 | 虚拟机 |
|------|------|--------|
| 虚拟化对象 | 进程（共享内核） | 操作系统（独立内核） |
| 隔离机制 | Namespace + cgroup | Hypervisor + 独立内核 |
| 启动时间 | 秒级 | 分钟级 |
| 镜像体积 | MB 级 | GB 级 |
| 性能 | 近原生 | 5%~15% 损耗 |
| 隔离强度 | 较弱（共用内核） | 强（独立内核） |
| 单机密度 | 上千 | 几十 |

---

## 三、容器运行时

### 3.1 Docker 架构演变

```
Docker 1.11 之前：
  Docker → dockerd → containerd → runc → OCI 容器

Docker 1.11 之后（CRI）：
  Docker → dockerd → containerd（CRI）→ runc → OCI 容器
  K8s 1.24+ 直接用 containerd（CRI），绕过 Docker

K8s 运行时：
  containerd（推荐）：Docker 的核心组件，独立使用
  CRI-O：Red Hat 主导，纯 CRI 实现
  gVisor：Google 的沙箱容器（内核代理）
  Kata Containers：轻量级 VM（独立内核）
```

### 3.2 containerd 详解

```
containerd 是 Docker 的核心容器运行时，已成为 CNCF 毕业项目

架构：
  containerd（守护进程）
    ├── 任务管理（容器生命周期）
    ├── 镜像管理（拉取/推送/存储）
    ├── 存储（快照管理）
    ├── 网络（CNI 插件）
    └── 日志（容器日志收集）

配置：
  /etc/containerd/config.toml

K8s + containerd：
  集群初始化：kubeadm init --cri-socket=/run/containerd/containerd.sock
  RuntimeClass：containerd
```

### 3.3 OCI 标准

```
OCI（Open Container Initiative）标准：
  Runtime Spec：定义容器运行时行为（runc/crun/kata）
  Image Spec：定义镜像格式（分层/manifest/config）
  Distribution Spec：定义镜像分发协议（pull/push）

好处：
  不同运行时可互换（runc ↔ crun ↔ kata）
  不同镜像格式可互换（Docker ↔ containerd ↔ Podman）
```

---

## 四、Buildkit 构建优化

### 4.1 架构

```
BuildKit = Docker 新一代构建引擎（Docker 23.0+ 默认）

优势：
  并行构建：多 stage 并行执行
  缓存导入导出：跨机器共享构建缓存
  挂载构建：构建时挂载（如 SSH 密钥）
  多输出格式：支持 Docker/OCI 原始格式
```

### 4.2 多阶段构建优化

```dockerfile
# 阶段 1：构建
FROM golang:1.21 AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /app/myapp

# 阶段 2：运行（极小镜像）
FROM gcr.io/distroless/static
COPY --from=builder /app/myapp /myapp
ENTRYPOINT ["/myapp"]
```

### 4.3 构建缓存

```bash
# 导出缓存到本地
docker build --cache-from type=local,src=/tmp/buildkit-cache \
             --cache-to type=local,dest=/tmp/buildkit-cache \
             -t myapp:1.0 .

# 跨 CI/CD 共享缓存
docker build --cache-from type=registry,ref=myregistry/myapp:cache \
             --cache-to type=registry,ref=myregistry/myapp:cache,mode=max \
             -t myapp:1.0 .
```

---

## 五、多架构镜像构建

### 5.1 构建命令

```bash
# 创建多架构构建器
docker buildx create --name multiarch --driver docker-container --use

# 构建并推送
docker buildx build --platform linux/amd64,linux/arm64 \
                    --push \
                    -t myregistry/myapp:1.0 .

# 支持的平台
--platform linux/amd64,linux/arm64,linux/arm/v7,linux/arm/v6
```

### 5.2 CI/CD 集成

```yaml
# GitHub Actions
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: docker/setup-buildx-action@v3
    - uses: docker/login-action@v3
    - uses: docker/build-push-action@v5
      with:
        push: true
        platforms: linux/amd64,linux/arm64
        tags: myregistry/myapp:1.0
```

---

## 六、容器安全加固

### 6.1 镜像安全

| 措施 | 说明 |
|------|------|
| 最小基础镜像 | distroless/slim（无 shell） |
| 镜像扫描 | Trivy/Clair（CVE 漏洞检测） |
| 镜像签名 | cosign/Notary（防篡改） |
| 私有仓库 | Harbor（带权限控制） |
| .dockerignore | 排除敏感文件（.git/.env） |

### 6.2 运行时安全

| 措施 | 说明 |
|------|------|
| 非 root 运行 | USER appuser |
| 只读根文件系统 | --read-only + writable 卷 |
| 限制能力 | --cap-drop ALL（按需 --cap-add） |
| Seccomp | 限制系统调用 |
| AppArmor | 强制访问控制 |
| 镜像拉取策略 | imagePullPolicy: IfNotPresent |

### 6.3 K8s 安全

```yaml
# Pod Security Admission
apiVersion: v1
kind: Pod
metadata:
  name: secure-pod
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 1000
  containers:
  - name: app
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop: ["ALL"]
```

---

## 七、数据持久化

| 方式 | 说明 | 适用 |
|------|------|------|
| Named Volume | Docker 管理，独立于容器 | 数据库（推荐） |
| Bind Mount | 宿主目录挂进容器 | 开发热重载 |
| tmpfs | 纯内存，不落盘 | 敏感临时文件 |

---

## 八、网络模式

| 模式 | 说明 | 适用 |
|------|------|------|
| Bridge（默认） | 虚拟网桥 docker0 | 通用 |
| Host | 共享宿主网络 | 高性能 |
| None | 仅 loopback | 无网络批处理 |
| Overlay | 跨主机虚拟网络（VXLAN） | Swarm/K8s |

---

## 九、常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 构建慢 | 未利用缓存 | 调整指令顺序 + BuildKit 缓存 |
| 镜像大 | 未多阶段构建 | multi-stage + slim 基础镜像 |
| 容器 OOM | 内存超限 | 调整 memory limit |
| 权限问题 | root 运行 | USER 指令 + chown |
| 网络不通 | 防火墙/端口未映射 | -p 参数 + 检查 security group |

---

## 十、与其他板块的关系

- Kubernetes 见「[Kubernetes 核心](./Kubernetes核心.md)」；
- CI/CD 见「[CI/CD 工具](../基础知识/SRE与稳定性工程/05-变更管理与渐进式发布.md)」；
- 中间件部署见「[云上中间件体系总览](../基础知识/中间件/云上中间件体系总览.md)」。

> 一句话：**容器 = Namespace（视图隔离）+ cgroup（资源限制）+ UnionFS（分层文件）——生产用 containerd + Buildkit + 多架构构建 + distroless 镜像 + 非 root + 只读文件系统**。
