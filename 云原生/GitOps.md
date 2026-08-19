# GitOps（深入：ArgoCD/FluxCD 对比 / 多集群 / 渐进交付 / 安全 / Secret 管理）

> 把 **Git 仓库当作集群状态的唯一事实源**，Agent 持续比对 Git 期望状态与集群实际状态，不一致自动同步。本篇深入拆解：ArgoCD vs FluxCD 详细对比、多集群 GitOps、Secret 管理、渐进交付、生产最佳实践。

---

## 一、GitOps 核心原则

1. **Git 是唯一事实源**：集群想要的状态全在 Git
2. **声明式**：用 K8s YAML/Helm 描述「要什么」
3. **自动化同步（Pull）**：Agent 主动拉取并应用
4. **持续调谐**：Agent 周期性比对，发现漂移自动纠正
5. **可观测与回滚**：回滚 = git revert + 自动同步

---

## 二、Push vs Pull 模式

| 维度 | 传统 CI/CD（Push） | GitOps（Pull） |
|------|-------------------|----------------|
| 触发 | 流水线 kubectl apply 推到集群 | Agent 从 Git 拉并应用 |
| 凭证 | 集群 kubeconfig 暴露在 CI | 集群内 Agent 有权，CI 无需凭证 |
| 漂移 | 集群被手动改后无人知 | Agent 检测漂移并纠正 |
| 回滚 | 重新跑流水线 | git revert + 自动同步 |
| 审计 | 看 CI 日志 | 看 Git 历史（天然审计） |

---

## 三、ArgoCD vs FluxCD 详细对比

| 维度 | ArgoCD | FluxCD |
|------|--------|--------|
| 架构 | server + repo-server + app-controller | 多个独立 controller（source/kustomize/helm/notification） |
| UI | 丰富的 Web UI + CLI | 无 UI（纯 CLI + K8s API） |
| 多集群 | ApplicationSet 批量生成 | Kustomization 跨集群引用 |
| Helm 支持 | 原生支持 Helm Chart | HelmRelease CRD |
| Kustomize | 原生支持 | Kustomization CRD |
| 渐进交付 | Argo Rollouts 集成 | Flagger 集成 |
| RBAC | 内置 RBAC（SSO 集成） | 依赖 K8s RBAC |
| 学习曲线 | 中等（有 UI 降低门槛） | 较低（K8s 原生） |
| 社区生态 | CNCF 毕业，企业采用多 | CNCF 毕业，云原生原生 |
| 适用 | 需要 UI + 多租户 + 审计 | 需要轻量 + K8s 原生 |

### 推荐选择

```
需要可视化 + 多租户 → ArgoCD
追求轻量 + K8s 原生 → FluxCD
企业级多集群 → ArgoCD（ApplicationSet + SSO + RBAC）
```

---

## 四、多集群 GitOps

### 4.1 架构模式

```
模式一：一个 Git 仓库 + 多个 Application
  Git Repo
    ├── base/          # 公共配置
    ├── overlays/
    │   ├── dev/       # 开发环境
    │   ├── staging/   # 预发环境
    │   └── prod/      # 生产环境
  ArgoCD ApplicationSet 自动生成多集群 Application

模式二：多 Git 仓库
  不同团队/项目独立 Git 仓库
  每个仓库独立配置 ArgoCD Application
  适合：大组织多团队

模式三：Hub-Spoke
  Hub 集群管理多个 Spoke 集群
  Git 变更 → Hub 同步 → 分发到 Spoke
  适合：多区域/多云
```

### 4.2 ApplicationSet（ArgoCD）

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: my-app
spec:
  generators:
  - list:
      elements:
      - cluster: dev
        url: https://dev-cluster
      - cluster: staging
        url: https://staging-cluster
      - cluster: prod
        url: https://prod-cluster
  template:
    metadata:
      name: 'my-app-{{cluster}}'
    spec:
      project: default
      source:
        repoURL: https://github.com/org/repo
        path: overlays/{{cluster}}
      destination:
        server: '{{url}}'
        namespace: my-app
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
```

---

## 五、Secret 管理

### 5.1 方案对比

| 方案 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| Sealed Secrets | K8s 控制器解密 | 简单 | 密钥在集群中 |
| SOPS | 加密 YAML/JSON | 灵活 | 需管理加密密钥 |
| External Secrets | 从 Vault/AWS SM 同步 | 安全 | 依赖外部系统 |
| Vault Agent | Vault 注入 | 最安全 | 复杂 |

### 5.2 Sealed Secrets 示例

```bash
# 安装
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/controller.yaml

# 加密 Secret
kubectl create secret generic my-secret --from-literal=password=abc123 --dry-run=client -o yaml | kubeseal -o yaml > sealed-secret.yaml

# sealed-secret.yaml 可以安全提交到 Git
# ArgoCD 同步时 Sealed Secrets 控制器自动解密
```

---

## 六、渐进交付（Progressive Delivery）

### 6.1 Argo Rollouts

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: my-app
spec:
  replicas: 10
  strategy:
    canary:
      steps:
      - setWeight: 10      # 10% 流量到新版本
      - pause: {duration: 5m}  # 观察 5 分钟
      - analysis:          # 自动分析指标
          templates:
          - templateName: success-rate
      - setWeight: 50
      - pause: {duration: 10m}
      - setWeight: 100
      canaryService: my-app-canary
      stableService: my-app-stable
      trafficRouting:
        istio:
          virtualService:
            name: my-app-vsvc
```

### 6.2 Flagger（Flux 生态）

```
Flagger = 渐进交付 K8s Operator

支持：Canary / Blue-Green / A/B 测试
指标源：Prometheus / Datadog / CloudWatch
决策：自动推进或回滚（基于指标阈值）
```

---

## 七、生产最佳实践

| 实践 | 说明 |
|------|------|
| 分支策略 | main 分支 = 生产，develop = 预发，feature 分支开发 |
| PR 评审 | 所有变更必须 PR + Review + 合并 |
| 保护分支 | prod 分支限制直接 push |
| 镜像标签 | 用 commit SHA（不可变），不用 latest |
| 同步策略 | prod 用手动同步（需审批），dev/staging 用自动同步 |
| 健康检查 | 检查 Pod Ready + Service 端点 |
| 告警 | OutOfSync / Sync 失败 / 健康检查失败 → 告警 |
| 审计 | Git 历史天然审计，定期 Review |

---

## 八、与其他板块的关系

- Kubernetes 核心见「[Kubernetes 核心](./Kubernetes核心.md)」；
- CI/CD 见「[CI-CD](../基础知识/CI-CD/README.md)」；
- 可观测性见「[OpenTelemetry](../基础知识/中间件/OpenTelemetry.md)」；
- Service Mesh 见「[ServiceMesh](./ServiceMesh.md)」。

> 一句话：**GitOps = Git 唯一事实源 + Agent Pull 同步 + 漂移自动纠正——ArgoCD 有 UI 适合企业级，FluxCD 轻量适合云原生；生产核心：PR 评审 + 保护分支 + 自动同步 + 健康检查 + git revert 回滚**。
