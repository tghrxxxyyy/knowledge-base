# 云容器编排与 DevOps 体系（托管 K8s / CI-CD / GitOps）

> 云上容器编排把 K8s 控制面托管、CI/CD 流水线 SaaS 化、部署策略 GitOps 化——开发者只写业务代码与应用描述，平台负责构建/部署/回滚。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解，并深入托管控制面、GitOps 拉取模型、流水线即代码等机制。

---

## 一、云容器编排（托管 K8s）

### 1.1 解决的问题

自建 K8s 控制面（API Server/ etcd/ Controller Manager/ Scheduler）运维复杂、升级风险高 → 托管控制面，只负责工作节点。

### 1.2 原理

- **控制面托管**：云厂商管理 API Server/etcd/控制器，用户不可见
- **工作节点**：用户管理节点组（Node Group/托管节点/虚拟节点）
- **网络/存储集成**：原生集成云 VPC、负载均衡、块存储、对象存储

| 服务 | 厂商 | 关键点 |
|------|------|--------|
| EKS | AWS | 托管 K8s、与 IAM/ALB/VPC 集成、Fargate 无节点模式 |
| AKS | Azure | 托管 K8s、与 AD/Monitor 集成、虚拟节点 |
| GKE | GCP | 托管 K8s、Autopilot 模式（免节点管理）、与 Cloud Operations 集成 |
| ACK | 阿里云 | 托管 K8s、与 RAM/SLB/OSS 集成、托管/专有/Serverless 版 |
| TKE | 腾讯云 | 托管 K8s、与 CAM/CLB/COS 集成 |

| 特性 | 说明 |
|------|------|
| 控制面 SLA | 云厂商承诺 99.5%~99.95% 可用性 |
| 自动升级 | 控制面/节点版本自动或手动升级 |
| 托管节点组 | 节点自动修复/替换/扩缩 |
| Serverless 节点 | Fargate/ACI/ECI（按 Pod 计费，无节点管理） |
| 多集群管理 | EKS Anywhere/Anthos/TKE 多集群统一治理 |

### 1.3 托管控制面机制深入

```
自建 vs 托管：
  自建：API Server + etcd + Scheduler + Controller Manager 全自管
    → 升级补丁、etcd 备份、控制面高可用都要自己搞
  托管：控制面由云厂商管理（版本升级/补丁/高可用）
    → 用户只管理工作节点（Node Group）

etc 处理（托管）：
  控制面 etcd：云厂商管理（3 副本 + 加密 + 快照）
  用户数据（ConfigMap/Secret）：仍存在 etcd
  → Secret 建议走外部密钥系统（见云配置与密钥管理）

节点管理（Node Group）：
  自动扩缩（Cluster Autoscaler / Karpenter）
  节点自动修复（异常节点替换）
  镜像预拉取/启动模板（快速扩容）

Serverless 节点（Fargate/ECI）：
  无需管理节点（无 Node Group）
  按 Pod 计费（秒级计费）
  适合：突发负载/无状态应用/不想管节点
  限制：不支持 DaemonSet/特权容器（部分场景）
```

**选型关注点**：单云 → 原生托管 K8s（生态联动最好）；多云/混合云 → Anthos/Rancher/ACK 多集群；不想管节点 → Serverless 节点（Fargate/ECI）。

---

## 二、镜像仓库（容器镜像托管）

| 服务 | 厂商 | 关键点 |
|------|------|--------|
| ECR | AWS | 托管 Docker/OCI 镜像、与 EKS/IAM 集成、镜像扫描 |
| ACR | Azure | 托管镜像、与 AKS 集成、任务构建 |
| GCR / Artifact Registry | GCP | 托管镜像、与 GKE 集成 |
| ACR（阿里云） | 阿里云 | 托管镜像、与 ACK 集成、安全扫描 |
| TCR | 腾讯云 | 托管镜像、与 TKE 集成 |

**解决的问题**：自建 Harbor 运维复杂 → 托管镜像仓库 + 自动 CVE 扫描 + 与 K8s 集成。

### 2.1 镜像供应链安全

```
镜像生命周期（Supply Chain）：
  代码 → 构建（SBOM 生成）→ 镜像扫描（CVE）→ 签名
  → 推送仓库 → 拉取（验证签名）→ 运行

关键实践：
  SBOM（软件物料清单）：记录镜像内所有依赖
  漏洞扫描：构建时 + 运行时（trivy/clair）
  镜像签名：Cosign（OIDC 身份签名）→ K8s 验证
  镜像不可变：tag 用 commit SHA（禁止 latest）
  拉取策略：优先从私有仓库（内网加速 + 受控）
```

---

## 三、CI/CD 流水线

### 3.1 解决的问题

代码提交后自动构建/测试/发布——不用 Jenkins 自己搭，要托管的流水线服务。

### 3.2 服务

| 服务 | 厂商 | 关键点 |
|------|------|--------|
| AWS CodePipeline + CodeBuild | AWS | 流水线 + 构建，与 ECR/EKS/Lambda 集成 |
| Azure DevOps / GitHub Actions | Azure | 完整 DevOps 平台 / 事件驱动 CI/CD |
| GCP Cloud Build + Cloud Deploy | GCP | 托管构建 + 交付管道，与 GKE 集成 |
| 阿里云云效 / 容器服务流水线 | 阿里云 | 与 ACR/ACK 集成 |
| 腾讯云 CODING / 持续集成 | 腾讯云 | 与 TCR/TKE 集成 |
| GitHub Actions | 多云 | 事实标准 CI/CD，与任意云集成 |

### 3.3 CI/CD 核心概念

| 概念 | 说明 |
|------|------|
| Pipeline as Code | 流水线定义在代码仓库（Jenkinsfile/GitHub Actions YAML） |
| 多阶段构建 | 构建→测试→安全扫描→推送镜像→部署 |
| 环境管理 | Dev/Staging/Prod 多环境、审批门控 |
| 制品管理 | 镜像/二进制版本化、回滚能力 |

### 3.4 流水线即代码深入

```
Pipeline as Code 的本质：
  流水线定义 = 代码（评审/版本/审计）
  → 每条流水线是一个"可复现的构建过程"

CI 阶段（Commit → Artifact）：
  代码检出 → 依赖安装 → 单元测试 → 静态检查（lint）→
  构建镜像 → 镜像扫描（CVE）→ 推送镜像仓库（tag=SHA）

CD 阶段（Artifact → 生产）：
  拉取镜像 → 部署到 Dev（自动）→ 冒烟测试 →
  审批门控 → 部署 Staging → 集成/压测 →
  审批门控 → 部署 Prod（金丝雀/蓝绿）→ 验证 → 完成

质量门控（Quality Gate）：
  测试覆盖率/静态扫描/SBOM 漏洞阈值
  任一门控失败 → 流水线终止（不放行到下一环境）

发布策略（CD 部署方式）：
  滚动（Rolling）：逐个替换 Pod
  金丝雀（Canary）：5% → 20% → 100% 逐步放量
  蓝绿（Blue/Green）：新旧版本并行，切换流量
  灰度指标：错误率/延迟/业务指标 → 自动回滚
```

**选型关注点**：GitHub 托管代码 → GitHub Actions（生态最广）；Azure 生态 → Azure DevOps；多云/混合云 → Jenkins/ Tekton（可移植）。

---

## 四、GitOps（声明式持续交付）

### 4.1 解决的问题

传统 CI/CD 推模式（CI 触发部署）→ GitOps 拉模式（Git 仓库是唯一事实来源，Agent 自动同步集群状态到 Git 声明）。

### 4.2 原理

- **声明式**：Git 仓库存储期望状态（K8s YAML / Helm / Kustomize）
- **Agent 同步**：ArgoCD/Flux 运行在集群中，持续对比 Git 与集群状态，自动同步
- **不可变**：所有变更通过 Git PR，可审计、可回滚

| 服务 | 厂商 | 关键点 |
|------|------|--------|
| ArgoCD | 多云（开源） | GitOps 事实标准、多集群、可视化、回滚 |
| Flux | 多云（开源） | CNCF 项目、轻量、与 Helm/Kustomize 集成 |
| AWS CodeCommit + Proton | AWS | 托管 Git + 服务目录 |
| Azure DevOps + Flux | Azure | 与 AKS 集成 |
| 阿里云 ArgoCD / 云效 | 阿里云 | 与 ACK 集成 |

### 4.3 GitOps 核心循环深入

```
GitOps 闭环：
  开发者提交 PR（修改 K8s YAML/Helm chart）
  → 评审合并到主干（Git 是唯一真相源）
  → ArgoCD Agent 检测到 Git 变更
  → 对比集群当前状态 vs Git 期望状态
  → 有差异 → 应用变更（同步）
  → 持续监控：集群漂移 → 自动收敛回 Git 状态

推 vs 拉的本质区别：
  CI/CD 推模式：CI 主动触发部署（部署由流水线驱动）
  GitOps 拉模式：Agent 在集群内拉取 Git（部署由 Git 驱动）
  → 安全：集群无需对外暴露部署权限（Agent 只读 Git + 改集群）
  → 可审计：所有变更来自 Git 提交（谁改了什么一目了然）
  → 自愈：集群漂移（手动 kubectl apply 被覆盖）自动收敛

版本回滚：
  Git 回滚 → ArgoCD 自动同步旧版本
  → 秒级回滚（Git revert + 同步）

多环境管理：
  每个环境一个 Git 目录/分支（dev/qa/prod）
  Kustomize 覆盖（环境差异）或 Helm values 文件
```

**选型关注点**：K8s 部署 → ArgoCD（可视化+多集群最强）；GitOps 理念 → Flux（更轻量 CNCF）；与 CI 集成 → GitHub Actions + ArgoCD（CI 推镜像，ArgoCD 拉部署）。

---

## 五、基础设施即代码（IaC）

| 工具 | 定位 | 关键点 |
|------|------|--------|
| Terraform | 多云 IaC 事实标准 | HCL 语言、状态管理、Provider 覆盖最广 |
| AWS CDK / CloudFormation | AWS IaC | CDK 用编程语言（TS/Python）定义资源 |
| Azure Bicep / ARM | Azure IaC | Bicep 是 ARM 模板的简化语言 |
| GCP Deployment Manager | GCP IaC | 基于 YAML/Jinja |
| Pulumi | 多云 IaC | 用编程语言（TS/Python/Go）定义资源 |
| Crossplane | 多云（K8s 原生） | 用 K8s CRD 管理云资源 |

**解决的问题**：手动控制台创建资源不可重复/不可审计 → 代码化管理基础设施。

### 5.1 IaC 核心机制

```
声明式 vs 命令式：
  命令式：执行命令创建资源（不可重复/不可审计）
  声明式：描述期望状态（Terraform plan/apply）

Terraform 流程：
  写 HCL（provider + resource）→ terraform init → plan（对比状态）
  → apply（执行变更）→ state 文件（记录资源状态）

状态管理：
  state 文件 = 资源的"当前状态快照"
  团队协作 → 远程状态（S3+锁/Terraform Cloud）
  锁机制防并发 apply

基础设施分层：
  环境级（VPC/子网/安全组）→ 平台级（集群/中间件）→ 应用级（服务）
  每层独立 Terraform 工程（模块化）
```

### 5.2 Terraform vs CDK/Pulumi 选择

```
Terraform：HCL 声明式，Provider 最全（多云），运维习惯
CDK：编程语言定义（TS/Python），类型安全，单云
Pulumi：编程语言（通用），多云，需要编程能力

选择：
  多云/生态最全 → Terraform
  单云 + 开发团队（想用代码）→ CDK/Bicep
  编程语言偏好 → Pulumi
  K8s 团队（全云资源纳入 K8s）→ Crossplane
```

**选型关注点**：多云 → Terraform（Provider 最广）；单云 → 原生 IaC（CDK/Bicep）；K8s 团队 → Crossplane。

---

## 六、制品与包管理

| 服务 | 厂商 | 关键点 |
|------|------|--------|
| AWS CodeArtifact | AWS | 托管 Maven/npm/PyPI 私有仓库 |
| Azure Artifacts | Azure | 与 Azure DevOps 集成 |
| GCP Artifact Registry | GCP | 托管 Docker/Maven/npm |
| 阿里云云效制品库 | 阿里云 | 与云效 CI 集成 |
| Nexus / JFrog Artifactory | 多云 | 自建/托管制品仓库 |

---

## 七、DevOps 组织与流程

### 7.1 发布流程规范

```
环境分层：
  Dev：开发自测（自动部署）
  Staging：预发布验证（功能/回归/压测）
  Prod：生产（金丝雀 + 监控）

发布规范：
  ① 所有变更走 PR（代码 + IaC + 配置）
  ② CI 质量门控（测试/扫描/覆盖率）
  ③ CD 自动到 Staging → 审批 → 金丝雀生产
  ④ 发布观察期（错误率/延迟/业务指标）
  ⑤ 自动回滚（指标异常）或手动回滚（Git revert）

审计：谁部署了什么版本、什么时间、哪个环境
```

### 7.2 全链路 DevOps 架构

```
代码仓库（Git）→ CI（构建+测试+扫描）→ 镜像仓库（ECR/ACR）
  → GitOps（ArgoCD 拉取部署）→ K8s 集群（EKS/ACK）
  → 可观测（Prometheus/Grafana）→ 反馈（指标驱动回滚）

基础设施：Terraform（IaC）+ 密钥（Secrets Manager）
配置：AppConfig/ACM（动态配置）
```

---

## 八、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 托管 K8s | EKS/AKS/GKE/ACK/TKE | — |
| 无节点 K8s | Fargate/ECI/ACI | — |
| 镜像仓库 | ECR/ACR/GCR | Harbor（自建） |
| CI/CD | GitHub Actions | Azure DevOps/云效 |
| GitOps 部署 | ArgoCD | Flux |
| 多云 IaC | Terraform | Pulumi |
| 单云 IaC | CDK/Bicep/Deployment Manager | — |
| 制品管理 | Artifact Registry/CodeArtifact | Nexus |

### 8.1 决策树

```
代码托管在哪？
  GitHub → GitHub Actions + ArgoCD
  Azure DevOps → Azure DevOps + Flux
  云效/CODING → 对应云流水线
部署方式偏好？
  拉模式（声明式）→ GitOps（ArgoCD）
  推模式（流水线触发）→ CI/CD 直接部署
基础设施定义？
  多云 → Terraform；单云 → 原生 IaC；K8s → Crossplane
```

---

## 九、与其他板块的关系

- K8s 原理见「[云原生/Kubernetes核心](../../云原生/Kubernetes核心.md)」；
- CI/CD 原理见「[基础知识/CI-CD](../../基础知识/CI-CD/README.md)」；
- 云原生总览见「[云原生](../../云原生/README.md)」；
- 云上中间件总览见「[云上中间件体系总览](./云上中间件体系总览.md)」；
- 密钥管理见「[云配置与密钥管理](./云配置与密钥管理.md)」。

> 一句话：**云容器 DevOps = 托管 K8s（控制面免运维）+ CI/CD（流水线即代码 + 质量门控）+ GitOps（声明式拉取交付，Git 即真相源）+ IaC（Terraform/CDK 代码化基础设施）；选型先看「代码托管在哪（GitHub/Azure DevOps/云效）」，再定「部署策略（推式 CI-CD / 拉式 GitOps）」，最后配「镜像供应链安全 + 金丝雀/蓝绿发布 + 自动回滚」**。