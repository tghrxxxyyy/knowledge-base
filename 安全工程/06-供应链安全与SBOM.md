# 供应链安全与 SBOM（软件物料清单）

> 供应链安全 =「**你的代码依赖的每一个组件都是潜在攻击面**」。SolarWinds/Log4Shell 事件证明：攻击者不攻你的代码，攻你依赖的库。SBOM（Software Bill of Materials）是「**软件的成分清单**」，让你知道项目里到底用了什么、哪个版本、有没有已知漏洞。本篇按「解决的问题 → 原理 → 实践」拆解。

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

## 二、核心原理

### 2.1 供应链攻击面

```
源码 → 构建 → 制品 → 分发 → 部署 → 运行
  ↓      ↓      ↓      ↓      ↓      ↓
代码注入 构建污染 制品篡改 供应链投毒 运行时漏洞

常见攻击：
  1. 依赖混淆（Dependency Confusion）：同名私有包被公开包替换
  2. Typosquatting：相似包名诱骗（如 `express` vs `exprss`）
  3. 恶意更新：维护者账号被盗，发布恶意版本
  4. 构建投毒：CI/CD 环境被入侵
```

### 2.2 SBOM 标准

| 标准 | 格式 | 特点 |
|------|------|------|
| CycloneDX | JSON/XML | OWASP 出品，支持漏洞/许可证/CVSS |
| SPDX | RDF/YAML | Linux 基金会，ISO 标准 |
| SWID Tags | XML | ISO 标准，侧重软件标识 |

### 2.3 SBOM 生成工具

| 工具 | 语言/生态 | 特点 |
|------|-----------|------|
| Syft | 通用（Go/Rust/Java/Python） | 最全面，CycloneDX/SPDX 输出 |
| Trivy | 通用 | 安全扫描 + SBOM 生成一体 |
| CycloneDX CLI | 通用 | OWASP 官方工具 |
| Snyk | 通用 | SaaS + CLI，漏洞数据库最全 |
| OWASP Dep-Check | Java/NPM | Java 漏洞扫描 |

### 2.4 漏洞扫描流程

```
代码仓库
  → SBOM 生成（Syft/Trivy）
  → 漏洞数据库匹配（NVD/GitHub Advisory/OSV）
  → 漏洞报告（CVE + 严重程度 + 修复建议）
  → 修复（升级版本/替换依赖/忽略）
```

---

## 三、生产实践

### 3.1 CI/CD 集成

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
```

### 3.2 关键实践

| 实践 | 说明 |
|------|------|
| SBOM 生成 | 每次构建生成 SBOM 并归档（与制品绑定） |
| 漏洞扫描 | CI/CD 中集成扫描，高危漏洞阻断发布 |
| 依赖锁定 | lock 文件（package-lock.json / go.sum）锁定版本 |
| 自动更新 | Dependabot/Renovate 自动提交依赖更新 PR |
| 许可证检查 | 防止 GPL 传染（尤其商业项目） |
| 供应链签名 | Sigstore/Cosign 对制品签名（防篡改） |

### 3.3 常见坑

- **传递依赖漏洞**：你的直接依赖没问题，但它的依赖有漏洞 → 必须递归扫描
- **误报**：漏洞数据库匹配可能误报 → 人工确认 + 上下文评估
- **lock 文件不同步**：`go.sum`/`package-lock.json` 与实际依赖不一致 → CI 校验
- **SBOM 过大**：大型项目 SBOM 数万条 → 分层扫描 + 优先级排序

---

## 四、与其他板块的关系

- CI/CD 安全见「[CI-CD/13-可观测性DORA度量与DevSecOps](../基础知识/CI-CD/13-可观测性DORA度量与DevSecOps.md)」；
- 容器安全见「[安全工程/01-应用安全基础与威胁建模](./01-应用安全基础与威胁建模.md)」；
- Docker 镜像见「[云原生/容器与Docker](../云原生/容器与Docker.md)」；
- 开源许可证见「[开源项目/07-学习资源与Awesome清单](../开源项目/07-学习资源与Awesome清单.md)」。

> 一句话：**供应链安全 = SBOM（依赖清单）+ 漏洞扫描（CVE 匹配）+ 依赖锁定（lock 文件）+ 自动更新（Dependabot）+ 制品签名（Sigstore）——CI/CD 中集成扫描，高危漏洞阻断发布**。
