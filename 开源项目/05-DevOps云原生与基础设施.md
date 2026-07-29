# 开源项目 · DevOps、云原生与基础设施

> 本篇盘点支撑现代软件交付与运行的底层开源基建，覆盖**容器、编排、IaC、可观测、CI/CD 相关基础设施**五大类。从「代码到容器」到「声明式交付」，再到「运行时可观测」，这些项目构成了云原生时代的钢筋水泥。星数统一为约 Xk / 约 X万，数据截至 2026-07，为近似值会波动。

## 一、主表格（按分类内热度排名）

| 排名(分类内) | 仓库 | 地址 | 约 Star(2026-07) | 主语言 | 该要说明 |
|----|------|------|------|------|------|
| 容器 #1 | moby/moby | [moby/moby](https://github.com/moby/moby) | 约 69k | Go | Docker 引擎开源主干（原 docker/docker），容器化基石。 |
| 编排 #1 | kubernetes/kubernetes | [kubernetes/kubernetes](https://github.com/kubernetes/kubernetes) | 约 114k | Go | 容器编排事实标准，自动调度/伸缩/自愈（呼应云原生/K8S）。 |
| 编排 #2 | helm/helm | [helm/helm](https://github.com/helm/helm) | 约 28k | Go | Kubernetes 包管理器（Chart），部署复用（呼应 CI-CD/11）。 |
| IaC #1 | ansible/ansible | [ansible/ansible](https://github.com/ansible/ansible) | 约 70k | Python/YAML | 极简 IT 自动化/配置管理，无 Agent。 |
| IaC #2 | hashicorp/terraform | [hashicorp/terraform](https://github.com/hashicorp/terraform) | 约 49k | Go | 声明式 IaC 工具，用 HCL 管理云/基础设施（呼应 CI-CD/12）。 |
| IaC #3 | hashicorp/vagrant | [hashicorp/vagrant](https://github.com/hashicorp/vagrant) | 约 27k | Ruby | 轻量虚拟机开发环境管理。 |
| 可观测 #1 | grafana/grafana | [grafana/grafana](https://github.com/grafana/grafana) | 约 76k | TypeScript/Go | 可组合的可观测与数据可视化平台。 |
| 可观测 #2 | prometheus/prometheus | [prometheus/prometheus](https://github.com/prometheus/prometheus) | 约 65k | Go | 监控与时序数据库，云原生可观测核心（呼应时序库）。 |
| 可观测 #3 | envoyproxy/envoy | [envoyproxy/envoy](https://github.com/envoyproxy/envoy) | 约 28k | C++ | 云原生边缘/服务代理，Service Mesh 数据面标配。 |
| 可观测 #4 | cilium/cilium | [cilium/cilium](https://github.com/cilium/cilium) | 约 22k | Go | 基于 eBPF 的云原生网络/安全/可观测。 |
| CI/CD 相关基础设施 #1 | apache/kafka | [apache/kafka](https://github.com/apache/kafka) | 约 29k | Java | 分布式流处理与消息总线，大数据管道骨架（呼应大数据）。 |
| CI/CD 相关基础设施 #2 | gitlabhq/gitlab | [gitlabhq/gitlab](https://github.com/gitlabhq/gitlab) | 约 24k | Ruby | 一体化 DevOps 平台（代码托管+CI，呼应 CI-CD/06）。 |
| CI/CD 相关基础设施 #3 | jenkinsci/jenkins | [jenkinsci/jenkins](https://github.com/jenkinsci/jenkins) | 约 23k | Java | 老牌开源 CI/CD 引擎（呼应 CI-CD/04、05）。 |
| CI/CD 相关基础设施 #4 | argoproj/argo-cd | [argoproj/argo-cd](https://github.com/argoproj/argo-cd) | 约 21k | Go | GitOps 持续部署工具，声明式同步 K8s（呼应 CI-CD/08）。 |
| CI/CD 相关基础设施 #5 | fluxcd/flux2 | [fluxcd/flux2](https://github.com/fluxcd/flux2) | 约 15k | Go | GitOps 工具集（CNCF 毕业），与 Argo CD 并列。 |

> 星数统一为「约 Xk / 约 X万」写法，数据截至 2026-07，为近似统计、会随时间波动，请勿当作精确值引用。

## 二、分类速览与选型建议

- **容器**：想理解 Docker 引擎本身、做镜像构建与单机容器，看 moby/moby；生产环境的多容器协同交给 Kubernetes，而不是直接手搓 docker run。
- **编排**：集群编排只有 Kubernetes 一个事实标准；Helm 则解决「如何把一整套 K8s 资源打包、版本化、复用」的问题，相当于 K8s 的 apt/yum。
- **IaC**：多云资源制备选 Terraform（声明式、plan/apply 安全）；存量服务器内部配置、批量运维选 Ansible（无 Agent、YAML 剧本）；本地虚拟机开发环境选 Vagrant。
- **可观测**：指标监控选 Prometheus + Grafana 组合；服务间流量治理与 Service Mesh 数据面选 Envoy；要更底层的网络/安全/可观测一体化选 Cilium（eBPF）。
- **CI/CD 相关基础设施**：代码托管+流水线一体化选 GitLab；老牌自由流水线选 Jenkins；以 Git 为唯一真相源的持续部署选 Argo CD 或 Flux（GitOps 双雄）；事件/日志管道选 Kafka。

> 选型一句话：编排靠 K8s、IaC 靠 Terraform、监控靠 Prometheus+Grafana、交付靠 GitOps、管道靠 Kafka。

## 三、重点速读

### kubernetes/kubernetes —— 容器编排的事实标准

Kubernetes（约 114k Star）是现代云原生世界的操作系统。它解决的问题是：当你的服务被拆成几十上百个容器后，谁来决定每个容器跑在哪台机器、挂了如何重启、流量怎么分发、配置与密钥如何注入。K8s 用「声明式 API」描述期望状态（比如「我要 3 个副本」），再由控制面不断把实际状态向期望状态收敛，从而实现**自动调度、弹性伸缩、自愈**。

核心特性包括 Pod/Deployment/Service 等原生对象、基于 etcd 的强一致存储、以及可插拔的 CNI（网络）/CSI（存储）/CRI（运行时）接口，这让它能适配任意云厂与裸金属。生态上 Helm（包管理）、Argo CD / Flux（GitOps）、Prometheus（监控）、Cilium（网络）都围绕它生长，CNCF 版图几乎等同于 K8s 周边。它能火，是因为把「大规模容器运维」从手工活变成了标准化工程。详见 [../云原生/K8S.md](../云原生/K8S.md)。

> 口诀：容器多了靠编排，声明期望状态、K8s 自动收敛；调度伸缩自愈，云原生靠它托底。

### prometheus/prometheus —— 云原生可观测的度量心脏

Prometheus（约 65k Star）是云原生监控的事实标准。它采用**拉模型（pull）**周期性抓取暴露了 `/metrics` 接口的目标，把指标存进自带的时序数据库（TSDB）；配合 PromQL 做强大查询，再借 Alertmanager 触发告警。它对 Kubernetes 的服务发现原生友好，Pod 上下线都能自动纳入采集。

它的流行在于「简单且够用」：单一二进制即可运行、数据模型清晰（metric + label）、生态与 Grafana 深度绑定——Prometheus 负责存与算，Grafana 负责画，二者几乎成了可观测面板的默认组合。和本库可观测/时序库板块呼应，Prometheus 是时序数据在运维场景的标杆实现。对于想搞清「系统到底健不健康」的团队，Prometheus + Grafana 是绕不开的入门与终点。

> 口诀：拉模型抓指标，PromQL 算得清；配 Grafana 出图，云原生可观测靠它撑。

### hashicorp/terraform —— 用代码定义一切基础设施

Terraform（约 49k Star）开创了「基础设施即代码（IaC）」的主流范式。你用 HCL（HashiCorp 配置语言）写一份声明式配置文件，描述「要几台云主机、什么网络、什么数据库」，Terraform 便会计算依赖图、生成执行计划，并安全地创建/变更/销毁资源。它的 **provider 机制**对接 AWS、GCP、Azure、Kubernetes 乃至几乎所有主流云与 SaaS，真正做到「一份代码管多云」。

其价值在于把基础设施变更变得**可评审、可回滚、可复用**：环境用代码版本化管理，避免「雪花服务器」；`plan` 先预览差异再 `apply`，降低误操作风险。它和 Ansible 形成互补——Terraform 管「资源存在与否」（ Provisioning），Ansible 管「资源内部配置」（Configuration）。在 CI/CD 链路里，Terraform 常作为环境制备的一步，与 GitOps 工具链天然契合。

> 口诀：基础设施写进代码，plan 预览、apply 落地；多云一套 HCL，环境变更可回溯。

### argoproj/argo-cd 与 fluxcd/flux2 —— GitOps 双雄

Argo CD（约 21k Star）与 Flux（约 15k Star）代表了「以 Git 为唯一真相源」的持续部署范式。它们都监听 Git 仓库中声明的期望状态（如某 K8s 清单的版本），自动把集群实际状态同步到该状态：仓库改一行，集群就跟着变；集群被人手动改坏了，工具会自动纠偏回 Git 里的定义。Argo CD 胜在自带可视化 UI、App-of-Apps 多应用管理、滚动同步策略；Flux 则更轻、更「云原生原教旨」，CNCF 毕业项目，组件可裁剪。

两者之所以成为现代交付的标配，是因为把「部署」从「人敲命令」变成了「声明 + 自动 reconcile」，既消除了环境漂移，又让每一次变更都可审计、可回滚。它们与 Jenkins/GitLab CI 形成互补：CI 负责构建与测试出镜像，GitOps 负责把镜像安全地落到集群。详见与 CI/CD 链路的呼应关系。

> 口诀：Git 是真相源，改仓库集群跟着变；Argo CD 重界面、Flux 重轻量，GitOps 双雄守交付。

### 趋势观察（2026）

- **GitOps 成主流**：Argo CD / Flux 把「声明式持续部署」从理念变成团队默认，手动 kubectl apply 逐渐被淘汰。
- **eBPF 重塑可观测与网络**：Cilium 依托 eBPF 在内核层做网络、安全与可观测，正挑战 kube-proxy 与 sidecar 代理的传统位。
- **IaC 左移**：Terraform / Ansible 进 CI 流水线，环境制备成为 PR 的一部分，和 GitOps 一起构成「一切皆代码」。
- **一体化平台崛起**：GitLab 类的「代码托管+CI+部分 CD」一体化，与零散最佳组件持续拉扯，团队按规模选型。

> 一句话趋势：声明式、GitOps、eBPF、IaC 左移，是 2026 年基础设施最确定的四条主线。

## 四、与其他模块的关联

- **云原生 / Kubernetes**：本篇半数项目围绕 K8s 生态（编排、Helm、可观测、GitOps），核心参见 [../云原生/K8S.md](../云原生/K8S.md)。
- **基础知识 / 大数据**：Kafka 既是 CI/CD 管道的事件总线，也是大数据流处理骨架，逻辑互通，参见 [../基础知识/大数据/README.md](../基础知识/大数据/README.md)。
- **大模型板块**：AI 推理服务（如 vLLM、open-webui）多以容器化 + K8s 方式部署，底层即本篇所述基建，参见 [../大模型/](../大模型/)。
- **知识库总览**：回到 [../README.md](../README.md) 可查看全部板块地图与开源项目系列的其他篇目。

## 五、参考来源

- 各仓库 GitHub 主页 Star 数与简介（数据截至 2026-07，为近似值会波动）。
- Kubernetes、Prometheus、Terraform、Argo CD / Flux 官方文档与 CNCF 技术雷达。
- 本库「云原生 / K8S」与「基础知识 / 大数据」板块的相关论述互为补充。
