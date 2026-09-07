# 漏洞扫描与CVE管理

> 对应 CVE/CVSS (MITRE/FIRST) / OWASP Top 10 / Swiecki syzkaller。

## 一、背景与挑战
依赖与代码不断引入已知漏洞，需持续扫描并依严重度优先级修复。CVE 提供统一漏洞标识，CVSS 给严重度。

## 二、核心原理
SCA 扫描第三方依赖比对 CVE 库；SAST 静态查代码缺陷；DAST 动态测运行态。依 CVSS 与环境(可达性)排修复序，结合 SBOM 追踪组件。

## 三、形式化与数学基础
修复优先级综合：
$$ P = CVSS_{base} \times Reachability \times Exposure $$
可达且暴露的 critical(CVSS≥9) 最先修；仅依赖但未调用可降级。

## 四、代码实现
```bash
# 依赖漏洞扫描(示意)
npm audit --json > audit.json     # 比对 CVE
# 或 Python
pip-audit                       # 基于 PyPI 漏洞库
# 输出含 CVE 编号与 CVSS 分, 按分排序修复
```

## 五、与其他技术对比
SCA 管依赖、SAST 管自研、DAST 管运行；模糊测试(如 syzkaller)发现未知漏洞补 CVE 盲区。

## 六、常见误区
只扫不修或只修不验。误信无 CVE 即无漏洞(0day 不存在库)。忽略传递依赖。

## 七、与开源书/权威来源对应
MITRE CVE；FIRST CVSS；OWASP A06(漏洞组件)；syzkaller 内核 fuzz 产出 CVE。

## 八、面试题
CVE 与 CVSS 关系？SCA/SAST/DAST 区别？如何排优先级？

## 九、演进与趋势
SBOM 强制化、eBPF 运行时漏洞检测、AI 辅助修复。

## 十、小结
漏洞管理靠持续扫描(SBOM+SCA/SAST/DAST)与按可达性排优先级修复，CVE/CVSS 为通用语言。
