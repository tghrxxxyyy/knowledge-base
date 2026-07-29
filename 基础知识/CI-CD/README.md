# CI/CD 持续集成与持续交付 · 专题索引

> **口诀：CI/CD 的本质，是把"人肉发布"变成"可重复、可审计、可回滚"的自动化流水线。**

## 一、板块定位

本专题系统讲解现代软件交付的 **CI/CD（持续集成 / 持续交付 / 持续部署）** 全链路：

- 上游：**版本控制与分支策略**、**构建与制品管理**（一切自动化的起点）；
- 引擎：**Jenkins / GitLab CI / GitHub Actions** 三大主流 CI 系统，含 Pipeline as Code 完整示例；
- 云原生：**GitOps（Tekton / Argo CD / Flux）** 与多云发布（Spinnaker）的工具选型与原理；
- 设计：**流水线设计模式与最佳实践**（阶段划分、并行、缓存、质量门禁、测试金字塔）；
- 交付：**部署策略（蓝绿 / 金丝雀 / 滚动 / 影子）**、**容器化与 Kubernetes 集成**；
- 保障：**环境配置与密钥管理**、**可观测性、DORA 度量与 DevSecOps（供应链安全）**。

目标是让你既能**选型落地**，又懂**底层原理**与 **2025–2026 最新趋势**（DORA 2025、GitOps、SLSA/Sigstore、AI 辅助 CI/CD）。

## 二、文章地图（13 篇）

| 篇 | 标题 | 核心要点 |
|----|------|----------|
| 01 | [概述与核心概念](01-概述与核心概念.md) | CI/CD 定义边界、DevOps 文化、流水线、左移、GitOps 概念、DORA 四指标、成熟度模型 |
| 02 | [版本控制与分支策略](02-版本控制与分支策略.md) | GitFlow / GitHub Flow / GitLab Flow / Trunk-Based、Conventional Commits、PR/MR 门禁 |
| 03 | [构建与制品管理](03-构建与制品管理.md) | Maven/Gradle/npm、增量与可重现构建、Nexus/Artifactory、Docker 多阶段构建、SBOM |
| 04 | [Jenkins 架构与核心机制](04-Jenkins架构与核心机制.md) | Controller/Agent、插件生态与安全、权限与凭据、JCasC、高可用 |
| 05 | [Jenkins Pipeline as Code](05-Jenkins Pipeline as Code.md) | Declarative/Scripted、Jenkinsfile、共享库、K8s 动态 agent、3 个完整示例 |
| 06 | [GitLab CI](06-GitLab CI.md) | .gitlab-ci.yml、Runner/executor、cache vs artifacts、needs DAG、安全扫描模板、OIDC |
| 07 | [GitHub Actions](07-GitHub Actions.md) | workflow/job/step/action、matrix、secrets/OIDC、reusable workflow、self-hosted |
| 08 | [云原生 CI/CD 与 GitOps 工具](08-云原生CI-CD与GitOps工具.md) | Tekton/Argo CD/Flux/Spinnaker/Drone/CircleCI 等横向对比、GitOps 拉式 reconcile |
| 09 | [流水线设计模式与最佳实践](09-流水线设计模式与最佳实践.md) | 标准阶段、并行扇出扇入、缓存层次、质量门禁、测试金字塔、反模式对照 |
| 10 | [部署策略](10-部署策略.md) | 蓝绿/金丝雀/滚动/灰度/影子、特性开关、回滚、expand-contract 数据库迁移 |
| 11 | [容器化与 Kubernetes 集成](11-容器化与Kubernetes集成.md) | Dockerfile 最佳实践、Helm/Kustomize、K8s 滚动更新与探针、Argo Rollouts |
| 12 | [环境配置与密钥管理](12-环境配置与密钥管理.md) | 多环境、配置外置、Vault、Sealed Secrets/ESO/SOPS、OIDC 免密钥、不可变基础设施 |
| 13 | [可观测性、DORA 度量与 DevSecOps](13-可观测性DORA度量与DevSecOps.md) | DORA 指标、流水线可观测、SAST/DAST/SCA、SBOM、SLSA/Sigstore、AI 辅助 |

## 三、速查表

### 3.1 CI / CD / DevOps / GitOps 区别

| 概念 | 关注点 | 关键动作 | 与上游关系 |
|------|--------|----------|------------|
| CI 持续集成 | 频繁合入、快速反馈 | 自动构建 + 单元测试 | 防破窗 |
| CD 持续交付 | 随时可发布 | 自动化到预发，手动按按钮上线 | 降低发布恐惧 |
| CD 持续部署 | 每次通过自动上线生产 | 全自动，无手动卡点 | 极致吞吐 |
| DevOps | 文化 + 协作 + 工具链 | 打破部门墙、度量驱动改进 | 组织层 |
| GitOps | 以 Git 为唯一事实源的声明式运维 | 拉式 reconcile，回退 = 回退 commit | 云原生交付范式 |

### 3.2 部署策略速查

| 策略 | 停机 | 回滚速度 | 资源占用 | 流量控制粒度 | 适用场景 |
|------|------|----------|----------|--------------|----------|
| 蓝绿 Blue-Green | 无 | 秒级（切流） | 双倍 | 全量切换 | 关键业务、强一致性 |
| 金丝雀 Canary | 无 | 缩流量即可 | 中 | 按比例/按用户 | 风险变更、验证新逻辑 |
| 滚动 Rolling | 无（逐批） | 中 | 省 | 批次 | 无状态服务 |
| 灰度/分批 | 无 | 中 | 中 | 批次 | 国内常见叫法 |
| 影子 Shadow | 无（不接真实返回） | 不涉及 | 中 | 复制流量 | 压测/验证 |
| 重建 Recreate | 有 | 重新部署 | 省 | 无 | 非核心、短停机可接受 |

### 3.3 工具选型速查

| 场景 | 首选 | 备注 |
|------|------|------|
| 代码已在 GitLab | GitLab CI | 一体化、Runner 灵活 |
| 代码已在 GitHub | GitHub Actions | 生态最大、Marketplace |
| 老牌自托管、插件多 | Jenkins | 控权强但运维重 |
| K8s 原生 CI | Tekton | CRD 编排、与 Argo CD 分工 |
| K8s 原生 CD / GitOps | Argo CD / Flux | 拉式、声明式 |
| 多云可视化发布 | Spinnaker | Pipeline 可视化、自动分析 |

### 3.4 DORA 四指标（精英团队区间，2025）

- **部署频率 DF**：按需，每日多次
- **变更前置时间 LT**：不到一小时（从提交到生产）
- **变更失败率 CFR**：0–15%
- **服务恢复时间 MTTR**：不到一小时
- （2025 新增）**返工率 Rework Rate**：越低越好（精英团队约 12.8%）

> DORA 2025 报告强调：AI 已成"镜子与放大器"——用得好提升效能，流程差的团队会被放大问题；稳定性与吞吐量必须兼顾，不可偏废。

## 四、学习路径

1. **建立全局观**：先读 `01 概述与核心概念` → `02 版本控制与分支策略`（分支模型是所有协作的基础）。
2. **选一个引擎深读**：你实际用哪个就精读哪个——Jenkins（`04`/`05`）、GitLab CI（`06`）、GitHub Actions（`07`）。
3. **理解流水线怎么设计**：`09 流水线设计模式与最佳实践`，配合 `03 构建与制品管理`。
4. **上线必看**：`10 部署策略`、`11 容器化与 Kubernetes 集成`、`12 环境配置与密钥管理`。
5. **进阶与趋势**：`08 云原生 CI/CD 与 GitOps 工具`、`13 可观测性、DORA 度量与 DevSecOps`。

## 五、与其他模块的关联

- **云原生 / Kubernetes**：`11` 篇深度依赖 K8s 知识；`08` 的 GitOps 本质就是云原生交付范式。
- **大数据**：其调度与数据流水线（`10 资源调度：YARN 与 Kubernetes`、`11 实时数仓与湖仓一体`）同样是 DAG + 质量门禁，思想互通。
- **场景设计**：稳定性三板斧（限流/熔断/降级）、灰度发布与 `10 部署策略` 直接呼应。
- **大模型**：模型训练/推理服务的 CI/CD（MLOps）与本文流水线原则一致（可重现、质量门禁、制品晋级）。

## 六、参考（一键直达官方文档）

- DORA / Google Cloud DevOps Research：https://dora.dev/
- GitLab CI 文档：https://docs.gitlab.com/ee/ci/
- GitHub Actions 文档：https://docs.github.com/actions
- Jenkins 文档：https://www.jenkins.io/doc/
- Argo CD：https://argo-cd.readthedocs.io/ ｜ Tekton：https://tekton.dev/ ｜ Flux：https://fluxcd.io/
- OpenGitOps：https://opengitops.dev/ ｜ SLSA：https://slsa.dev/ ｜ Sigstore：https://www.sigstore.dev/
- CNCF 持续交付：https://www.cncf.io/

## 七、CI/CD 成熟度模型（5 级）

参考 DORA 与业界实践，团队可按五级自测定位、制定演进路线（**不要跳级**）：

| 级别 | 名称 | 关键特征 | 典型瓶颈 |
|------|------|----------|----------|
| L0 | 手工/脚本化 | 本地构建、手工打包部署、无统一流水线 | 人为错误多、不可重现 |
| L1 | 基础 CI | 提交触发自动构建+单测、集中制品库 | 测试慢、缺质量门 |
| L2 | 持续交付 | 一键/自动部署到类生产、环境标准化 | 发布靠窗口、回滚慢 |
| L3 | 持续部署+门禁 | 自动化晋级门禁、金丝雀/蓝绿、可观测闭环 | 跨团队协同弱、安全左移不足 |
| L4 | 平台化/DevSecOps | IDP、GitOps、供应链签名、DORA 常态化度量 | 规模化治理与单位成本 |

> 演进建议：先稳住 L1 的"快速失败"，再补 L2 的环境一致性，最后上 L3/L4 的门禁与平台化。每升一级都需配套 DORA 度量验证收益，避免"为升级而升级"。

## 八、工具选型决策表

| 维度 | Jenkins | GitLab CI | GitHub Actions | Argo CD | Flux | Drone |
|------|---------|-----------|----------------|---------|------|-------|
| 定位 | 通用引擎 | 一体化平台 | 托管生态 | GitOps 交付 | GitOps 交付 | 轻量 CI |
| 学习曲线 | 陡 | 中 | 低 | 中 | 中高 | 低 |
| 自托管 | 强 | Runner | self-hosted | 必需 | 必需 | 强 |
| 云原生 | K8s Agent | 原生 | 一般 | 原生 | 原生 | 容器原生 |
| 生态 | 插件最多 | 内置安全/包 | Marketplace | Helm/Kustomize | Kustomize/OCI | 少 |
| 适用 | 复杂老系统 | 全流程一体 | 开源/GH 项目 | K8s 渐进交付 | K8s 多租 | 小型/边缘 |

> 口诀：**要灵活老牌选 Jenkins；要一体选 GitLab；要生态选 GitHub Actions；要 K8s 声明式交付选 Argo CD/Flux。**

## 九、常见反模式

1. **巨石 Jenkinsfile / YAML**：几百行逻辑塞进单文件 → 抽共享库 / `include` 拆分。
2. **`latest` 标签与可变制品**：同一 tag 内容会变 → 钉 `git sha`/digest，制品不可变。
3. **CI 里存静态密钥**：用 OIDC 换临时凭证，密钥入 Vault / ESO。
4. **无质量门禁的"快"**：构建快但漏测漏扫 → 左移 SAST / SCA / 单测覆盖率。
5. **跳过回滚演练**：只测发布不测回滚 → 把回滚当一等公民写进流水线。
6. **人工卡点变摆设**：`when: manual` 未配 `allow_failure: false` → 假卡点。
7. **一个 repo 管所有环境不隔离**：用 GitOps `overlays/` 或 Helm per-env values 表达晋级。

## 十、进阶学习路径（补充）

- **打地基**：本模块 01→02→03→09，建立流水线 + 制品心智。
- **选引擎**：Jenkins(04/05)、GitLab(06)、GitHub(07) 三选一深挖，其余横向对比。
- **上云原生**：08(GitOps)+11(K8s)+10(部署策略)，把交付搬到 K8s。
- **补安全与度量**：12(密钥)+13(DevSecOps/DORA)，形成"度量—改进"闭环。
- **平台化**：在 L3/L4 之上建设 IDP，把流水线、环境、密钥、门禁产品化给研发自助。
