# CI/CD · 04 Jenkins 架构与核心机制

> 口诀：Jenkins 不是"一个 CI 工具"，而是一套"插件驱动的自动化操作系统"——Controller 管调度与状态，Agent 管干活，二者靠 Remoting 协议对话，所有能力都来自插件。

本篇讲 Jenkins 的演进定位、Controller/Agent 分布式架构、Master-Agent 通信原理、插件生态、权限与安全、高可用与运维（含 JCasC），以及与 GitLab CI / GitHub Actions / Tekton 的对比。Pipeline 语法见 [05-Jenkins Pipeline as Code](05-Jenkins-Pipeline-as-Code.md)；CI/CD 全局视野见 [01-概述与核心概念](01-概述与核心概念.md)；构建与制品见 [03-构建与制品管理](03-构建与制品管理.md)。

## 一、Jenkins 定位与历史

- **起源**：Jenkins 的前身是 **Hudson**，由 Kohsuke Kawaguchi 在 Sun 公司 2004 年前后开始开发；2011 年因 Oracle 与社区分歧，Hudson 社区 fork 为 **Jenkins**（"Jenkins" 是但丁《神曲》中地狱守门人，象征守护 CI 流水线）。
- **事实标准**：十余年间 Jenkins 成为全球使用最广的开源 CI/CD 服务器，凭借"装个插件就能接任何东西"的极致可扩展性长居榜首。
- **插件生态规模**：官方 Update Center 收录 **1800+ 插件**（截至 2025-2026），覆盖 SCM、构建、部署、通知、云、安全等几乎一切领域。
- **2026 现状**：LTS 线已进入 **2.555.x**（2026 年中），运行要求 **Java 21 或 Java 25**（自 2.555.1 起彻底弃用 Java 17）；Windows MSI 安装包自 2026 年起由 **LF Open Source, LLC（Linux Foundation）** 通过微软制品签名服务重新签名。

> 口诀：Hudson 生 Jenkins，插件养 Jenkins，云原生正在分流 Jenkins——它仍是"最可定制"的 CI，却不再是"最省心"的 CI。

## 二、整体架构：Controller 与 Agent

### 2.1 角色划分

| 角色 | 曾用名 | 职责 | 是否可水平扩展 |
|------|--------|------|----------------|
| Controller（控制器） | Master | 调度任务、维护 UI/REST、存储配置与构建记录、分配 Agent、插件运行 | 否（单点，HA 靠主备） |
| Agent（代理） | Slave（已弃用词） | 真正执行构建步骤（编译、测试、打包）的 worker 进程 | 是（可成百上千） |

> 口诀：**Controller 动脑，Agent 动手**。把计算压力推到 Agent，Controller 只做"指挥 + 记账"。

### 2.2 Master-Agent 架构图

```mermaid
flowchart TB
    Dev[开发者 push] -->|webhook / SCM poll| C[Controller 控制器]
    subgraph Controller
        UI[Web UI / REST API]
        Q[构建队列 Build Queue]
        SCH[调度器 Scheduler]
        JC[JENKINS_HOME 配置与历史]
        PM[插件管理器 Plugin Manager]
    end
    C -->|分配任务| Q
    Q --> SCH
    SCH -->|按 label 匹配| A1[Agent: linux-x86_64]
    SCH -->|按 label 匹配| A2[Agent: docker-build]
    SCH -->|动态起 Pod| A3[Agent: k8s-pod 用完即焚]
    A1 -->|Remoting 协议回报| C
    A2 -->|Remoting 协议回报| C
    A3 -->|Remoting 协议回报| C
```

- **构建队列（Build Queue）**：任务先入队，由调度器根据 label、可用性、executor 余量挑 Agent。
- **executor**：每个 Agent 上的"执行槽"，数量决定该节点并发构建数（如 4 核机器常配 2~4 个 executor）。

### 2.3 Agent 类型

| Agent 类型 | 连接方式 | 典型场景 | 优缺点 |
|------------|----------|----------|--------|
| 固定节点（SSH） | Controller 通过 SSH 主动连 Agent 启动 agent.jar | 长期存在的物理机/VM | 简单稳定；闲置浪费资源 |
| Docker 容器 Agent | Controller 连 Docker daemon 起容器 | 需要隔离构建环境 | 环境干净；需守护进程权限 |
| **Kubernetes 动态 Pod** | Kubernetes Cloud 按需起 Pod，构建完删除 | 弹性伸缩、多租户 | 极致弹性、按量付费；复杂度高（见 [05-Jenkins Pipeline as Code](05-Jenkins-Pipeline-as-Code.md) 的 kubernetes agent） |

## 三、分布式构建原理：任务如何分发

### 3.1 标签（label）与并发

- 每个 Agent 打若干 **label**（如 `linux`、`docker`、`gpu`、`maven`），Pipeline 用 `agent { label 'docker' }` 或 `node('docker')` 指定去哪跑。
- 调度器把"任务要求的 label 表达式"与"在线 Agent 的 label 集合"做匹配，再选 **executor 空闲** 的节点。
- **executor 并发**：一个 Agent 配 N 个 executor，就能同时跑 N 个构建；但 N 过大易把 CPU/IO 打满，需按机器规格权衡。

### 3.2 任务分发与执行时序图

```mermaid
sequenceDiagram
    participant U as 开发者/Webhook
    participant C as Controller
    participant Q as 构建队列
    participant A as Agent(带 label)
    participant R as Remoting 通道
    U->>C: 触发构建(代码 push / 定时)
    C->>Q: 任务入队
    C->>C: 调度器按 label+executor 选节点
    C->>R: 通过 Remoting 下发构建指令
    R->>A: 启动构建(拉代码/执行 steps)
    A->>A: 在 workspace 跑编译/测试
    A-->>R: 流式回传日志与结果
    R-->>C: 回报状态(SUCCESS/FAIL)
    C->>C: 写构建记录到 JENKINS_HOME
    C-->>U: 通知(邮件/IM/状态)
```

> 口诀：**label 决定"去哪跑"，executor 决定"能跑几个"，队列决定"什么时候跑"**。

## 四、Master-Agent 通信机制

### 4.1 协议栈：Remoting + JNLP

- **Remoting 协议**：Jenkins 自研的 Java 远程调用层（基于 TCP/HTTP），在 Controller 与 Agent 之间传输"命令 + 文件 + 类加载请求"。Agent 端运行 `agent.jar`（旧称 `slave.jar`，即 remoting 客户端）。
- **JNLP（Java Network Launch Protocol）**：Agent 通过 JNLP 从 Controller 下载 `agent.jar` 并启动；本质是 Agent **主动出站** 连接 Controller。
- **连接方向（关键安全点）**：现代 Jenkins 推荐 **Agent → Controller 出站连接**（Agent 连 Controller 的 50000 端口或 WebSocket），而非 Controller 主动 SSH 进 Agent。这样 Agent 在防火墙内、Controller 在 DMZ 也能通。

### 4.2 两种连接模式

| 模式 | 方向 | 端口 | 适用 |
|------|------|------|------|
| SSH 启动 Agent | Controller → Agent | 22 | 固定 VM，需 Controller 有 SSH 凭据 |
| JNLP / WebSocket 出站 | Agent → Controller | 50000 或 8080(WS) | K8s、云、跨网络，防火墙友好 ⭐ |

```mermaid
flowchart LR
    subgraph DMZ[DMZ]
        C[Controller:8080/50000]
    end
    subgraph Internal[内网]
        A1[Agent JNLP 出站]
        A2[Agent WebSocket 出站]
        A3[Agent SSH 被连]
    end
    A1 -->|出站 TCP 50000| C
    A2 -->|出站 WebSocket 8080| C
    C -.->|入站 SSH 22| A3
```

> ⚠️ **反模式**：在公网把 Controller 的 50000 端口直接暴露且无认证。应仅允许受信 Agent 通过凭据（JNLP secret / 密钥）连接，并优先用 WebSocket 走 8080（可上 TLS 反向代理）。

### 4.3 agent 怎么"听话"

- Controller 把"要执行的方法调用"序列化后经 Remoting 通道发给 Agent；Agent 端的 remoting 引擎反序列化并调用本地 JVM 中的对象（如 `FilePath`、`Launcher`）。
- **类转发（classloader transport）**：Agent 通常无构建逻辑代码，Controller 会按需把所需的 class 推过去，这带来"在 Agent 上跑 Groovy 闭包"的能力，也是 Scripted Pipeline 危险的来源之一。

## 五、插件生态

### 5.1 Update Center 与插件生命周期

- **Update Center**：Jenkins 启动时从 `updates.jenkins.io` 拉取插件元数据清单；安装/升级都在 **Manage Jenkins → Plugins** 完成。
- 插件以 `.hpi` 包分发，内含 `WEB-INF/lib/*.jar` 与 `plugin.jelly` 等；装完通常需重启（或温和重启）生效。
- 容器化部署常用 `plugins.txt` + `jenkins-plugin-cli` 在镜像构建期预装，保证环境可复现（与 JCasC 配合见第八节）。

### 5.2 插件安全与供应链风险（2025 重灾区）

2025 年是 Jenkins 插件安全"多事之秋"，官方安全公告（Security Advisory）密集披露：

| 时间 | 代表漏洞 | 影响 | 修复 |
|------|----------|------|------|
| 2025-04-02 | CVE-2025-31722 Templating Engine RCE（CVSS 8.8） | 有 Item/Configure 权限者绕过 Groovy 沙箱，在 Controller JVM 执行任意代码 | 插件 ≥2.5.4 |
| 2025-04-02 | CVE-2025-31720/31721 Core 权限绕过 | 低权限者读取 Agent 配置 / 解密存储的密钥 | LTS ≥2.492.3 |
| 2025-05 | CVE-2025-47889 WSO2 OAuth 认证绕过 | 任意用户名+密码直接登入 Controller（CWE-287） | 禁用该插件直至修复 |
| 2025-09 | CVE-2025-58460 OpenTelemetry 缺权限校验 | Overall/Read 即可用指定凭据连外部 URL 窃取凭据 | 插件 ≥3.1543.1545 |
| 2025-10 | CVE-2025-64131 SAML 重放绕过（CVSS 7.5） | 截获 SAML 流重放冒充用户 | SAML ≥4.583.585 |
| 2025-10 | 多插件明文存密 | 多个插件把 token/API key 明文写进 config.xml | 部分未修，需补偿控制 |

> ⚠️ **供应链风险**：插件生态是 Jenkins 最强的"能力来源"，也是最大的"攻击面"。2025 年多起事件证明——**一个低权限插件漏洞即可让整个 CI 沦为 RCE 与凭据泄露的跳板**，而 Jenkins Controller 往往持有 Git、Docker Registry、K8s 的长期使用密钥，一旦失守即供应链污染。
>
> ⚠️ **生产动作**：① 只装必要插件，定期清理未用插件；② 开启自动安全更新 / 订阅 `jenkins.io/security`；③ 装插件前查其维护活跃度与 CVE；④ 用 **Script Security** 限制 Groovy；⑤ 凭据用 Credentials Binding，绝不落明文。

## 六、权限与安全

### 6.1 安全域（Security Realm）与授权策略

- **安全域（Authentication / ACL 基础）**：决定"你是谁"。可选 Jenkins 内置用户库、LDAP、GitHub/OAuth、SAML 等。
- **授权策略（Authorization）**：决定"你能干嘛"。常用：
  - **Matrix Authorization Strategy**：逐权限 × 逐用户/组勾选，细但繁琐。
  - **Role-based Authorization Strategy**（推荐）：把权限封装成"角色"（如 `dev`、`admin`、`reader`），再绑到用户/组，运维友好。
- **最小权限原则**：开发者通常只需 `Job/Build`、`Job/Read`，绝不给 `Overall/Administer` 或 `Agent/Configure`。

### 6.2 凭据管理（Credentials）

- **Credentials Binding** 插件 + `withCredentials` 步骤：把密钥注入为环境变量/文件，用完即销，**不写进日志**（Jenkins 会对凭据值做 masking）。
- 凭据在 `JENKINS_HOME` 中**加密存储**（基于 Controller 的 master key + 配置历史加密）；但 ⚠️ 2025 年多起漏洞显示**部分插件会明文把密钥写进 config.xml**，必须用 `Item/Extended Read` 收窄、并审计 config.xml。

### 6.3 其他安全机制

| 机制 | 作用 | 配置点 |
|------|------|--------|
| CSRF 防护（Crumb） | 防跨站请求伪造，敏感操作需带 crumb | 全局安全配置；2026 起不再把客户端 IP 纳入 crumb 计算 |
| agent-to-controller 安全子系统 | 限制 Agent 反向控制 Controller（如读取 Controller 文件） | `jenkins.security.slaves.agentToMasterAccessControl` |
| 禁用危险 CLI | 关闭 `CLI`/`Remoting 旧接口` 等高危面 | 全局安全 |
| API Token 过期 | 2026 起支持带过期时间的 API Token | 用户配置 |
| CSP（Content Security Policy） | 限制页面注入内容，防 XSS | 系统属性 `jenkins.security.csp` |

> ⚠️ **反模式**：为了"省事"给所有用户开 `Overall/Administer`，或用 `disabled-security` 启动 Jenkins。一旦暴露公网即被接管。
>
> ⚠️ **反模式**：在 Pipeline 里 `sh "curl -u $USER:$PASS ..."` 直接硬编码密码——密码会进日志、进备份、进泄露。一律用 `withCredentials`。

## 七、高可用与运维

### 7.1 单 Master 瓶颈

- Controller 是**单点**：所有调度、UI、插件都在一个 JVM。Agent 几百、任务几千时，Controller CPU/内存/磁盘 IO 成为瓶颈。
- 构建历史、制品、日志全堆在 `JENKINS_HOME`，长期不治理磁盘会爆。

### 7.2 JENKINS_HOME 目录结构

```mermaid
flowchart TB
    JH[JENKINS_HOME] --> CFG[config.xml 全局配置]
    JH --> JC[jobs/ 每个任务一目录]
    JH --> US[users/ 用户与 API token]
    JH --> CR[credentials.xml / credentials/ 加密凭据]
    JH --> PL[plugins/ 已装插件]
    JH --> UPD[updates/ 插件元数据]
    JH --> WS[workspace/ Agent 工作区(可外置)]
    JH --> ART[artifacts/ 归档制品]
    JH --> LOG[logs/ 运行日志]
    JH --> NODE[nodes/ Agent 节点配置]
    JH --> SEC[secrets/ master.key 等加密密钥]
```

> 口诀：**JENKINS_HOME 就是 Jenkins 的"灵魂"——备份它就备份了整个 Jenkins（除运行中的内存状态）。**

### 7.3 高可用与备份

- **主备（Active/Standby）**：用共享存储（NFS/对象存储）挂 `JENKINS_HOME`，一台挂了切另一台；或借助 Kubernetes 单副本 + PVC（非真正多活，Controller 仍单写）。
- **定期备份**：`thinBackup` 插件每日备份 `JENKINS_HOME` 关键文件；或定时 `tar` 关键子目录。⚠️ 备份要**加密**且**异地**，因为里面全是凭据。
- **磁盘与历史治理**：用 **Build Discarder**（保留 N 次/天数）、把大型制品推到 [03-构建与制品管理](03-构建与制品管理.md) 的制品库而非 Jenkins 本地、workspace 定期清理。

### 7.4 Jenkins Configuration as Code（JCasC）

- **JCasC（configuration-as-code 插件）**：用一份 `jenkins.yaml` **声明式地定义** Jenkins 全部配置（安全域、授权、凭据、云、Agent、插件），告别点鼠标。
- 典型 `jenkins.yaml` 片段：

```yaml
jenkins:
  systemMessage: "Jenkins managed by JCasC"
  securityRealm:
    ldap:
      server: "ldap://ldap.corp.com"
      rootDN: "dc=corp,dc=com"
  authorizationStrategy:
    roleBased:
      roles:
        global:
          - name: "admin"
            permissions:
              - "Overall/Administer"
            entries:
              - "alice"
          - name: "dev"
            permissions:
              - "Job/Build"
              - "Job/Read"
            entries:
              - "developers"
unclassified:
  location:
    url: "https://jenkins.corp.com/"
```

- 配合 `plugins.txt` 预装插件：

```text
# plugins.txt
kubernetes:latest
workflow-aggregator:latest
git:latest
credentials-binding:latest
configuration-as-code:latest
role-strategy:latest
```

> ⚠️ **JCasC 陷阱**：① `jenkins.yaml` 里**不要明文写密码**，用 `${SECRET}` 环境变量或 External Credentials；② 凭据块需配合 `credentials` 绑定；③ 配置漂移：谁手动改了 UI，JCasC 下次应用会覆盖，需纪律约束"一切配置走代码"。

## 八、常见痛点与局限

| 痛点 | 说明 | 应对 |
|------|------|------|
| Groovy 脚本风险 | Scripted Pipeline / 共享库可跑任意 JVM 代码，沙箱外即 RCE | 用 Declarative + Script Security 审批 |
| 升级痛苦 | 插件间依赖耦合，大版本升级常"装完起不来" | 先小版本、先在影子环境验证、JCasC 复现 |
| 单 Master 瓶颈 | 规模大时 Controller 成为天花板 | 拆分控制器、上 K8s 动态 Agent、限制历史 |
| 云原生分流 | GitLab CI、GitHub Actions、Tekton 更"原生" | 新项目可评估；存量 Jenkins 逐步云原生化 |

> 口诀：**Jenkins 的强项是"什么都能接"，弱项也是"什么都要你接"——它的灵活是用运维复杂度换来的。**

### 8.1 与云原生 CI 的对比

| 维度 | Jenkins | GitLab CI | GitHub Actions | Tekton |
|------|---------|-----------|----------------|--------|
| 部署 | 自托管为主 | 随 GitLab | SaaS/自托管 | K8s 原生 |
| 配置 | UI/JCasC | `.gitlab-ci.yml` | `.yml` workflow | `Task`/`Pipeline` CRD |
| 弹性 | K8s 插件动态 Pod | Runner 自动扩 | 托管 Runner | 原生 K8s |
| 学习曲线 | 陡（插件多） | 中 | 低 | 中高 |
| 现状 | 存量霸主 | 增长快 | 开源项目首选 | K8s 原生新宠 |

## 九、设计 Checklist

- [ ] Agent 用 label 分组，按构建类型（maven/docker/gpu）匹配节点。
- [ ] 优先 Agent→Controller 出站连接（JNLP/WebSocket），不裸暴露 50000。
- [ ] 权限走 Role-based，最小权限；凭据只经 `withCredentials`。
- [ ] 开启 CSRF、agent-to-controller 安全子系统，关闭危险 CLI。
- [ ] 定期打安全补丁，精简插件，订阅 `jenkins.io/security`。
- [ ] `JENKINS_HOME` 加密异地备份 + Build Discarder 治理磁盘。
- [ ] 配置全用 JCasC `jenkins.yaml` + `plugins.txt`，杜绝手动漂移。
- [ ] 大规模场景上 Kubernetes 动态 Agent（见 [05-Jenkins Pipeline as Code](05-Jenkins-Pipeline-as-Code.md)）。

## 与其他模块的关联

- [01-概述与核心概念](01-概述与核心概念.md)：CI/CD 总览、流水线 stages 定义，本文架构是其运行时底座。
- [03-构建与制品管理](03-构建与制品管理.md)：Jenkins 构建出的制品应归档到制品库，而非堆在 `JENKINS_HOME`。
- [05-Jenkins Pipeline as Code](05-Jenkins-Pipeline-as-Code.md)：本文讲的 Agent/标签/Remoting 正是 Pipeline `agent{}` 与 K8s 动态 Pod 的底层机制。
- [../大数据/10-资源调度：YARN与Kubernetes](../大数据/10-资源调度：YARN与Kubernetes.md)：Kubernetes 动态 Agent 依赖 K8s 调度，原理互通。
- [../../云原生/K8S.md](../../云原生/K8S.md)：Jenkins 在 K8s 上以 Pod 形式起 Agent，需理解 Pod/ServiceAccount/RBAC。

> 参考：
> - Jenkins 官方文档与 LTS Changelog：https://www.jenkins.io/doc/ 、https://www.jenkins.io/changelog-stable/
> - Jenkins 安全公告（2025）：https://www.jenkins.io/security/advisories/
> - CVE-2025-31722 Templating Engine RCE：https://cyberpress.org/jenkins-plugin-vulnerabilities
> - CVE-2025-47889 WSO2 OAuth 认证绕过：https://www.sentinelone.com/vulnerability-database/cve-2025-47889/
> - CVE-2025-64131 SAML 重放绕过：https://cybersecuritynews.com/multiple-jenkins-vulnerability/
> - Jenkins Configuration as Code 插件：https://plugins.jenkins.io/configuration-as-code/
> - Kubernetes 插件：https://plugins.jenkins.io/kubernetes
> - Blue Ocean 状态（2026-07 弃用）：https://www.jenkins.io/projects/blueocean/about/

## 十、高可用 Jenkins：Controller / Agents / K8s 动态 Agent

单 Controller 是瓶颈与单点。生产用"小 Controller + 弹性 Agent"：

```mermaid
flowchart TB
    User[研发] -->|Webhook| C[Controller 主节点]
    C -->|调度| Q[(Build Queue)]
    Q --> A1[Agent VM]
    Q --> A2[Agent Docker]
    Q --> K8[Kubernetes 动态 Pod Agent]
    K8 -->|起 Pod 用完即焚| Node[K8s Node]
    C -->|配置即代码| JCasC[jenkins.yaml]
```

- **Controller 轻量化**：只管调度与 UI，不跑重构建；磁盘定期 `Build Discarder` 清理。
- **Agent 反亲和**：构建型（maven）/ 镜像型（docker）/ GPU 型按 label 分组，避免互相争抢。
- **K8s 动态 Agent**：高峰自动扩 Pod，闲时缩为 0，详见 [05-Jenkins Pipeline as Code](05-Jenkins-Pipeline-as-Code.md) 第六节。
- **JCasC 备份**：`JENKINS_HOME` 加密异地备份 + 配置进 Git，故障分钟级重建。

```bash
# 导出当前配置为 JCasC yaml（配合 configuration-as-code 插件）
java -jar jenkins-cli.jar -s $JENKINS_URL \
  export-configuration-as-yaml > jenkins.yaml
```

## 十一、Shared Library 实战

把通用逻辑（构建/部署/通知）抽到共享库，Jenkinsfile 只留编排骨架：

```
# 仓库结构：corp-lib.git
vars/
  buildAndTest.groovy      # 全局函数
  deployK8s.groovy
  notifyFeishu.groovy
src/com/corp/Utils.groovy  # 普通类
```

```groovy
// vars/buildAndTest.groovy
def call(String lang = 'maven') {
    if (lang == 'maven') {
        sh './mvnw -B clean verify'
    } else {
        sh 'npm ci && npm test'
    }
}
```

```groovy
// Jenkinsfile 调用（锁版本 @v2.3.0）
@Library('corp-lib@v2.3.0') _
pipeline {
    agent { label 'maven' }
    stages {
        stage('Build') { steps { buildAndTest() } }      // 来自共享库
        stage('Deploy') { steps { deployK8s('prod') } }
    }
    post { failure { notifyFeishu('❌ 失败') } }
}
```

> 共享库必须用 **SemVer tag 固定版本**；核心函数写 PipelineUnit 单测，避免"库一改全司流水线崩"。

## 十二、性能瓶颈排查

| 症状 | 可能根因 | 排查/治理 |
|------|----------|-----------|
| 队列长时间 pending | Agent 不足 / label 不匹配 | 看节点列表、加动态 Agent |
| 构建越跑越慢 | 工作区/磁盘堆积 | `cleanWs()` + Build Discarder |
| Controller CPU 飙高 | 过多任务 / 插件滥用 | 减插件、Agent 分担构建 |
| 内存 OOM | 大产物 archive、heap 小 | 调 `-Xmx`、制品转存制品库 |
| Webhook 不触发 | 钩子过期/网络 | 查 `/log`、重注册钩子 |

```bash
# 看 Jenkins 进程与 GC（诊断 OOM）
jstat -gcutil $(pgrep -f jenkins.war) 1s
# 线程栈（卡死时）
jstack $(pgrep -f jenkins.war) > /tmp/jstack.txt
```

## 十三、Jenkins Credentials 深度管理

### 13.1 凭据类型与存储

| 凭据类型 | 用途 | 存储位置 |
|----------|------|----------|
| Username with Password | Git/Registry 登录 | `credentials.xml` 加密 |
| SSH Username with private key | Agent SSH 连接 | `credentials.xml` + `secrets/` |
| Secret text | Token/API Key（环境变量） | `credentials.xml` 加密 |
| Secret file | Kubeconfig / 证书 | `credentials.xml` + 文件加密 |
| Certificate | TLS 客户端证书 | `credentials.xml` + PKCS12 |

```groovy
// 凭据使用（Pipeline 中）
withCredentials([
  usernamePassword(
    credentialsId: 'git-cred',
    usernameVariable: 'GIT_USER',
    passwordVariable: 'GIT_PASS'
  ),
  string(
    credentialsId: 'slack-token',
    variable: 'SLACK_TOKEN'
  )
]) {
  sh 'git clone https://$GIT_USER:$GIT_PASS@github.com/corp/repo.git'
  sh "curl -X POST -H 'Authorization: Bearer $SLACK_TOKEN' ..."
}
```

### 13.2 凭据安全红线

| 风险 | 说明 | 对策 |
|------|------|------|
| 明文日志 | 密码被 echo 打进日志 | `withCredentials` 自动 mask |
| Pipeline 硬编码 | `sh "curl -u admin:pass123"` | 绝对禁止，用凭据注入 |
| 插件泄露 | 部分插件明文写 config.xml | 审计 config.xml、订阅安全公告 |
| 备份泄露 | `JENKINS_HOME` 包含加密凭据 | 备份加密 + 异地存储 |

> ⚠️ **红线**：`withCredentials` 是唯一合法的凭据使用方式；任何硬编码密钥的 Pipeline 都是安全漏洞。

## 十四、Jenkinsfile 并行阶段实战

### 14.1 并行 Stage 与矩阵

```groovy
pipeline {
    agent any
    stages {
        stage('Build Matrix') {
            parallel {
                stage('Linux Build') {
                    steps {
                        sh 'make linux'
                    }
                }
                stage('macOS Build') {
                    agent { label 'mac' }
                    steps {
                        sh 'make macos'
                    }
                }
                stage('Windows Build') {
                    agent { label 'windows' }
                    steps {
                        bat 'make windows'
                    }
                }
            }
        }
        stage('Deploy') {
            steps {
                input message: '确认部署？'
            }
        }
    }
}
```

### 14.2 Stages 内嵌并行（嵌套）

```groovy
stage('Test') {
    parallel {
        stage('Unit Tests') {
            steps { sh 'mvn test' }
        }
        stage('Integration Tests') {
            steps { sh 'mvn verify -Pit' }
        }
        stage('Security Scan') {
            steps { sh 'trivy fs .' }
        }
    }
}
```

### 14.3 容错控制

| 参数 | 作用 | 默认 |
|------|------|------|
| `failFast: true` | 任一并行阶段失败则取消其他 | false |
| `failFast: false` | 所有阶段跑完再汇总结果 | true |

```groovy
stage('Parallel Tests') {
    failFast true   // 一个红即全部停
    parallel {
        stage('Unit') { steps { sh 'mvn test' } }
        stage('Lint') { steps { sh 'eslint src/' } }
    }
}
```

## 十五、Jenkins vs GitHub Actions vs GitLab CI 深度对比

| 维度 | Jenkins | GitHub Actions | GitLab CI |
|------|---------|----------------|-----------|
| **部署模式** | 自托管（Controller+Agent） | SaaS + 自托管 Runner | SaaS + 自托管 Runner |
| **配置方式** | Jenkinsfile（Groovy DSL）+ UI | `.github/workflows/*.yml` | `.gitlab-ci.yml` |
| **插件生态** | 1800+ 插件（最丰富） | Marketplace（中等） | 内置功能（GitLab SAST/DAST等） |
| **弹性伸缩** | K8s Cloud 插件动态 Pod | 托管 Runner 自动扩缩 | GitLab Runner 自动扩缩 |
| **学习曲线** | 陡（Groovy + 插件配置） | 低（YAML + Actions 市场） | 中（YAML + 内置能力） |
| **安全集成** | 插件（SonarQube/Trivy） | 内置 CodeQL/Dependabot | 内置 SAST/DAST/Secret Detection |
| **矩阵构建** | 需 Shared Library | `strategy.matrix` 原生 | `parallel:matrix` 原生 |
| **制品管理** | 插件（Nexus/Artifactory） | GitHub Packages | GitLab Package Registry |
| **成本** | 运维成本高（自托管） | 免费层 + 付费 Runner | 免费层 + 付费 Runner |

```mermaid
flowchart TD
    A[CI/CD 工具选型] --> B{团队技术栈?}
    B -->|GitHub 为主| C[GitHub Actions]
    B -->|GitLab 为主| D[GitLab CI]
    B -->|自托管/混合| E{复杂度需求?}
    E -->|极致灵活| F[Jenkins]
    E -->|云原生简洁| G[Tekton]
```

> **选型口诀**：GitHub 项目用 Actions，GitLab 项目用 GitLab CI，已有 Jenkins 存量的逐步迁移，纯 K8s 原生可评估 Tekton。

## 十六、Jenkins 性能调优

### 16.1 JVM 调优

```bash
# jenkins.xml 或环境变量
JAVA_OPTS="-Xms2g -Xmx4g -XX:+UseG1GC -XX:+ParallelRefProcEnabled"
```

| 参数 | 建议 | 说明 |
|------|------|------|
| `-Xmx` | 4~8GB | Controller 堆内存上限 |
| G1GC | 推荐 | 低延迟垃圾回收器 |
| `-XX:+UseContainerSupport` | 容器必开 | 感知 cgroup 内存限制 |

### 16.2 构建历史与磁盘

```groovy
// 按构建保留策略
pipeline {
    options {
        buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '5'))
    }
}
```

| 治理手段 | 作用 |
|----------|------|
| `buildDiscarder` | 保留最近 N 次构建 |
| `cleanWs()` | 构建后清理 workspace |
| 制品外置 | 大制品推 Nexus/Harbor，不存 Jenkins 本地 |
| `JENKINS_HOME` 瘦身 | 定期清理 `builds/`、`workspace/` |

### 16.3 Agent 调度优化

| 优化 | 做法 |
|------|------|
| Label 精细 | 按构建类型（maven/docker/gpu）打 label |
| Executor 合理 | CPU 密集型 = 核数/2，IO 密集型 = 核数 |
| K8s 动态 Agent | 高峰自动扩 Pod，闲时缩为 0 |
| 反亲和 | 构建型与测试型 Agent 分离 |

## 十七、Jenkins 备份策略

### 17.1 备份范围

```mermaid
flowchart TB
    JH[JENKINS_HOME] -->|必须备份| CFG[config.xml]
    JH -->|必须备份| CR[credentials.xml]
    JH -->|必须备份| SEC[secrets/]
    JH -->|必须备份| JOBS[jobs/*/config.xml]
    JH -->|必须备份| PL[plugins/]
    JH -->|可选| BLD[builds/ 历史记录]
    JH -->|不用备份| WS[workspace/]
```

### 17.2 备份方案

| 方案 | 工具 | 频率 | 恢复时间 |
|------|------|------|----------|
| thinBackup | 插件 | 每日 | 分钟级 |
| 脚本备份 | `tar + crontab` | 每日 | 分钟级 |
| K8s PVC 快照 | CSI Snapshot | 每日 | 分钟级 |
| JCasC + Git | 配置即代码 | 实时（Git） | 秒级（配置恢复） |

```bash
#!/bin/bash
# 备份关键文件（不含 workspace）
BACKUP_DIR="/backup/jenkins/$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"
tar czf "$BACKUP_DIR/config.tar.gz" \
  $JENKINS_HOME/config.xml \
  $JENKINS_HOME/credentials.xml \
  $JENKINS_HOME/secrets/ \
  $JENKINS_HOME/users/ \
  $JENKINS_HOME/jobs/*/config.xml \
  $JENKINS_HOME/plugins.txt \
  2>/dev/null

# 加密备份（含凭据）
gpg -c "$BACKUP_DIR/config.tar.gz"
```

> ⚠️ **备份红线**：`JENKINS_HOME` 包含加密凭据，备份必须加密且异地存储，禁止明文上传对象存储。

## 本篇补充 Checklist

- [ ] Controller 轻量化 + Agent 弹性，K8s 动态 Agent 按需扩缩。
- [ ] 通用逻辑入 Shared Library 并锁版本、写单测。
- [ ] 用 `cleanWs()` / Build Discarder / 制品库外置治理磁盘与内存。
- [ ] 队列 pending、OOM、磁盘堆积是三大高频瓶颈，配监控告警。
- [ ] 凭据只经 `withCredentials`，禁止硬编码进 Pipeline 或日志。
- [ ] 并行阶段用 `failFast: true` 实现快速失败，矩阵构建控制维度爆炸。
- [ ] JCasC + plugins.txt 声明式配置，杜绝 UI 手动漂移。
- [ ] 定期备份 `JENKINS_HOME` 关键文件，加密异地存储。
