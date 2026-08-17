# K8s 运维实战（Helm / Operator 调试 / 日志排查）

> K8s 运维 =「**声明式配置 + 控制器自愈 + 日志排障**」。日常运维聚焦：**Helm Chart 调试、Operator 运维、日志收集、性能调优、故障恢复**。本篇按「运维场景 → 命令 → 实践」拆解，可直接当运维手册使用。

---

## 一、Helm 运维

### 1.1 常用命令

```bash
# 查看已安装 Release
helm list -A

# 查看 Release 详情
helm status <release> -n <ns>

# 查看历史版本
helm history <release> -n <ns>

# 回滚
helm rollback <release> <revision> -n <ns>

# 升级（更新 values）
helm upgrade <release> <chart> -f values.yaml -n <ns>

# 卸载
helm uninstall <release> -n <ns>

# 模板调试（不部署，只渲染 YAML）
helm template <release> <chart> -f values.yaml

# Chart 打包
helm package <chart-dir>
```

### 1.2 Chart 调试技巧

| 技巧 | 说明 |
|------|------|
| `helm template` | 渲染 YAML 检查模板语法 |
| `--dry-run` | 模拟部署（校验 API 对象） |
| `--debug` | 打印渲染后的完整 YAML |
| `helm lint` | Chart 语法检查 |
| `values.yaml` | 配置覆盖（环境差异化） |

### 1.3 常见坑

- **模板渲染错误**：Go 模板语法（`{{ .Values.xxx }}`）拼写 → `helm template` 调试
- **RBAC 不足**：Helm ServiceAccount 权限不够 → 检查 Role/ClusterRole
- **CRD 冲突**：Operator CRD 版本不兼容 → 手动删除旧 CRD 后重装
- **Hook 失败**：pre-install/pre-upgrade Hook 失败 → 检查 Hook 日志

---

## 二、Operator 运维

### 2.1 核心概念

```
Operator = CRD（自定义资源）+ Controller（调谐逻辑）

CRD 定义新资源类型（如 MySQLCluster）
Controller 持续调谐：Spec（期望状态）→ Status（实际状态）

常用 Operator：
  Prometheus Operator（监控）
  PostgreSQL Operator（数据库）
  RocketMQ Operator（消息）
  Redis Operator（缓存）
```

### 2.2 调试命令

```bash
# 查看自定义资源
kubectl get crd | grep <name>
kubectl get <crd-name> -n <ns>

# 查看 Controller 日志
kubectl logs -n <operator-ns> <operator-pod> -f

# 查看资源事件
kubectl describe <crd-name> <instance> -n <ns>

# 查看调谐状态
kubectl get <crd-name> <instance> -n <ns> -o yaml | grep -A 20 status
```

---

## 三、日志排查

### 3.1 日志收集架构

```
应用 stdout → 容器运行时（docker/containerd）→ 节点日志
  → DaemonSet 采集（Fluent Bit/Promtail）
  → 日志平台（Loki/ES/云日志）

直接查看：
  kubectl logs <pod> -n <ns>          — 当前日志
  kubectl logs <pod> --previous       — 上次崩溃日志
  kubectl logs <pod> -c <container>   — 多容器 Pod 指定容器
  kubectl logs -l app=<label> --all-containers=true  — 按标签查
```

### 3.2 日志排查技巧

| 技巧 | 说明 |
|------|------|
| `--previous` | 查看上次崩溃日志（CrashLoopBackOff 必查） |
| `--tail=100` | 只看最后 100 行 |
| `--since=1h` | 只看最近 1 小时 |
| `stern` | 多 Pod 日志聚合（`stern -n <ns> <label>`） |
| `kubectl exec` | 进容器查看应用日志文件 |

---

## 四、性能调优

### 4.1 资源配置

```yaml
resources:
  requests:
    cpu: "500m"      # 0.5 核
    memory: "512Mi"
  limits:
    cpu: "1000m"     # 1 核
    memory: "1Gi"
```

| 配置 | 说明 |
|------|------|
| requests | 调度依据（Pod 必须有这么多资源才调度） |
| limits | 运行上限（超过 limits 被 OOMKilled/CPU throttled） |
| QoS 等级 | Guaranteed（requests=limits）> Burstable > BestEffort |

### 4.2 HPA 自动扩缩

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-app
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
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

### 4.3 性能分析

```bash
# kubectl top 查看资源使用
kubectl top pods -n <ns>
kubectl top nodes

# 节点资源分布
kubectl describe nodes | grep -A 5 "Allocated resources"

# Pod 资源使用趋势（需 Metrics Server）
kubectl top pod <pod> --containers
```

---

## 五、故障恢复

| 场景 | 恢复步骤 |
|------|----------|
| Pod CrashLoopBackOff | `kubectl logs --previous` → 修 bug → 重新部署 |
| Node NotReady | 检查节点资源 → 重启 kubelet → 检查网络/CNI |
| PVC Pending | 检查 StorageClass → 检查配额 → 检查 CSI 驱动 |
| Service 无 Endpoints | 检查 Pod selector → 检查 readinessProbe |
| Deployment 更新卡住 | `kubectl rollout status` → 检查新 Pod → 回滚 |
| etcd 磁盘满 | 清理空间 → 压缩 revision → 扩容磁盘 |

---

## 六、与其他板块的关系

- K8s 核心见「[Kubernetes 核心](./Kubernetes核心.md)」；
- K8s 网络见「[K8s 网络深挖](./K8s网络深挖.md)」；
- K8s 存储见「[K8s 存储深挖](./K8s存储深挖.md)」；
- K8s 故障排查见「[K8s 故障排查手册](./K8s故障排查手册.md)」；
- Helm/Operator 详细见「[Helm 与 Operator](./Helm与Operator.md)」。

> 一句话：**K8s 运维三板斧：Helm（部署管理）+ kubectl logs/describe（排障）+ kubectl top/HPA（性能调优）——日常运维 80% 靠 kubectl，剩下 20% 靠 helm + logs**。
