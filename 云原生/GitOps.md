# GitOps（以 Git 为事实源的声明式交付）

## 〇、本体介绍

**GitOps 是什么**：把** Git 仓库当作集群状态的唯一事实源（Single Source of Truth）**，集群里跑一个「 reconciller（如 Argo CD）」持续比对「Git 里的期望配置」与「集群里的实际状态」，不一致就自动同步（Pull 模式）。任何变更都走「改 Git → 自动生效」，而非「人 ssh 上集群 kubectl apply」。

**解决什么痛点**：手动部署易漂移（集群实际状态和文档对不上）、难回滚、无审计、多人操作互相踩。GitOps 让**每次变更都有 PR、有 Review、有历史、可一键回滚**。

**核心概念**：声明式配置（K8s YAML / Helm）、Git 唯一事实源、Pull 同步（Agent 拉）、漂移检测、自动回滚、Argo CD / Flux。

**适用场景**：K8s 环境、多集群、需要强审计与可回滚的团队。
**不适用场景**：纯 VM 裸机老旧环境（需适配器）、极小团队无 Git 流程。

---

## 一、GitOps 的核心原则

1. **Git 是唯一事实源**：集群想要的状态全在 Git。
2. **声明式**：用 K8s YAML/Helm 描述「要什么」，不是「怎么做」。
3. **自动化同步（Pull）**：集群内的 Agent 主动拉取并应用，而非人从外 push。
4. **持续调谐**：Agent 周期性比对，发现漂移（drift）自动纠正回 Git 描述的状态。
5. **可观测与回滚**：同步状态可见；回滚 = 把 Git 回退到上一个 commit。

---

## 二、Push 式 CI/CD vs Pull 式 GitOps

| 维度 | 传统 CI/CD（Push） | GitOps（Pull） |
|------|-------------------|----------------|
| 触发 | 流水线 `kubectl apply` 推到集群 | Agent 从 Git 拉，应用到集群 |
| 凭证 | 集群 kubeconfig 暴露在 CI | 集群内 Agent 有权，CI 无需凭证 |
| 漂移 | 集群被手动改后无人知 | Agent 检测漂移并纠正 |
| 回滚 | 重新跑流水线 | `git revert` + 自动同步 |
| 审计 | 看 CI 日志 | 看 Git 历史（天然审计） |

> 关联：CI/CD 专题已详述 Jenkins/GitLab CI/GitHub Actions（见 基础知识/CI-CD/）。GitOps 是 CI/CD 的「交付到集群」这一段的新范式。

---

## 三、Argo CD：最主流的 GitOps 工具

- **Architecture**：`argocd-server`（UI/API）、`argocd-repo-server`（拉 Git/渲染 Helm）、`argocd-application-controller`（比对+同步）。Application CRD 描述「Git 源 + 目标集群 + 路径」。
- **同步模式**：手动 / 自动（auto-sync）。自动模式下 Git 一改，集群马上对齐。
- **健康检查**：不仅看资源「Created」，还看 Pod Ready、Service 端点就绪，避免「YAML 应用了但没真跑起来」。
- **漂移检测**：集群被手动改 → Argo CD 标 `OutOfSync` 并可选自动修回。
- **回滚**：UI 上一键回退到任意历史版本（基于 Git commit）。

---

## 四、Flux：CNCF 毕业级方案

- 轻量、云原生原生（基于 controller-runtime），与 K8s 集成更「原生」。
- 组件：`source-controller`（Git/Helm 源）、`kustomize-controller`、`helm-controller`、`notification-controller`。
- 适合「想要 GitOps 能力但不想要重 UI」的团队。

---

## 五、应用配置管理：Kustomize / Helm

- **Kustomize**：基于 overlay 的 YAML 定制（base + overlays 区分 dev/staging/prod），无模板语言、纯 YAML 补丁。
- **Helm**：模板化打包（Chart + values），适合分发复杂应用。GitOps 工具都能渲染二者。
- 最佳实践：环境差异用 Kustomize overlay 或 Helm values 分文件，而非复制整套 YAML。

---

## 六、多集群与渐进交付

- **多集群**：一个 Git 仓库 / 多 Application 指向不同集群，统一治理。Argo CD 支持 `ApplicationSet` 批量生成。
- **渐进交付（Progressive Delivery）**：结合 Argo Rollouts 做金丝雀（Canary）/ 蓝绿（Blue-Green），按指标自动推进或回滚（与可观测性联动）。

---

## 七、安全与密钥

- Git 里不该放明文 Secret。用 **Sealed Secrets / SOPS / External Secrets Operator** 把密钥加密或外挂（Vault），Argo CD 同步时解密。
- 同步权限最小化；PR Review 是天然的四眼原则（four-eyes）。

---

## 八、典型工作流

1. 开发者提 PR 改 Git 里的 K8s YAML（如升级镜像 tag）。
2. Review 通过后 merge 到 main。
3. Argo CD 检测到 Git 变更，把新状态同步到集群。
4. 健康检查通过 → 上线；异常 → 自动/手动回滚到上一 commit。

---

## 九、与其他板块的关系

- **Kubernetes 核心**：GitOps 操作的对象就是 K8s 资源（Deployment/Service…）。
- **CI/CD**：GitOps 接管「部署到集群」环节，与 Jenkins/GitHub Actions 互补（CI 构建镜像，GitOps 负责交付）。
- **可观测性**：渐进交付按可观测指标（错误率/延迟）决定推进或回滚。
- **架构 / 企业架构**：GitOps 是架构治理中「交付一致性」的工程落地。

---

## 十、速查表

| 工具 | 定位 | 特点 |
|------|------|------|
| Argo CD | GitOps + UI | 可视化、健康检查、回滚强 |
| Flux | GitOps 原生 | 轻量、controller-runtime、无重 UI |
| Kustomize | 配置定制 | overlay、纯 YAML |
| Helm | 模板打包 | Chart + values、易分发 |
| Argo Rollouts | 渐进交付 | Canary/Blue-Green、指标驱动 |

---

## 面试高频问题（20+ 条）

1. **GitOps 是什么？** 以 Git 为集群唯一事实源，Agent 持续把 Git 期望状态同步到集群（Pull 模式）。
2. **GitOps 和传统 CI/CD 区别？** 传统是流水线 push 到集群（需集群凭证）；GitOps 是集群 Agent pull（CI 无需凭证），且自动纠漂移、回滚靠 git revert。
3. **为什么叫 Pull 而不是 Push？** 同步由集群内 Agent 主动拉取，降低凭证外泄风险，且天然支持漂移纠正。
4. **Git 作为唯一事实源意味着什么？** 集群想要的状态全在 Git；手动改集群会被纠回，所有变更走 PR。
5. **Argo CD 核心组件？** server（UI/API）、repo-server（拉 Git/渲染）、application-controller（比对同步）。
6. **Application 是什么？** Argo CD 的 CRD，描述 Git 源 + 目标集群 + 路径 + 同步策略。
7. **漂移（drift）如何检测与处理？** Agent 比对 Git 与实际，标记 OutOfSync，可自动或手动 sync 回 Git 描述。
8. **GitOps 如何回滚？** `git revert` 到上一个 commit，Agent 自动同步回旧状态；Argo CD UI 也可一键回退。
9. **GitOps 安全优势？** CI 不持集群凭证；PR Review 是四眼原则；权限最小化。
10. **Git 里能放 Secret 吗？** 不能明文；用 Sealed Secrets / SOPS / External Secrets（Vault）加密或外挂。
11. **Kustomize 和 Helm 选哪个？** Kustomize 纯 YAML overlay、无模板；Helm 模板化、适合打包分发；GitOps 都支持。
12. **多集群怎么管？** 一个 Git + 多个 Application/ApplicationSet 指向不同集群，统一治理。
13. **渐进交付（Progressive Delivery）？** 结合 Argo Rollouts 做金丝雀/蓝绿，按指标自动推进或回滚。
14. **GitOps 适合 VM/裸机吗？** 直接不适合；需适配器（如把 VM 配置也声明化），主流还是 K8s。
15. **健康检查为什么重要？** 不只看 YAML 应用了，还要看 Pod Ready/端点就绪，避免「配置进去了但没真跑起来」。
16. **Flux 和 Argo CD 区别？** Flux 更轻量、K8s 原生、无重 UI；Argo CD 功能全、UI 强、可视化好。
17. **GitOps 的审计价值？** 所有变更都是 Git commit + PR，天然审计追溯，优于查 CI 日志。
18. **如何防止误删生产？** 保护分支 + PR 评审 + Argo CD 的 sync 策略（如 require manual approval for prod）。
19. **镜像 tag 怎么管理？** 固定不可变 tag（如 commit sha），避免 `latest` 导致不可重现；Git 记录 tag 即记录部署版本。
20. **GitOps 和声明式 API 关系？** 都是「描述期望状态、系统调谐对齐」思想的延伸——K8s 内调谐，GitOps 跨 Git↔集群调谐。
21. **CI 和 GitOps 如何分工？** CI 负责构建/测试/出镜像；GitOps 负责把镜像+配置交付并维持集群状态。
22. **中小团队要上 GitOps 吗？** 看痛点；若已有稳定 CI/CD 且变更少，收益有限；多环境/多集群/强审计诉求时回报高。
