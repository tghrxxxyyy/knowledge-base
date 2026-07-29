# CI/CD · 06 GitLab CI

> **口诀：GitLab CI 的灵魂是 `.gitlab-ci.yml` 这一个文件——它在仓库根目录定义"代码如何被构建、测试、部署"，Runner 只是忠实的执行者。** 一体化（代码、CI、安全、制品、环境全在一个平台）是它最大的卖点，也是它的锁定点。

本篇讲透 GitLab 内置 CI/CD 的全套能力：从 `.gitlab-ci.yml` 的语法骨架、Runner 与 executor 选型、cache/artifacts 的差异，到 `needs` 打破阶段串行的 DAG、流水线类型（MR pipeline / 父子流水线 / 多项目流水线）、安全扫描模板、环境与卡点。所有示例均可直接落地。

## 一、GitLab CI/CD 是什么：定位与一体化体验

GitLab CI/CD 是**内置于 GitLab 平台**的持续集成与持续交付系统。与 Jenkins（独立部署）或 GitHub Actions（独立服务）不同，它和代码仓库、Merge Request（MR）、容器Registry、安全面板、Pages、Environments 共享同一套身份与 UI。你在仓库里放一个 `.gitlab-ci.yml`，GitLab 就会在每次 push / MR / 打 tag 时自动调度 Runner 执行。

```mermaid
flowchart TB
    DEV[开发者 push / 开 MR] --> GIT[(GitLab 仓库)]
    GIT -->|检测 .gitlab-ci.yml| CI[GitLab CI 调度引擎]
    CI -->|分配 job| RUNNER[GitLab Runner]
    RUNNER -->|executor| EXEC[Shell / Docker / K8s / ...]
    EXEC -->|产物| ART[Artifacts & Cache]
    EXEC -->|镜像| REG[GitLab Container Registry]
    EXEC -->|部署| ENV[Environments / K8s]
    EXEC -->|扫描| SEC[安全面板 SAST/DAST/...]
    CI -->|状态/日志| UI[GitLab 流水线视图 & MR 检查]
```

| 维度 | GitLab CI/CD | （对照）Jenkins | （对照）GitHub Actions |
|------|--------------|----------------|------------------------|
| 部署形态 | 平台内置 | 独立服务 | 平台内置（GitHub） |
| 配置位置 | 仓库内 `.gitlab-ci.yml` | 独立 `Jenkinsfile` / UI | 仓库内 `.github/workflows/*.yml` |
| 安全扫描 | 官方模板一键接入 | 插件拼装 | 第三方 Action / CodeQL |
| 环境/审批 | Environments + manual job | 插件（如 Blue Ocean） | Environments + manual job |
| 一体化度 | **最高**（代码/CI/安全/Registry/环境一体） | 低（需自行集成） | 高（与 GitHub 生态一体） |

> 口诀：**"要一体化选 GitLab，要自由拼装选 Jenkins，要生态市场选 GitHub Actions。"** 没有银弹，看团队已经在哪个平台、要什么程度的开箱即用。

## 二、`.gitlab-ci.yml` 核心结构

一个最小可运行的 `.gitlab-ci.yml` 由**全局配置**和**作业（job）**组成。作业是基本执行单元，Runner 为每个 `job` 启动一个独立执行环境。

```yaml
stages:
  - build
  - test
  - deploy

variables:
  IMAGE_TAG: "1.0.0"

build_job:
  stage: build
  image: maven:3.9-eclipse-temurin-21
  script:
    - mvn package -DskipTests

unit_test:
  stage: test
  script:
    - mvn test

deploy_job:
  stage: deploy
  script:
    - echo "deploying..."
  environment: production
```

### 2.1 stages / stage：阶段顺序 vs 作业归属

- **`stages`**（全局）：声明流水线有哪些阶段**以及它们的执行顺序**。默认阶段是 `build`、`test`、`deploy`，但你必须显式声明才会按顺序跑。
- **`stage`**（作业级）：把这个作业分配到哪个阶段。**同一阶段内的所有作业并行执行**；只有上一个阶段所有作业都成功，下一阶段才开始。

```mermaid
flowchart LR
    subgraph S1[build 阶段 并行]
      B1[job A] 
      B2[job B]
    end
    subgraph S2[test 阶段 并行]
      T1[job C]
      T2[job D]
    end
    subgraph S3[deploy 阶段]
      D1[job E]
    end
    B1 --> T1
    B2 --> T2
    T1 --> D1
    T2 --> D1
    style S1 fill:#eef,style S2 fill:#efe,style S3 fill:#fee
```

### 2.2 script / before_script / after_script

| 关键字 | 执行时机 | 失败影响 |
|--------|----------|----------|
| `before_script` | 每个 job 的 `script` 之前（作业级可覆盖全局） | 失败则该 job 失败 |
| `script` | 核心命令，**必填** | 任意一条非零退出即 job 失败 |
| `after_script` | 无论成功失败都执行（即便 `script` 被 `when` 跳过也会跑） | 失败不影响 job 状态 |

⚠️ **反模式**：把大量逻辑塞进单条超长 `script`，既不可读也难调试。把可复用步骤抽成 `before_script` 或用 `extends`/`include` 复用。另外 `after_script` 里不要做"关键收尾动作"，因为它运行在**另一个 shell 上下文**，拿不到 `script` 里的变量/函数。

### 2.3 image / services：作业容器与依赖服务

- **`image`**：作业运行的容器镜像（默认 `docker` / `kubernetes` executor 生效）。每个 job 默认一个干净容器。
- **`services`**：为作业启动**伴生容器**（如 `mysql`、`redis`、`postgres`），通过服务名作为 hostname 互相访问，用于集成测试。

```yaml
integration_test:
  stage: test
  image: maven:3.9-eclipse-temurin-21
  services:
    - name: mysql:8.0
      alias: db
    - name: redis:7
      alias: cache
  variables:
    MYSQL_ROOT_PASSWORD: "rootpass"
    MYSQL_DATABASE: "appdb"
  script:
    - mvn verify  # 连接 jdbc:mysql://db:3306/appdb 与 redis://cache:6379
```

### 2.4 variables：变量的层级与作用域

变量来源优先级（高→低）：**job 变量 > 流水线变量 > Group/Project 变量（GitLab 后台配置）> `variables` 全局 > Runner 内置变量**。敏感信息（密钥、token）应放在 GitLab 项目/组的 **Settings → CI/CD → Variables**，而非写进 YAML。

```yaml
variables:                # 全局默认
  BUILD_ENV: "staging"
build:
  variables:              # 作业级覆盖
    BUILD_ENV: "prod"
  script:
    - echo "env=$BUILD_ENV"
```

### 2.5 tags：选择 Runner（最容易踩坑的点）

`tags` 决定**哪些 Runner 能抢到这个 job**。Runner 注册时带标签，job 的 `tags` 必须**是 Runner 标签的子集**才会被认领。

```yaml
deploy_prod:
  tags:
    - k8s
    - prod-runner
  script:
    - kubectl apply -f k8s/
```

### 2.6 allow_failure / when / retry / timeout

| 关键字 | 作用 | 取值/示例 |
|--------|------|-----------|
| `allow_failure` | job 失败**不阻断**后续阶段 | `true`：红但不挂流水线 |
| `when` | 何时运行 | `on_success`(默认) / `on_failure` / `always` / `manual` / `delayed` |
| `retry` | 失败自动重试 | `retry: 2` 或 `retry: { max: 2, when: runner_system_failure }` |
| `timeout` | 单 job 超时 | `timeout: 1h`（默认 1 小时，受 Runner 上限约束） |
| `start_in` | 延迟 `manual` job | `when: manual` + `start_in: 30 minutes` |

`when: manual` 配合 `allow_failure: false` 就是**人工卡点**（见第八节）。

### 2.7 rules：精细控制 job 是否/何时运行（推荐替代 only/except）

`rules` 是 2020 年后 GitLab 主推的调度逻辑，支持 `if`、`exists`、`changes`、`merge_request` 等条件。按顺序匹配，**第一条命中**的 rule 决定行为（`when` 默认 `on_success`，可用 `when: never` 跳过）。

```yaml
test:
  script: mvn test
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"   # MR 流水线里跑
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH         # 主干也跑
    - when: never                                          # 其余（如普通分支 push）不跑

build_docs:
  script: mkdocs build
  rules:
    - changes:                                             # 仅文档变更时跑
        - "docs/**/*"
        - "mkdocs.yml"
    - when: never

secret_scan:
  script: scan
  rules:
    - exists:                                              # 仓库含此文件才跑
        - "**/*.env"
```

`only` / `except` 仍是旧式写法（GitLab 文档标注为不推荐），能与 `rules` 混用但**语义易冲突**，强烈建议统一用 `rules`。常用预定义变量：`$CI_PIPELINE_SOURCE`（值含 `push` / `merge_request_event` / `schedule` / `web` / `trigger`）、`$CI_COMMIT_BRANCH`、`$CI_COMMIT_TAG`、`$CI_MERGE_REQUEST_IID`。

## 三、GitLab Runner 与 executor 选型

Runner 是真正干活的 agent，可以装在任意机器（物理机 / VM / K8s Pod / 容器）。一个 Runner 可服务多个项目，也可限定 tag。

### 3.1 安装与注册

```bash
# 1) 安装（Ubuntu 示例，安装官方 gitlab-runner 包）
sudo curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh" | sudo bash
sudo apt-get install gitlab-runner

# 2) 注册 Runner 到 GitLab 实例（交互式，会问 URL / token / executor / tag）
sudo gitlab-runner register \
  --non-interactive \
  --url "https://gitlab.example.com" \
  --registration-token "$REGISTRATION_TOKEN" \
  --executor "docker" \
  --docker-image "alpine:latest" \
  --tag-list "docker,common" \
  --description "shared-docker-runner"

# 3) 启动并查看状态
sudo gitlab-runner start
sudo gitlab-runner status
sudo gitlab-runner list
```

注册信息写入 `/etc/gitlab-runner/config.toml`。Executor 在注册时选定，**一台 Runner 一个 executor**（但可注册多个 Runner 实例各用不同 executor）。

### 3.2 executor 类型对比与选型

```mermaid
flowchart LR
    subgraph Runner[GitLab Runner]
      REG[注册 & 调度]
      REG --> EX[Executor 执行器]
    end
    EX --> SHELL[shell]
    EX --> DOCKER[docker]
    EX --> DM[docker+machine 自动扩缩]
    EX --> K8S[kubernetes]
    EX --> SSH[ssh]
    EX --> VB[virtualbox]
    EX --> PAR[parallels]
```

| Executor | 隔离度 | 速度 | 自动扩缩 | 适用场景 | 主要坑 |
|----------|--------|------|----------|----------|--------|
| `shell` | 低（共用 OS 用户） | 最快 | 否 | 简单脚本、自管机 | **易受污染/提权**，需受信任代码 |
| `docker` | 中（容器级） | 快 | 否 | 绝大多数构建，环境干净 | 需 Docker daemon，docker-in-docker 权限 |
| `docker+machine` | 中 | 快 | **是**（按需起 VM） | 高并发、弹性 CI | 运维复杂、云成本 |
| `kubernetes` | 高（Pod 级） | 中 | **是**（HPA/调度） | 云原生团队、K8s 集群内 | 需 K8s RBAC 配置 |
| `ssh` | 低 | 中 | 否 | 已有目标机执行 | 同 shell，安全弱 |
| `virtualbox` / `parallels` | 高（VM 级） | 慢 | 否 | 需完整 OS/特定内核 | 资源重、启动慢 |

> 口诀：**"要隔离上 K8s/docker，要弹性上 docker+machine，要省事但不受信代码别用 shell。"** 生产共享 Runner 绝不用 `shell` executor 跑不可信 MR。

## 四、cache vs artifacts：加速 vs 传递产物

这是 GitLab CI 最常被混淆的一对概念。

```mermaid
flowchart TB
    subgraph 跨流水线[cache：跨流水线/跨 job 复用，加速]
      C1[Pipeline #1 build] -->|缓存依赖| CACHE[(Cache Store 按 key)]
      CACHE --> C2[Pipeline #2 build 命中]
    end
    subgraph 作业间[artifacts：同流水线内 job 间传递产物]
      A1[build job 产出 jar] -->|上传 artifact| STORE[(Artifacts)]
      STORE --> A2[test job 下载 jar]
      STORE --> A3[deploy job 下载 jar]
    end
```

| 维度 | `cache` | `artifacts` |
|------|---------|-------------|
| 目的 | **加速**：缓存依赖（node_modules、~/.m2） | **传递**：把构建产物交给后续 job |
| 生命周期 | 跨流水线保留（按 key 命中） | 同流水线内传递，默认在后续阶段可下载，过期可设 |
| 作用范围 | 默认所有 job 共享同一 key（易污染） | 仅 `dependencies`/`needs` 声明的 job 获取 |
| 下载时机 | job 开始时 restore | job 开始时 download（除非 `dependencies: []`） |
| 典型用法 | `paths: [node_modules/]` | `paths: [target/*.jar]` |
| 风险 | **跨分支/并行污染** | 体积大拖慢、需设 `expire_in` |

```yaml
variables:
  MAVEN_OPTS: "-Dmaven.repo.local=$CI_PROJECT_DIR/.m2"

cache:
  key: ${CI_COMMIT_REF_SLUG}          # ⚠️ 按分支隔离，避免跨分支污染
  paths:
    - .m2/
    - target/

build:
  stage: build
  script: mvn package -DskipTests
  artifacts:
    name: "$CI_COMMIT_REF_SLUG-jar"
    paths:
      - target/app.jar
    expire_in: 1 week                 # 避免无限堆积
    when: on_success

test:
  stage: test
  needs: [build]
  script: mvn test
  dependencies: [build]               # 显式声明要拿 build 的 artifacts
```

`artifacts: policy: push`（仅上传）/`pull`（仅下载）/`pull-push`（默认）控制单 job 的收/发行为；`dependencies: []` 可让某 job 不拉任何 artifact。

⚠️ **生产踩坑**：`cache` 的 `key` 不按分支隔离时，A 分支的编译产物可能覆盖 B 分支，导致"我本地好的"诡异失败。务必用 `key: $CI_COMMIT_REF_SLUG` 或最细粒度的 key。

## 五、needs 与 DAG：打破阶段串行

默认 job 受 `stages` 串行约束；`needs` 让 job **不等整阶段结束**、只要依赖的 job 完成就立即开跑，形成有向无环图（DAG），显著缩短关键路径。

```mermaid
flowchart LR
    subgraph 串行[无 needs：阶段串行]
      X1[build A] --> X2[test A] --> X3[deploy A]
      Y1[build B] --> Y2[test B] --> Y3[deploy B]
      X1 --- Y1
    end
    subgraph DAG[有 needs：按依赖并行]
      BA[build A] --> TA[test A] --> DA[deploy A]
      BB[build B] --> TB[test B] --> DB[deploy B]
    end
```

```yaml
stages: [build, test, deploy]

build_a: { stage: build, script: echo building A }
build_b: { stage: build, script: echo building B }

test_a:
  stage: test
  needs: [build_a]          # 不等 build_b，build_a 一完就跑
  script: echo testing A
test_b:
  stage: test
  needs: [build_b]
  script: echo testing B

deploy_a:
  stage: deploy
  needs: [test_a]
  script: echo deploy A
deploy_b:
  stage: deploy
  needs: [test_b]
  script: echo deploy B

lint:
  stage: test
  needs: []                 # 立即运行，不依赖任何 job（常见：静态检查先跑）
  script: echo lint
```

`needs` 进阶：
- `needs: [job, job2]`：多依赖（扇入）。
- `needs: { job: build, artifacts: false }`：只等完成、不要其 artifacts（省下载）。
- `needs: { job: build, optional: true }`：依赖可选，job 不存在也不报错（动态生成流水线时有用）。
- `needs: { pipeline: other_project, job: build }`：跨项目取产物（多项目流水线）。

> 口诀：**"stages 管'默认节奏'，needs 管'实际依赖'——用 needs 画 DAG，把关键路径压到最短。"**

## 六、流水线类型

GitLab 提供四种流水线组织方式，可组合使用。

| 类型 | 触发 | 价值 | 关键词 |
|------|------|------|--------|
| 基础流水线 | 默认 | 简单直观 | `stages` |
| DAG 流水线 | job 依赖 | 最快执行 | `needs` |
| 合并请求流水线 | 开/更新 MR | **不让未过 CI 的代码合入** | `rules: if: $CI_PIPELINE_SOURCE == "merge_request_event"` |
| 父子流水线 | 父触发子 | 大仓拆分、动态生成 | `trigger` + `include` |
| 多项目流水线 | 跨项目触发 | 微服务协同 | `trigger: { project: }` |

### 6.1 合并请求流水线（Pipelines for Merge Requests）

在 MR 上跑、结果直接显示在 MR 检查项，是"合代码前先过 CI"的关键。

```yaml
# 全局 workflow.rules 确保 MR 与主干各跑一次，避免重复
workflow:
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

test:
  script: mvn test
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

### 6.2 父子流水线（Parent-Child / Child Pipelines）

把大 YAML 拆成子文件，由父流水线用 `trigger` 触发，配合 `rules` 做"只触发变更部分"。

```yaml
# .gitlab-ci.yml（父）
stages: [trigger]

frontend_pipeline:
  stage: trigger
  trigger:
    include: frontend/.gitlab-ci.yml     # 子流水线配置
    strategy: depend                      # 父等子完成再继续
  rules:
    - changes: [ "frontend/**/*" ]

backend_pipeline:
  stage: trigger
  trigger:
    include: backend/.gitlab-ci.yml
  rules:
    - changes: [ "backend/**/*" ]
```

### 6.3 多项目流水线（Multi-Project Pipelines）

跨仓库协同发布（如前端、后端、移动端分属不同项目）：

```yaml
deploy_downstream:
  stage: deploy
  trigger:
    project: mygroup/service-b
    branch: main
    strategy: depend
```

## 七、集成安全扫描（模板化，深入见第 13 篇）

GitLab 内置安全扫描通过 `include` 官方模板即可启用，结果汇入安全面板（需 Ultimate/Gold 等授权，社区版可跑但面板受限）。

```yaml
include:
  - template: Security/SAST.gitlab-ci.yml            # 静态应用安全测试
  - template: Security/Dependency-Scanning.gitlab-ci.yml
  - template: Security/Secret-Detection.gitlab-ci.yml # 密钥泄露检测
  - template: Security/Container-Scanning.gitlab-ci.yml
  - template: Security/DAST.gitlab-ci.yml            # 动态测试（需配置环境 URL）

sast:
  variables:
    SAST_EXCLUDED_PATHS: "tests, docs"
```

五大扫描能力对照：

| 扫描 | 模板 | 检测对象 | 阶段 |
|------|------|----------|------|
| SAST | `Security/SAST.gitlab-ci.yml` | 源码中的安全漏洞（SQLi、XSS 模式） | build/test |
| Dependency Scanning | `Security/Dependency-Scanning.gitlab-ci.yml` | 依赖库 CVE | test |
| Secret Detection | `Security/Secret-Detection.gitlab-ci.yml` | 提交的密钥/ token | test |
| Container Scanning | `Security/Container-Scanning.gitlab-ci.yml` | 镜像层 CVE（Trivy） | test |
| DAST | `Security/DAST.gitlab-ci.yml` | 运行中应用的漏洞 | deploy 后 |

> 第 13 篇会深入 SBOM、签名、供应链攻击面；此处只建立"模板即插即用"的认知。

## 八、environments 与环境部署、手动卡点、Review Apps

`environment` 把部署与 GitLab 的 **Environments** 页面绑定，可查看每次部署、一键回滚、设保护环境（protected）。

```yaml
deploy_staging:
  stage: deploy
  script: helm upgrade --install app ./charts --set image.tag=$CI_COMMIT_SHA
  environment:
    name: staging
    url: https://staging.example.com
  rules:
    - if: $CI_COMMIT_BRANCH == "develop"

deploy_prod:
  stage: deploy
  script: helm upgrade --install app ./charts --set image.tag=$CI_COMMIT_SHA
  environment:
    name: production
  when: manual              # 人工卡点：需人在 GitLab 点一下
  allow_failure: false      # 卡点失败则流水线失败（不可跳过）
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

**Review Apps**：为每个 MR 自动起一套临时环境，MR 关闭即回收——用 `environment: { name: review/$CI_MERGE_REQUEST_IID, on_stop: stop_review }` + `action: stop` 的清理 job 实现。

⚠️ **生产踩坑**：`when: manual` 的卡点 job 若忘了配 `allow_failure: false`，它失败也不会阻断流水线，等于"假卡点"。保护生产环境务必同时开启 GitLab 的 **Protected Environment**（限定能部署的角色）。

## 九、完整示例

### 9.1 示例① 标准 build→test→deploy（含 cache / artifacts）

```yaml
stages:
  - build
  - test
  - deploy

variables:
  MAVEN_OPTS: "-Dmaven.repo.local=$CI_PROJECT_DIR/.m2/repository"

cache:
  key: ${CI_COMMIT_REF_SLUG}
  paths:
    - .m2/repository/
    - target/

build:
  stage: build
  image: maven:3.9-eclipse-temurin-21
  script:
    - mvn compile
  artifacts:
    paths:
      - target/classes/
    expire_in: 1 hour

unit_test:
  stage: test
  image: maven:3.9-eclipse-temurin-21
  needs: [build]
  script:
    - mvn test
  coverage: '/Total.*?([0-9]+)%/'

package:
  stage: test
  image: maven:3.9-eclipse-temurin-21
  needs: [build]
  script:
    - mvn package -DskipTests
  artifacts:
    name: "app-$CI_COMMIT_SHORT_SHA"
    paths:
      - target/*.jar
    expire_in: 1 week

deploy_staging:
  stage: deploy
  image: bitnami/kubectl:latest
  needs: [package]
  environment:
    name: staging
  script:
    - kubectl set image deploy/app app=registry.example.com/app:$CI_COMMIT_SHORT_SHA
  rules:
    - if: $CI_COMMIT_BRANCH == "develop"
```

### 9.2 示例② 带 needs 的 DAG 并行 + 合并请求流水线

```yaml
workflow:
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

stages: [build, test, deploy]

lint:
  stage: test
  needs: []
  image: node:20
  script: npm run lint

build_frontend:
  stage: build
  image: node:20
  script: npm run build
  artifacts: { paths: [dist/], expire_in: 1h }

build_backend:
  stage: build
  image: maven:3.9-eclipse-temurin-21
  script: mvn package -DskipTests
  artifacts: { paths: [target/app.jar], expire_in: 1h }

test_frontend:
  stage: test
  needs: [build_frontend]
  image: node:20
  script: npm test

test_backend:
  stage: test
  needs: [build_backend]
  image: maven:3.9-eclipse-temurin-21
  script: mvn test

deploy:
  stage: deploy
  needs: [test_frontend, test_backend]   # 扇入：两个测试都过才部署
  image: bitnami/kubectl:latest
  script: echo "deploying both"
  environment: { name: review/$CI_MERGE_REQUEST_IID }
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

### 9.3 示例③ 安全扫描模板 + K8s 部署 + OIDC 免密钥

```yaml
include:
  - template: Security/SAST.gitlab-ci.yml
  - template: Security/Secret-Detection.gitlab-ci.yml
  - template: Security/Dependency-Scanning.gitlab-ci.yml

stages: [build, test, deploy]

variables:
  AWS_REGION: "cn-north-1"

build:
  stage: build
  image: docker:24
  services: [docker:24-dind]
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA

deploy_aws:
  stage: deploy
  image: amazonlinux:2023
  id_tokens:                      # OIDC：向 AWS 换临时凭证，无需长期密钥
    AWS_TOKEN:
      aud: "https://gitlab.example.com"
  script:
    - yum install -y awscli kubectl
    - |
      # 用 OIDC token 向 AWS STS 换取临时凭证（trust policy 绑定 sub/aud）
      AWS_ROLE_ARN="arn:aws:iam::123456789012:role/gitlab-deploy"
      creds=$(aws sts assume-role-with-web-identity \
        --role-arn $AWS_ROLE_ARN \
        --role-session-name gitlab-$CI_PIPELINE_ID \
        --web-identity-token $AWS_TOKEN)
      export AWS_ACCESS_KEY_ID=$(echo $creds | jq -r .Credentials.AccessKeyId)
      export AWS_SECRET_ACCESS_KEY=$(echo $creds | jq -r .Credentials.SecretAccessKey)
      export AWS_SESSION_TOKEN=$(echo $creds | jq -r .Credentials.SessionToken)
    - kubectl set image deploy/app app=$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
  environment: { name: production }
  when: manual
  allow_failure: false
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

⚠️ **生产踩坑**：
1. `tags` 选错/缺失 → job 长时间 `pending`（没有匹配 Runner）。注册时确认标签与 job `tags` 一致。
2. `cache` 跨分支污染（见第四节）。
3. `rules` 与 `only/except` 混用 → 二者叠加语义诡异，统一用 `rules`。
4. 密钥误打日志：Runner 默认会**部分遮蔽**变量，但拼进 URL/命令的参数仍可能泄露；禁止 `echo $SECRET`，必要时 `set +x`。
5. 巨型单文件 pipeline（几百行、几十 job）难维护 → 用 `include` 拆子文件 / 父子流水线。

## 十、与其他模块的关联

- 流水线总纲与本库术语，见 [01-概述与核心概念](01-概述与核心概念.md)。
- 构建与制品（Maven/npm 打包、制品仓库）是 CI 中段核心，见 [03-构建与制品管理](03-构建与制品管理.md)。
- 部署策略（蓝绿、金丝雀、滚动）深入见 [10-部署策略](10-部署策略.md)。
- 安全扫描、SBOM、供应链签名深入见 [13-安全与供应链安全](13-可观测性DORA度量与DevSecOps.md)。
- 容器与 K8s 调度底座，见 [../../云原生/K8S.md](../../云原生/K8S.md)。
- 大数据 ETL 调度（Airflow 类）与 CI 流水线"代码→制品→服务"思想可类比，见 [../大数据/09-数据仓库与OLAP引擎.md](../大数据/09-数据仓库与OLAP引擎.md)。

## 十一、小结 Checklist

- [ ] 一个仓库一个 `.gitlab-ci.yml`，`stages` 声明顺序、`stage` 分配作业。
- [ ] 敏感信息走 GitLab Variables，绝不进 YAML。
- [ ] `image`/`services` 用容器保证干净环境；`tags` 必须能被某 Runner 认领。
- [ ] `cache` 按分支隔离防污染；`artifacts` 用 `dependencies`/`needs` 精确传递。
- [ ] 用 `needs` 画 DAG 压短关键路径；`when: manual` + `allow_failure: false` 做真卡点。
- [ ] MR 流水线 + `rules` 防止坏代码合入；大仓用父子/多项目流水线拆分。
- [ ] 安全扫描 `include` 模板即插即用；生产部署用 OIDC 免长期密钥。
- [ ] 巨型 pipeline 用 `include` 治理，避免单文件失控。

> 参考：
> - GitLab CI/CD YAML 语法参考（官方，v18）：https://docs.gitlab.com/ci/yaml/
> - `needs` 关键字与 DAG：https://docs.gitlab.com/ci/yaml/needs/
> - 流水线架构（基础/DAG/父子/多项目）：https://docs.gitlab.com/ee/ci/pipelines/pipeline_architectures.html
> - GitLab Runner 安装与注册：https://docs.gitlab.com/runner/register/
> - Executor 类型对比：https://docs.gitlab.com/runner/executors/
> - OIDC（`id_tokens`）连接云服务：https://docs.gitlab.com/ee/ci/cloud_services/ 与 https://docs.gitlab.com/ee/ci/secrets/id_token_authentication.html
> - 安全扫描模板：https://docs.gitlab.com/ee/user/application_security/
> - Environments 与 Review Apps：https://docs.gitlab.com/ee/ci/environments/
> - 关键字速查（GitLab 18.0，DevOps School）：https://www.devopsschool.com/blog/gitlab-ci-cd-pipeline-configuration-keywords

## 十、复杂多项目管道：child / parent pipeline 进阶

父流水线按变更路径触发子流水线，实现大仓拆分与动态生成（`trigger` + `include` + `rules: changes`）：

```yaml
# 父 .gitlab-ci.yml
stages: [trigger]
micro_a:
  stage: trigger
  trigger:
    include: services/a/.gitlab-ci.yml
    strategy: depend                 # 父等子完成再继续
  rules:
    - changes: [ "services/a/**/*" ]
micro_b:
  stage: trigger
  trigger:
    include:
      - local: services/b/.gitlab-ci.yml
    strategy: depend
  rules:
    - changes: [ "services/b/**/*" ]
```

**多项目流水线**（跨仓库协同发布）：

```yaml
upstream_release:
  stage: deploy
  trigger:
    project: mygroup/service-b
    branch: main
    strategy: depend
```

## 十一、rules vs only/except：该用哪个

`only/except` 已落后，**统一用 `rules`**（更可读、可组合、支持 `changes`/`exists`/`variables`）：

| 场景 | only/except（旧） | rules（新，推荐） |
|------|-------------------|-------------------|
| 仅默认分支 | `only: [main]` | `rules: - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH` |
| MR 事件 | `only: [merge_requests]` | `rules: - if: $CI_PIPELINE_SOURCE == "merge_request_event"` |
| 排除标签 | `except: [tags]` | `rules: - if: $CI_COMMIT_TAG == null` |
| 变更触发 | 不支持 | `rules: - changes: [ "src/**" ]` |

```yaml
build:
  script: mvn package
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
    - when: never                        # 其他情况不跑
```

## 十二、cache 策略进阶

```yaml
cache:
  key:
    files:                              # 依赖文件变才失效
      - pom.xml
      - package-lock.json
  paths:
    - .m2/repository/
    - node_modules/
  policy: pull-push                    # push 上传 / pull 下载 / pull-push 默认
```

- **按分支隔离**：`key: $CI_COMMIT_REF_SLUG` 防跨分支污染。
- **按文件哈希失效**：`key: { files: [package-lock.json] }`，依赖升级才重建缓存。
- **缓存与 artifact 区别**：cache 跨流水线加速、可丢；artifact 跨 job 传递、需可靠。

## 十三、self-hosted Runner 调优

```toml
# config.toml（GitLab Runner）
[[runners]]
  name = "k8s-runner"
  executor = "kubernetes"
  [runners.kubernetes]
    namespace = "gitlab-runner"
  [runners.cache]
    Type = "s3"
    Path = "gitlab-cache"
    Shared = true                       # 多 runner 共享缓存
  concurrent = 10                       # 单 runner 并发 job 数
  [runners.docker]
    shm_size = 512000000                # 防 Chrome/e2e 共享内存不足
```

调优要点：

| 项 | 建议 |
|----|------|
| `concurrent` | 按节点核数设，避免排队或过载 |
| 缓存后端 | 用 S3/MinIO 共享，跨 runner 命中 |
| 镜像预热 | 节点预拉基础镜像，减拉取耗时 |
| 标签治理 | job `tags` 与 runner 标签精确匹配 |
| 安全 | 受信任仓库才跑 `shell` executor；不可信用 `docker`/`kubernetes` 隔离 |

## 本篇补充 Checklist

- [ ] 大仓/多服务用 parent-child `trigger`+`include`+`changes` 拆分。
- [ ] 统一 `rules`，弃用 `only/except`。
- [ ] 缓存按文件哈希失效 + 按分支隔离；cache 与 artifact 分工清晰。
- [ ] 自托管 Runner 配 `concurrent`/共享缓存/资源限制/S3，受信任才用 shell。
