# GitOps 与持续交付

> 板块：云原生 　|　 返回：[README](README.md)

GitOps 是一种以 Git 为"唯一真相源"的云原生交付范式：系统的期望状态用声明式清单存于 Git，控制器自动把集群同步到该状态，并自愈漂移。本文讲清理念、对比、工具、渐进式交付与落地要点。

## 一、GitOps 核心理念

### 1.1 三个基本要素

- **声明式状态**：用 YAML（K8s 清单、Helm、Kustomize）描述"系统应该是什么样"。
- **Git 为真相源**：所有期望状态变更都通过 Git 提交完成，带审查、历史、回滚。
- **自动调和（Reconcile）**：控制器持续比对"实际状态"与"Git 期望状态"，发现漂移自动纠正。

### 1.2 Pull 模型

```
开发者 Push 清单 → Git 仓库 → Argo CD/Flux 检测差异 → 自动/审批同步 → K8s 集群
```

集群侧的控制器**主动拉取** Git 状态，而非 CI 系统**推送**到集群。这带来：
- 集群凭证不需暴露给 CI（CI 只推 Git）。
- 网络更友好（集群出向拉取，无需入站开放）。
- 自愈：集群状态被手动改坏，控制器会拉回 Git 定义的状态。

## 二、与传统 CI/CD 的区别

| 维度 | 传统 CI/CD（Push） | GitOps（Pull） |
|------|-------------------|----------------|
| 触发 | CI 构建后推送到集群 | 集群控制器拉取 Git |
| 真相源 | 脚本/CI 配置 | Git 声明式清单 |
| 凭证 | CI 需集群 kubeconfig | 集群内控制器持有 |
| 自愈 | 无（漂移需人工） | 自动纠正漂移 |
| 回滚 | 重新跑流水线 | git revert 即回滚 |
| 审计 | 依赖 CI 日志 | Git 提交历史即审计 |

注意：GitOps 不取代 CI。典型分工是 **CI 负责构建镜像/产出制品**，GitOps 负责**把制品部署到集群**。

## 三、核心工具

### 3.1 Argo CD

- 声明式、可视化 Web UI，支持多集群、多应用。
- 应用（Application）定义 Git 源 + 目标集群/命名空间。
- 同步模式：自动（检测到差异即同步）/ 手动（需审批）。
- 健康度评估与同步状态可视化（Sync Status / Health Status）。

### 3.2 Flux

- CNCF 毕业项目，轻量、组件化（source-controller、kustomize-controller 等）。
- 与 Kubernetes 原生集成度更高，偏向"自动化优先"。
- 适合以 YAML/Git 为中心、少 UI 诉求的团队。

### 3.3 Tekton

- K8s 原生流水线引擎，定义 Task/TaskRun/Pipeline。
- 常与 GitOps 配合：CI 阶段用 Tekton 构建，产出镜像后由 GitOps 同步。

### 3.4 渐进式交付扩展

- Argo Rollouts：支持金丝雀/蓝绿，可对接 Service Mesh 做流量切分。
- Flagger：基于指标的自动金丝雀分析（结合 Prometheus）。

## 四、典型工作流

1. 开发者提交代码 → CI 构建镜像、打 tag，更新镜像版本。
2. 一个独立的"部署清单仓库"（或同一仓库的 manifests 目录）收到 PR：更新镜像 tag / 副本数 / 配置。
3. 评审合并后，GitOps 控制器检测到 Git 变化。
4. 按策略（自动或审批）把变更同步到集群。
5. 健康检查通过即完成；失败则标记异常，可一键回滚。

清单仓库（manifest repo）与代码仓库分离是常见最佳实践：代码仓库管"怎么造"，清单仓库管"部署成什么样"。

## 五、渐进式交付（Progressive Delivery）

GitOps 不止"全量同步"，还可做受控发布：
- **金丝雀**：先放 5% 流量，指标正常再逐步放大。
- **蓝绿**：新旧两版本共存，切流量验证后下线旧版。
- 配合 Service Mesh（Istio/Linkerd）做细粒度流量权重。
- 基于 Prometheus 指标自动决策推进或回滚（Flagger）。

## 六、密钥管理

Git 不能明文存密钥。方案：
- **Sealed Secrets**：密钥加密进 Git，控制器在集群内解密。
- **External Secrets Operator**：从 Vault/云密钥管理服务同步到 K8s Secret。
- **SOPS**：加密部分 YAML 字段，Git 中只存密文。

## 七、多环境策略

- 多分支：dev / staging / prod 各一分支（易漂移，不推荐）。
- 单分支多目录：`envs/dev`、`envs/prod` 分目录，GitOps 各管各的。
- Kustomize overlay：base + 各环境 overlay，复用底座、覆盖差异。

## 八、优势

- **审计**：所有变更在 Git，可追溯、可评审。
- **回滚**：`git revert` 即回滚，比重跑流水线快。
- **一致性**：多环境/多集群由同一 Git 驱动，减少"雪花服务器"。
- **自愈**：手动改动被自动纠正，防止配置漂移。
- **安全**：集群凭证不外泄给 CI。

## 九、常见坑

1. **密钥提交 Git** → 泄露风险（用 Sealed Secrets / Vault）。
2. **不管漂移** → 手动改了集群，GitOps 却没纠正，价值打折（应开启自动调和）。
3. **同步频率过高** → 控制面压力与 API Server 负载。
4. **大仓库慢同步** → 拆分清单仓库或合理组织目录。
5. **CI 直接 kubectl apply** 混入 GitOps 流程 → 双写冲突、状态混乱。
6. **缺健康探针** → 同步成功但应用未就绪，误判完成。

## 十、延伸阅读

- [云原生/README](README.md)
- [SRE/README](../../SRE/README.md)
- 工具：Argo CD、Flux、Tekton、Argo Rollouts、Flagger、Sealed Secrets
