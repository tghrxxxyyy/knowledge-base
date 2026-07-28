# CI/CD · 13 可观测性、DORA 度量与 DevSecOps

> "你无法改进你无法度量之物；你无法防御你无法左移之险。" 可观测性让流水线"看得见"，DORA 让效能"可比较"，DevSecOps 让安全"内建而非外挂"。

本篇串起 CI/CD 的"最后一公里与最前一公里"：研发效能度量（DORA 四项 + 2025 新增返工率）、流水线可观测性、制品溯源；以及把安全左移进流水线的 DevSecOps（SAST/DAST/SCA/secret scan/镜像扫描/IaC 扫描）、深入软件供应链（SBOM / SLSA / Sigstore）、平台工程与 AI 辅助 CI/CD 趋势。

## 一、研发效能度量与 DORA 四项关键指标

DORA（DevOps Research and Assessment，Google 团队）用**四个关键指标**衡量软件交付效能，后被写入《Accelerate》并成为业界事实标准：

| 指标 | 英文 | 含义 | 衡量维度 |
|------|------|------|----------|
| 部署频率 | Deployment Frequency (DF) | 向生产交付代码的频率 | 吞吐量(速度) |
| 变更前置时间 | Lead Time for Changes (LT) | 从提交到生产跑通的时间 | 吞吐量(速度) |
| 变更失败率 | Change Failure Rate (CFR) | 导致生产故障/需修复的部署占比 | 稳定性 |
| 服务恢复时间 | MTTR / Failed Deployment Recovery Time | 故障后恢复服务的时长 | 稳定性 |

> 口诀：**"快用 DF+LT，稳用 CFR+MTTR；效能是吞吐量与稳定性的双轴，不是单看谁跑得快。"**

### 1.1 2025 DORA 报告要点（已联网核实）

2025 年报告更名为 **《State of AI-assisted Software Development》**，调研约 **5000** 名技术从业者。核心变化：

- **新增第五指标「返工率 Rework Rate」**：因生产问题而需的非计划修复/热修占比，补上原四项漏掉的"稳定性盲区"。指标重组为：**吞吐量**（DF、LT、恢复时间）与**不稳定度**（CFR、Rework Rate）。
- **AI 已成日常**：**90%** 开发者在工作中使用 AI 工具（同比 +14%），平均每天约 **2 小时**。但报告指出 **"mirror and multiplier（镜子与放大器）"效应**——AI 放大团队既有的好流程与烂流程：流程好则更快，流程烂则更快产出烂代码。
- **分类方式改变**：2025 起不再用 Elite/High/Medium/Low 固定档，改用**百分位分布**；业界常以 Top 15% 近似原"精英档"。
- **新增「AI Capabilities Model」**：七个实践决定 AI 是助力还是阻力（如代码审查、文档、安全左移是否被 AI 增强）。

**2025 精英区间（Top 15% 近似，来源 Multitudes 对 2025 DORA 报告 P20-21 的整理）**：

| 指标 | 精英档（Top 15%）阈值 | 该档占比 |
|------|----------------------|----------|
| 变更前置时间 LT | < 1 天 | 15% |
| 部署频率 DF | 按需（一天多次） | 16.2% |
| 服务恢复时间 MTTR | < 1 小时 | 21.3% |
| 变更失败率 CFR | 0–4% | 16.7% |
| 返工率 Rework Rate | 0–4% | 12.8%（4–8% 占 13.7%） |

> ⚠️ **AI 时代的误读**：DF 上升 ≠ 效能变好。若 DF 与 CFR、Rework Rate **同时**上升，说明"更快地产出更多要返工的东西"。解读 DORA 必须**组合看**，绝不孤立看一个指标。

### 1.2 其他效能指标与"虚荣指标"陷阱

| 指标 | 说明 | 用途 |
|------|------|------|
| Lead Time 分布 | 各 PR 的前置时间分布（中位数 vs 长尾） | 定位评审/测试瓶颈 |
| 变更批量大小 | 单次部署的变更行数/提交数 | 小批量=更易恢复 |
| 流水线时长 | 各阶段耗时之和 | 反馈速度 |
| 队列等待时间 | job 在排队未被调度的时间 | 识别资源瓶颈 |
| 构建成功率/失败率趋势 | 时间维度稳定性 | 质量门禁健康度 |

> ⚠️ **虚荣指标（vanity metrics）**：代码行数、提交数、CI 跑了多少次、覆盖率数字本身——这些不直接关联业务价值。DORA 之所以权威，是因为它只度量"对用户可感知的交付速度与稳定性"，而非"团队有多忙"。

```mermaid
flowchart LR
    title DORA 度量闭环仪表盘
    SRC[(代码/流水线的真实事件)] --> COLL[采集: deploy/incident/PR 事件]
    COLL --> CALC[计算: DF/LT/CFR/MTTR/Rework]
    CALC --> DASH[仪表盘: 趋势+同比+分位]
    DASH --> REVIEW[团队复盘: 找瓶颈]
    REVIEW --> ACTION[改进: 小批量/并行/门禁]
    ACTION --> SRC
    DASH -.告警.-> NOTIFY[Slack/飞书/邮件]
```

## 二、流水线可观测性

流水线本身也是系统，需要被观测。维度：

- **各阶段耗时**：拉代码、构建、测试、扫描、推送、部署各花多久（热点在哪）。
- **缓存命中率**：依赖/镜像层缓存命中率直接决定构建快慢。
- **构建趋势**：时长随代码量增长是否失控、失败率是否恶化。
- **队列**：job 排队等待时间（runner 不足的信号）。
- **失败即时通知**：红绿状态推到 Slack / 钉钉 / 飞书 / 邮件。

> 口诀：**"流水线不是黑盒；每个阶段都该有耗时、有成功率、有告警。"**

**用 Prometheus + Grafana 展现**：CI runner 暴露指标，Grafana 出图；用 **OpenTelemetry** 把一次 CI 跑批的"构建链路"做成 trace（每个 stage 是一个 span），可跨 job 串联分析。

```yaml
# 示例：Prometheus 抓取自建 runner 指标（片段）
scrape_configs:
  - job_name: ci-runners
    metrics_path: /metrics
    static_configs:
      - targets: ['runner-1:9100', 'runner-2:9100']
# Grafana 面板关心：job_duration_seconds、queue_wait_seconds、build_success_total
```

**失败根因即时通知**（GitHub Actions 为例）：

```yaml
# 在流水线末尾加通知步骤
  notify:
    if: failure()
    runs-on: ubuntu-latest
    steps:
      - name: 飞书/Slack 通知
        uses: slackapi/slack-github-action@v1
        with:
          channel-id: '#ci-alerts'
          slack-message: "❌ ${{ github.repository }} 的 ${{ github.workflow }} 在 ${{ github.ref }} 失败：${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
        env:
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
```

## 三、制品溯源与可追溯

每一次部署都必须能回溯到：**git commit → 制品（含 digest）→ 构建号 → 谁、何时、用什么流水线**。这是审计、合规与"出事能止血"的基础。

- 制品用 **内容寻址（digest，如 `sha256:...`）** 而非 mutable tag 引用，避免"同名不同内容"。
- 构建产生 **SBOM**（见第五节）与 **provenance**（构建来源证明）。
- 留存：构建日志、扫描结果、签名记录至少保留一个合规周期（如 1–3 年）。

> 口诀：**"没有 digest 的部署不叫可追溯；没有 SBOM 的制品不叫可审计。"**

## 四、DevSecOps 左移

**左移（Shift Left）**：把安全活动尽量前移到开发早期——提交/PR 阶段就扫，而非上线前才安全评审。

### 4.1 安全工具全景

| 类型 | 全称 | 代表工具 | 扫什么 | 嵌入阶段 |
|------|------|----------|--------|----------|
| SAST | 静态应用安全测试 | SonarQube、CodeQL、Semgrep | 源码漏洞/坏味道 | 提交/PR |
| DAST | 动态应用安全测试 | OWASP ZAP、Burp | 运行态漏洞（注入/XSS） | 部署后/预发 |
| IAST | 交互式应用安全测试 | Contrast | 运行时插桩 | 测试环境 |
| SCA | 软件成分分析 | Dependabot、Snyk、Renovate | 开源依赖漏洞 | 构建/PR |
| Secret Scanning | 密钥扫描 | gitleaks、trufflehog | 泄露的密钥/令牌 | 提交/PR 预提交钩子 |
| 镜像扫描 | 容器漏洞 | Trivy、Grype | 基础镜像/依赖 CVE | 构建后 |
| IaC 扫描 | 基础设施即代码 | Checkov、TFSec | Terraform/K8s 误配置 | PR |
| 许可证合规 | License | FOSSA、ScanCode | 许可证冲突（GPL 传染） | PR |

```mermaid
flowchart TD
    title DevSecOps 在流水线各阶段嵌入
    subgraph 提交/PR
      A1[Secret Scan: gitleaks]
      A2[SAST: Semgrep/CodeQL]
      A3[IaC 扫描: Checkov]
      A4[SCA: Dependabot/Renovate]
    end
    subgraph 构建
      B1[Trivy 镜像扫描]
      B2[SBOM 生成: syft/trivy]
      B3[单元测试+覆盖率]
    end
    subgraph 部署前
      C1[DAST: OWASP ZAP]
      C2[许可证合规检查]
      C3[质量门禁: 不达标阻断]
    end
    subgraph 运行
      D1[运行时防护 + 持续扫描]
      D2[RASP/WAF]
    end
    A1 --> B1
    A2 --> B1
    A3 --> B1
    A4 --> B1
    B1 --> C1
    B2 --> C2
    C1 --> C3
    C2 --> C3
    C3 --> D1
    D1 --> D2
    C3 -.失败.-> BLOCK[[阻断合并/发布]]
```

### 4.2 质量门禁与踩坑

质量门禁（Quality Gate）：在流水线设阈值，超过则**阻断**发布——例如 CRITICAL/HIGH 漏洞未修复、密钥扫描命中、测试覆盖率下降。

> ⚠️ **安全卡点三大反模式**：
> 1. **太严拖慢交付**：把所有 INFO/LOW 都设成阻断，开发者天天和噪声搏斗，最终学会"跳过/忽略"。
> 2. **误报疲劳**：不区分"可达/不可达"，一律告警，信任被耗尽。
> 3. **只扫不修**：扫描报告堆着没人跟，门禁形同虚设。

建议：门禁只对**高危 + 有修复方案 + 可达**的项阻断；其余进技术债看板；定期的忽略项要有**到期日**（如 `.trivyignore` 必须带 `exp:`）。

### 4.3 Trivy 实战（容器与更多）

Trivy（Aqua）是目前事实标准的开源扫描器，覆盖镜像、文件系统、Git 仓库、K8s、IaC、密钥、许可证，还能直接出 SBOM。

```bash
# 构建后立即扫描，发现 HIGH/CRITICAL 则让构建失败
trivy image --severity HIGH,CRITICAL --exit-code 1 --ignore-unfixed myapp:${{ sha }}

# 顺带扫密钥与误配置（不止 CVE）
trivy image --scanners vuln,secret,misconfig myapp:${{ sha }}

# 生成 SBOM（CycloneDX / SPDX 两种格式都行）
trivy image --format cyclonedx --output sbom.cdx.json myapp:${{ sha }}
trivy image --format spdx-json  --output sbom.spdx.json myapp:${{ sha }}

# 定时扫描：今天干净的镜像，两周后可能爆 CVE——所以要做计划任务
# 0 4 * * *  trivy image --severity HIGH,CRITICAL --ignore-unfixed \
#   --format json --output /var/log/trivy/$(date +%F).json registry/app:latest
```

```yaml
# GitHub Actions：Trivy 扫描并上传 SARIF 到 Security 面板
# .github/workflows/scan.yml
name: image-scan
on: [push, pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: docker build -t myapp:${{ github.sha }} .
      - name: Trivy scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: myapp:${{ github.sha }}
          severity: CRITICAL,HIGH
          exit-code: '1'
          ignore-unfixed: true
          format: sarif
          output: trivy.sarif
      - name: Upload SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy.sarif
```

> Grype（Anchore）+ Syft 与 Trivy **互补**：二者漏洞库覆盖略有差异，生产级流水线常两者并行，捕捉对方漏报。

## 五、软件供应链安全（深入）

### 5.1 SBOM（软件物料清单）

SBOM 是"软件由哪些成分组成"的机器可读清单。主流格式：

| 格式 | 维护方 | 特点 |
|------|--------|------|
| **CycloneDX** | OWASP | 轻量、原生支持漏洞(VEX)、供应链数据 |
| **SPDX** | Linux Foundation（3.0 RC 2025） | ISO 标准、许可证表达强 |

SBOM 让"我们是否用了 log4j / 某个有 CVE 的组件"从"翻代码"变成"一条查询"。它在 [03-构建与制品管理](../CI-CD/03-构建与制品管理.md) 已提概念，这里落到生成与消费。

```bash
# 用 syft/trivy 生成 SBOM
syft  myapp:latest -o cyclonedx-json > sbom.cdx.json
trivy image --format cyclonedx --output sbom.cdx.json myapp:latest

# 之后只扫 SBOM，无需再拉镜像（审计/二次扫描更快）
grype sbom:./sbom.cdx.json --fail-on high
trivy sbom sbom.cdx.json
```

### 5.2 SLSA（Supply-chain Levels for Software Artifacts）

OpenSSF 主导的供应链安全分级框架（读作"salsa"）。**v1.1（2025-04）** 聚焦 **Build Track**；**v1.2（2025-11-24 标记 Approved）** 增加了 **Source Track**。它由"轨道（track）× 等级（level）"组成，允许某一方面先达标。

**Build Track（构建轨道）**：

| 等级 | 名称 | 关键要求 | 防什么 |
|------|------|----------|--------|
| L0 | 无保证 | 无要求 | — |
| L1 | Provenance 存在 | 自动生成 provenance（谁/怎么/用什么输入构建） | 人为失误、文档缺失 |
| L2 | 托管构建平台 | L1 + 构建平台**签名** provenance（如 GitHub Actions） | 构建后篡改 |
| L3 | 加固构建平台 | L2 + 隔离/临时环境、签名密钥不可被构建步骤接触 | 构建中篡改（如被投毒的 runner） |

**Source Track（v1.2 新增）**：L1 版本可控、L2 历史不可变且连续、L3 持续技术控制（强制评审/2FA/签名提交/CODEOWNERS）。

> 达成路径：先用 `slsa-github-generator` 在 GitHub Actions 出 L3 provenance（GitHub OIDC + Fulcio 即满足 Build L3）；自托管 Jenkins/GitLab 不加硬化通常只能到 L2。

### 5.3 Sigstore：无密钥签名

传统代码签名要管长期私钥（轮换、HSM、分发公钥），小团队玩不起。Sigstore 用 **OIDC 身份换临时证书**颠覆模型：

- **Fulcio**：短期 CA，凭 OIDC 身份签发**几分钟有效**的 X.509 证书，私钥用完即弃。
- **Rekor**：不可篡改的**透明日志**，记录每次签名（制品 digest + 证书 + 签名）。
- **cosign**：客户端，容器镜像/ blob / SBOM 的签名与验签。

```bash
# 无密钥签名（身份绑定到 workflow OIDC）
COSIGN_EXPERIMENTAL=1 cosign sign registry.example.com/myapp@sha256:abcdef...

# 部署前验签：必须来自指定 workflow 且由 GitHub OIDC 签发
cosign verify \
  --certificate-identity "https://github.com/myorg/myrepo/.github/workflows/ci.yml@refs/heads/main" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  registry.example.com/myapp:latest

# 验签 SBOM 证明（attestation）
cosign verify-attestation --type cyclonedx \
  --certificate-identity "..." --certificate-oidc-issuer "..." \
  registry.example.com/myapp:latest | jq .payload | base64 -d | jq .
```

**in-toto**：定义制品"来源证明"的框架，SLSA provenance 就是其 attestation 的一种。Sigstore Policy Controller / Kyverno 在 K8s 准入时强制校验签名与 digest。

```mermaid
flowchart LR
    title SLSA 供应链信任链
    DEV[开发者/CI 身份 OIDC] -->|登录| FULCIO[Fulcio: 签发短期证书]
    BUILD[CI 构建制品] --> SIGN[cosign 签名]
    FULCIO --> SIGN
    SIGN --> REKOR[Rekor: 透明日志存证]
    SIGN --> REG[OCI 仓库: 镜像+签名+SBOM attestation]
    REKOR --> VERIFY[消费端验签: cosign / Kyverno / Policy Controller]
    REG --> VERIFY
    VERIFY -->|通过| DEPLOY[准入并部署]
    VERIFY -->|失败| DENY[[拒绝部署]]
    PROV[SLSA Provenance(in-toto)] --> REG
```

> ⚠️ **签名无用论的反面**：签名只有"在部署时强制验签"才有价值。若只是签了却没人验，被替换的镜像照样能部署——必须配合 K8s 准入控制（Kyverno / Sigstore Policy Controller）形成闭环。

## 六、平台工程与内部开发者平台（IDP）

平台工程把 CI/CD、环境、密钥、可观测等能力沉淀成**自助式内部平台**，降低研发认知负担。

- 典型载体：**Backstage**（CNCF，统一开发者门户 + 软件目录）、**Port**（可建模的 IDP）。
- 与 CI/CD 的关系：CI/CD 是"引擎"，IDP 是"方向盘和仪表盘"——研发在 IDP 点一下"新建服务/跑流水线/看 DORA 指标"，底层由 CI/CD 与 GitOps 执行。
- 价值：标准化最佳实践（安全门禁、密钥注入、环境模板内置），减少"每个团队重复造轮子 + 各自踩坑"。

> 口诀：**"平台工程不是再加一层审批，而是把正确做法做成默认选项，让研发自助且不易犯错。"**

## 七、AI 辅助 CI/CD（2025–2026 趋势）

AI 正在重塑 CI/CD 的"诊断、选择、生成"三件事：

| 能力 | 说明 | 代表（已核实） |
|------|------|----------------|
| 智能测试选择 | 只跑受本次变更影响的测试，省 60–80% 时间 | Launchable、Buildpulse、Codecov |
| Flaky 测试检测/隔离 | 从历史识别不稳定测试并隔离，避免误拦 | Buildpulse、Harness AIDA |
| 失败根因智能分析 | 解析失败日志、定位根因、给修复建议 | GitHub Copilot（PR 评论）、Datadog Watchdog |
| 自然语言生成流水线 | 用 Markdown/自然语言生成 YAML 工作流 | GitHub Agentic Workflows（2026-02 预览） |
| PR 描述/变更摘要 | 自动生成变更摘要，辅助评审 | Copilot PR 摘要、Autofix |
| 自愈流水线 | Agent 诊断失败→改代码→开 PR | GitHub Copilot SDK（2026-01 发布） |
| 构建时长预测/智能调度 | 预测耗时、错峰调度、弹性扩 runner | AIOps 平台 |

> ⚠️ **AI 的风险**：① 幻觉配置——生成的 YAML 看似合理实则错误/越权；② 凭证泄露——Agent 读日志/上下文时把密钥带进模型或 PR 评论；③ 过度自信——AI 给的"修复"掩盖真实 bug。**AI 出的流水线改动也要走 review + 门禁，不能自动合并。**

```mermaid
flowchart TB
    title AI 辅助 CI/CD 能力地图
    subgraph 诊断
      D1[失败根因分析]
      D2[Flaky 检测与隔离]
      D3[构建时长预测]
    end
    subgraph 选择
      S1[智能测试选择]
      S2[变更影响分析]
    end
    subgraph 生成
      G1[自然语言→流水线 YAML]
      G2[PR 摘要/Autofix]
      G3[自愈: 改代码开 PR]
    end
    subgraph 治理
      GV1[质量门禁必须仍生效]
      GV2[AI 改动走 review]
      GV3[防凭证泄露]
    end
    D1 --> GV1
    D2 --> GV1
    S1 --> GV1
    G1 --> GV2
    G2 --> GV2
    G3 --> GV2
    GV2 --> GV3
```

## 八、趋势展望小结

- **GitOps 主流化**：声明式 + 不可变 + 自动 reconcile 成为生产默认（呼应 [08-云原生CI-CD与GitOps工具](../CI-CD/08-云原生CI-CD与GitOps工具.md)）。
- **云原生流水线**：构建用临时 rootless VM / BuildKit，天然满足 SLSA L3。
- **Serverless CI**：按 job 起停，零闲置成本。
- **AI 原生**：诊断/选择/生成内建到流水线，但门禁与人工 review 不可省。
- **合规内建**：SBOM、SLSA、签名验签成为采购与等保的硬性要求。

## 九、与其他模块的关联

- [01-概述与核心概念](../CI-CD/01-概述与核心概念.md)：CI/CD 全景与流水线基本形态。
- [03-构建与制品管理](../CI-CD/03-构建与制品管理.md)：制品、digest、SBOM 的生成与留存。
- [08-云原生CI-CD与GitOps工具](../CI-CD/08-云原生CI-CD与GitOps工具.md)：GitOps 的声明式、不可变与签名验签闭环。
- [09-流水线设计模式与最佳实践](../CI-CD/09-流水线设计模式与最佳实践.md)：门禁、阶段拆分、失败通知的设计落点。
- [10-部署策略](../CI-CD/10-部署策略.md)：灰度/回滚与 MTTR、可追溯的联动。
- [12-环境配置与密钥管理](../CI-CD/12-环境配置与密钥管理.md)：OIDC 免密钥、Vault、外部密钥是 DevSecOps 的信任底座。
- [大数据·12-数据治理与数据质量](../大数据/12-数据治理与数据质量.md)：分级分类、审计与合规内建思路同样适用于供应链。
- [云原生·K8S](../../云原生/K8S.md)：准入控制（Kyverno/Policy Controller）、etcd 加密与运行时防护。

## 参考

- DORA 官方四指标指南：https://dora.dev/guides/dora-metrics-four-keys/
- 2025 DORA 报告（State of AI-assisted Software Development）解读（Plandek）：https://plandek.com/blog/dora-metrics-in-the-age-of-ai-how-engineering-leaders-should-measure-delivery-in-2025
- 2025 DORA 基准（Multitudes，精英区间分布）：https://www.multitudes.com/blog/dora-metrics
- SLSA v1.2 规范（Build + Source Track）：https://slsa.dev/spec/v1.2/
- SLSA v1.1 单页版：https://slsa.dev/spec/v1.1-rc1/onepage
- Sigstore 官方（cosign / Fulcio / Rekor）：https://www.sigstore.dev/
- in-toto 来源证明框架：https://in-toto.io/
- Trivy（Aqua）官方文档：https://trivy.dev/
- Grype + Syft（Anchore）：https://github.com/anchore/grype 、https://github.com/anchore/syft
- OWASP ZAP / Semgrep / gitleaks / Checkov 官方文档
- GitHub Agentic Workflows（2026-02 预览，Markdown 写流水线）：https://github.blog/
- GitHub Copilot SDK（2026-01）：https://github.com/features/copilot
- 2026 AI DevOps/CI-CD 工具综述（Launchable/Buildpulse/Harness AIDA/Datadog Watchdog）：https://superdots.sh/blog/ai-devops-tools/
- SPDX 3.0 / CycloneDX 1.6 SBOM 规范：https://spdx.dev/ 、https://cyclonedx.org/
