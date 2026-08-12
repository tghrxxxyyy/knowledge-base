# 云容器编排与 DevOps 体系（托管 K8s / CI-CD / GitOps）

> 云上容器编排把 K8s 控制面托管、CI/CD 流水线 SaaS 化、部署策略 GitOps 化——开发者只写业务代码与应用描述，平台负责构建/部署/回滚。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

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

## 七、选型速查

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

---

## 八、与其他板块的关系

- K8s 原理见「[云原生/Kubernetes核心](../../云原生/Kubernetes核心.md)」；
- CI/CD 原理见「[基础知识/CI-CD](../../基础知识/CI-CD/README.md)」；
- 云原生总览见「[云原生](../../云原生/README.md)」；
- 云上中间件总览见「[云上中间件体系总览](./云上中间件体系总览.md)」。

> 一句话：**云容器 DevOps = 托管 K8s（控制面免运维）+ CI/CD（流水线即代码）+ GitOps（声明式持续交付）+ IaC（基础设施即代码）；选型先看「代码托管在哪（GitHub/Azure DevOps/云效）」，再定「部署策略（推式 CI-CD / 拉式 GitOps）」。**
