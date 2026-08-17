# K8s 故障排查手册（Pod / Service / Ingress 常见问题）

> K8s 排障 =「**从状态倒推原因**」。Pod 起不来、Service 不通、Ingress 404 是三大高频问题。本篇按「问题分类 → 排查命令 → 常见原因 → 解决方案」结构化拆解，可直接当运维 SOP 使用。

---

## 一、Pod 排障（最常见）

### 1.1 Pod 状态速查

| 状态 | 含义 | 排查方向 |
|------|------|----------|
| Pending | 未调度到节点 | 资源不足/亲和性/PVC 绑定 |
| ImagePullBackOff | 镜像拉取失败 | 镜像名错/仓库认证/网络 |
| CrashLoopBackOff | 启动后反复崩溃 | 应用日志/环境变量/配置 |
| Error | 运行中出错 | 应用日志/OOM/权限 |
| Terminating | 正在终止 | preStop 钩子/资源回收 |
| OOMKilled | 内存溢出被杀 | 内存 limit 太小/内存泄漏 |

### 1.2 排查命令

```bash
# 1. 查看 Pod 状态
kubectl get pods -n <ns> -o wide

# 2. 查看详细事件（排障第一步）
kubectl describe pod <pod> -n <ns>

# 3. 查看日志（当前容器）
kubectl logs <pod> -n <ns> --tail=100

# 4. 查看上一个崩溃容器日志
kubectl logs <pod> -n <ns> --previous

# 5. 进入容器排查
kubectl exec -it <pod> -n <ns> -- /bin/sh

# 6. 查看资源使用
kubectl top pod <pod> -n <ns>
```

### 1.3 常见问题速查

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| Pending | 节点资源不足 | 扩容节点 / 降低 requests |
| Pending | PVC Pending | 检查 StorageClass / 配额 |
| Pending | nodeSelector 不匹配 | 调整 nodeSelector / 标签 |
| ImagePullBackOff | 镜像名错误 | 检查 image 字段拼写 |
| ImagePullBackOff | 仓库需要认证 | 创建 imagePullSecret |
| CrashLoopBackOff | 应用报错 | 查 `kubectl logs --previous` |
| CrashLoopBackOff | 健康检查失败 | 调整 livenessProbe 参数 |
| OOMKilled | limit 太小 | 增加 memory limit |
| OOMKilled | 内存泄漏 | 用 Arthas/jstack 排查应用 |

---

## 二、Service 排障

### 2.1 排查流程

```bash
# 1. 检查 Service 是否存在
kubectl get svc <svc> -n <ns>

# 2. 检查 Endpoints（核心！）
kubectl get endpoints <svc> -n <ns>
# Endpoints 为空 = 没有匹配的 Pod

# 3. 检查 Pod selector 是否匹配
kubectl get pods -n <ns> -l app=<label>

# 4. 检查端口映射
kubectl describe svc <svc> -n <ns>

# 5. 从集群内测试连通性
kubectl run test --rm -it --image=busybox -- wget -qO- http://<svc>.<ns>.svc.cluster.local:<port>

# 6. 检查 kube-proxy 规则
iptables -t nat -L KUBE-SERVICES | grep <svc-ip>
```

### 2.2 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| Endpoints 为空 | Pod selector 不匹配 | 修正 selector 标签 |
| Endpoints 为空 | Pod 未就绪 | 检查 readinessProbe |
| 端口不通 | targetPort 错误 | 确认容器实际监听端口 |
| DNS 解析失败 | CoreDNS 异常 | `kubectl get pods -n kube-system -l k8s-app=kube-dns` |
| 延迟高 | iptables 规则多 | 切换 IPVS 模式 |

---

## 三、Ingress 排障

```bash
# 1. 查看 Ingress 资源
kubectl get ingress -n <ns>

# 2. 查看 Ingress Class
kubectl get ingressclass

# 3. 查看 Ingress Controller 日志
kubectl logs -n ingress-nginx <controller-pod>

# 4. 检查后端 Service 是否正常
kubectl get endpoints <svc> -n <ns>

# 5. 本地测试（port-forward）
kubectl port-forward -n ingress-nginx <controller-pod> 8080:80
curl -H "Host: <domain>" http://localhost:8080
```

### 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 404 | 路径规则不匹配 | 检查 path 字段（前缀/精确） |
| 502/503 | 后端 Service 不可用 | 检查 Endpoints + Pod 状态 |
| TLS 错误 | Secret 不匹配/过期 | 检查 TLS Secret 证书 |
| 外部无法访问 | Ingress Controller 未暴露 | 检查 LB/NodePort 配置 |

---

## 四、节点排障

```bash
# 1. 节点状态
kubectl get nodes
kubectl describe node <node>

# 2. 节点资源
kubectl top node

# 3. 节点条件（ Conditions）
# Ready / MemoryPressure / DiskPressure / PIDPressure
kubectl get nodes -o custom-columns=NAME:.metadata.name,STATUS:.status.conditions[-1].type,REASON:.status.conditions[-1].reason

# 4. 排查节点进程
ssh <node>
top -c
df -h
journalctl -u kubelet --since "10 minutes ago"
```

---

## 五、通用排查工具

| 工具 | 用途 |
|------|------|
| `kubectl describe` | 查看资源详情与事件 |
| `kubectl logs` | 查看容器日志 |
| `kubectl exec` | 进入容器排查 |
| `kubectl port-forward` | 端口转发本地测试 |
| `kubectl get events --sort-by=.lastTimestamp` | 查看集群事件时间线 |
| `kubectx` / `kubens` | 快速切换 context/namespace |
| `stern` | 多 Pod 日志聚合查看 |
| `k9s` | 终端 UI 管理工具 |

---

## 六、与其他板块的关系

- Kubernetes 核心见「[Kubernetes 核心](./Kubernetes核心.md)」；
- K8s 网络见「[K8s 网络深挖](./K8s网络深挖.md)」；
- K8s 存储见「[K8s 存储深挖](./K8s存储深挖.md)」；
- Linux 排查见「[Linux 性能排查手册](../基础知识/Linux排查.md)」。

> 一句话：**K8s 排障三板斧：`describe` 看事件 → `logs` 看日志 → `exec` 进容器；Pod 起不来先查 events，Service 不通先查 endpoints，Ingress 404 先查后端**。
