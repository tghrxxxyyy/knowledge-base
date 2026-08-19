# 供应链安全与 SBOM（深入：攻击链 / 依赖混淆攻防 / 制品签名 / 全生命周期治理）

> 供应链安全 =「**你的代码依赖的每一个组件都是潜在攻击面**」。SolarWinds/Log4Shell 事件证明：攻击者不攻你的代码，攻你依赖的库。本篇深入拆解：供应链攻击链、依赖混淆攻防、制品签名体系、SBOM 全生命周期、组织级治理。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 依赖漏洞 | Log4j/Logback 等库有 CVE，但你不知道项目里有没有用 |
| 传递依赖 | A 依赖 B，B 依赖 C（漏洞在 C 里，你感知不到） |
| 版本老旧 | 项目里某个库 3 年没更新，已有 10 个 CVE |
| 供应链投毒 | 恶意包名/typosquatting（如 `lodash` vs `lodas`） |
| 合规要求 | 开源许可证冲突（GPL 传染）/ 政府监管要求 |

> 核心认知：**SBOM = 依赖的 X 光片**——扫描项目生成完整依赖树 + 版本 + 许可证 + 漏洞状态，一键可见。

---

## 二、供应链攻击链全景

### 2.1 攻击链模型

```
源码 → 构建 → 制品 → 分发 → 部署 → 运行
  ↓      ↓      ↓      ↓      ↓      ↓
代码注入 构建污染 制品篡改 供应链投毒 运行时漏洞
```

| 环节 | 攻击方式 | 典型案例 |
|------|----------|----------|
| 源码 | 开源贡献者植入后门 | xz-utils 后门（2024） |
| 构建 | CI/CD 环境被入侵，篡改构建脚本 | SolarWinds（构建服务器被黑） |
| 制品 | 篡改发布包/镜像 | Codecov 脚本注入 |
| 分发 | 污染镜像仓库/包仓库 | PyPI/NPM 恶意包 |
| 依赖 | 投毒、依赖混淆 | ua-parser-js（NPM 劫持） |
| 运行时 | 漏洞利用 | Log4Shell |

### 2.2 依赖混淆（Dependency Confusion）

```
原理：
  私有包名与公开包同名
  包管理器优先拉取公开仓库（版本号更高）
  → 恶意公开包被当成私有包安装

防御：
  私有源配置验证（scope/registry 白名单）
  包名扫描（与公开仓库交叉比对）
  锁定版本 + 完整性校验（integrity hash）
```

### 2.3 Typosquatting

```
原理：
  恶意包名与知名包仅差一个字母
  `lodash` → `lodas` / `lo-dash`
  开发手滑装错 → 执行恶意代码

防御：
  安装前校验包名与发布者
  使用 lock 文件（防范围依赖）
  扫描依赖树对比已知恶意包数据库（如 Socket）
```

---

## 三、核心原理

### 3.1 SBOM 标准

| 标准 | 格式 | 特点 |
|------|------|------|
| CycloneDX | JSON/XML | OWASP 出品，支持漏洞/许可证/CVSS |
| SPDX | RDF/YAML | Linux 基金会，ISO 标准 |
| SWID Tags | XML | ISO 标准，侧重软件标识 |

### 3.2 SBOM 生成工具

| 工具 | 语言/生态 | 特点 |
|------|-----------|------|
| Syft | 通用（Go/Rust/Java/Python） | 最全面，CycloneDX/SPDX 输出 |
| Trivy | 通用 | 安全扫描 + SBOM 生成一体 |
| CycloneDX CLI | 通用 | OWASP 官方工具 |
| Snyk | 通用 | SaaS + CLI，漏洞数据库最全 |
| OWASP Dep-Check | Java/NPM | Java 漏洞扫描 |

### 3.3 漏洞数据库

| 数据库 | 维护方 | 特点 |
|--------|--------|------|
| NVD | NIST | 最全 CVE 数据库（有延迟） |
| GitHub Advisory | GitHub | 生态覆盖好、更新快 |
| OSV | Google | 开源生态专用，漏洞格式统一 |
| CVE.org | MITRE | CVE 官方分配机构 |

---

## 四、制品签名与验证（Supply-chain 信任链）

### 4.1 Sigstore / Cosign

```
Sigstore = 开源软件签名基础设施

组成：
  Fulcio：免费短期证书颁发（GitHub OIDC 身份）
  Rekor：透明日志（签名记录可审计）
  Cosign：签名/验证 CLI

签名流程：
  cosign sign myregistry/myapp:1.0
  → 生成密钥对（短期证书，绑定 GitHub 身份）
  → 对镜像签名 → 记录到 Rekor

验证流程：
  cosign verify myregistry/myapp:1.0
  → 校验签名 + 证书身份 + Rekor 记录
```

### 4.2 密钥生命周期

```
私钥永不离开签名机器（HSM/KMS）
短期证书（分钟~天级）降低泄露影响
轮换：证书自动轮换（Sigstore 默认）
吊销：发现泄露 → 撤销证书 → Rekor 可审计
```

### 4.3 SLSA 框架

```
SLSA（Supply-chain Levels for Software Artifacts）= 供应链等级认证

SLSA Level 1：有文档化构建流程
SLSA Level 2：构建过程有源控制 + 认证
SLSA Level 3：构建不可篡改（隔离环境 + 可复现构建）
SLSA Level 4：构建完全可复现 + 依赖完整性

实践对应：
  L1~2：CI/CD 跑构建
  L3：GitHub Actions 隔离环境 + provenance 生成
  L4：Hermetic build（完全离线构建）+ 依赖锁定
```

---

## 五、漏洞扫描流程

### 5.1 全链路扫描

```
代码仓库 → SBOM 生成（Syft/Trivy）→ 漏洞匹配（NVD/GitHub Advisory/OSV）
  → 漏洞报告（CVE + 严重程度 + 修复建议）
  → 修复（升级版本/替换依赖/忽略）

三道防线：
  1. 开发期：IDE 插件扫描 + PR 门禁
  2. 构建期：CI/CD 扫描，高危阻断发布
  3. 运行时：运行中镜像持续扫描（新 CVE 报警）
```

### 5.2 漏洞分级处置

| 级别 | 处置 | 时限 |
|------|------|------|
| Critical（CVSS ≥ 9.0） | 立即修复/阻断发布 | 24h |
| High（7.0~8.9） | 尽快修复 | 1 周 |
| Medium（4.0~6.9） | 排期修复 | 1 月 |
| Low（< 4.0） | 低优先级 | 3 月 |

### 5.3 误报治理

```
误报来源：
  版本匹配错误（lock 文件与实际不符）
  无利用路径（漏洞函数未被调用）
  环境隔离（漏洞仅影响特定平台）

处理：
  人工确认 + 上下文评估（调用链是否可达）
  漏洞忽略清单（IGNORE 理由必填 + 定期复审）
  与运行时检测联动（EPSS 评分辅助排序）
```

---

## 六、CI/CD 集成

```yaml
# GitHub Actions 示例
- name: Generate SBOM
  uses: anchore/sbom-action@v0
  with:
    image: myapp:latest
    format: cyclonedx-json

- name: Scan vulnerabilities
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: myapp:latest
    severity: CRITICAL,HIGH
    exit-code: 1  # 有高危漏洞则失败

- name: Sign image
  run: cosign sign myregistry/myapp:1.0
```

### 6.1 关键实践

| 实践 | 说明 |
|------|------|
| SBOM 生成 | 每次构建生成 SBOM 并归档（与制品绑定） |
| 漏洞扫描 | CI/CD 中集成扫描，高危漏洞阻断发布 |
| 依赖锁定 | lock 文件（package-lock.json / go.sum）锁定版本 |
| 自动更新 | Dependabot/Renovate 自动提交依赖更新 PR |
| 许可证检查 | 防止 GPL 传染（尤其商业项目） |
| 供应链签名 | Sigstore/Cosign 对制品签名（防篡改） |

### 6.2 依赖更新策略

```
Renovate / Dependabot：
  PR 频率：weekly（默认）
  安全更新：立即 PR
  分组：同类依赖合并 PR（减少噪音）

更新验证：
  更新后跑完整测试（单测 + 集成 + E2E）
  关注 breaking change（major 版本升级）
  灰度发布验证
```

---

## 七、SBOM 全生命周期

```
生成（构建时）→ 归档（与制品绑定）→ 消费（漏洞匹配/许可证审计）
  → 追溯（事件响应定位受影响制品）→ 治理（政策执行）

消费场景：
  漏洞管理：新 CVE 发布 → 自动匹配所有受影响制品
  许可证合规：GPL/AGPL 传染检查
  事件响应：某库出问题 → 秒级定位受影响系统
  审计合规：向监管提交 SBOM 报告
```

---

## 八、常见坑

| 坑 | 说明 | 对策 |
|----|------|------|
| 传递依赖漏洞 | 直接依赖没问题，间接依赖有漏洞 | 递归扫描（SBOM 全量） |
| 误报 | 漏洞数据库匹配错误 | 人工确认 + IGNORE 清单 |
| lock 文件不同步 | 实际依赖与 lock 不一致 | CI 校验 lock 完整性 |
| SBOM 过大 | 大型项目数万条 | 分层扫描 + 优先级排序 |
| 扫描延迟 | NVD 数据滞后 | 多数据源（GitHub/OSV） |
| 签名流程缺失 | 制品无签名验证 | Sigstore 强制签名 |

---

## 九、组织级供应链治理

```
治理框架：
  政策：依赖引入标准（许可证/版本/来源）
  流程：PR 门禁（扫描）+ 发布门禁（签名+SBOM）
  工具：统一扫描平台 + 漏洞库
  指标：漏洞修复时长（MTTR）、依赖更新率、SBOM 覆盖率
  审计：季度供应链安全审计

责任分工：
  CISO：政策与风险决策
  DevSecOps：扫描/签名/门禁落地
  开发团队：依赖治理第一责任人
  安全团队：漏洞研判与事件响应
```

---

## 十、与其他板块的关系

- CI/CD 安全见「[CI-CD/13-可观测性DORA度量与DevSecOps](../基础知识/CI-CD/13-可观测性DORA度量与DevSecOps.md)」；
- 容器安全见「[安全工程/01-应用安全基础与威胁建模](./01-应用安全基础与威胁建模.md)」；
- Docker 镜像见「[云原生/容器与Docker](../云原生/容器与Docker.md)」。

> 一句话：**供应链安全 = SBOM（依赖清单）+ 漏洞扫描（CVE 匹配）+ 依赖锁定（lock 文件）+ 制品签名（Sigstore/SLSA）+ 全生命周期治理——三道防线（开发期/构建期/运行时），高危阻断、事件可追溯**。
