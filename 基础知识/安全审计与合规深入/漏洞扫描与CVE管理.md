# 漏洞扫描与CVE管理

> 对应 MITRE CVE；FIRST CVSS；OWASP A06:2021（易受攻击和过时的组件）；NIST SP 800-40；NTIA SBOM（SPDX / CycloneDX）。

## 一、背景与挑战
现代应用大量复用第三方组件与基础镜像，代码里绝大多数行数并非自己写的。这意味着**已知漏洞会随依赖被无意识引入**，而且传递依赖常常是重灾区：你直接依赖的库没问题，它依赖的库有问题。漏洞管理因此不是一次性任务，而是持续的资产—漏洞—修复闭环。

挑战体现在：其一，**量与噪声**——一次全量扫描可能给出成千上万条告警，绝大多数不可达或已被环境缓解，若不做优先级过滤，团队会被淹没；其二，**可达性判断难**——组件装了不等于代码路径被调用，未调用的漏洞风险远低于被入口直接触发的；其三，**修复成本**——升级可能引入不兼容，尤其在深依赖链上需要评估回归风险；其四，**标识与信息完整性**——CVE 是标识而非严重度，且并非所有漏洞都有 CVE（0day 与未分配者不在库中），因此「扫不到」绝不等于「没有」。

## 二、核心原理
三类扫描各司其职：**SCA（软件成分分析）** 解析依赖清单（lock 文件、镜像层、二进制符号）并与漏洞库比对，回答「用了哪些组件、有哪些已知问题」；**SAST** 在自研代码里找缺陷模式；**DAST** 在运行态从外部验证可利用性。三者互补，再加上**模糊测试**发现未知漏洞，构成「已知 + 未知」的完整覆盖。

**CVE 提供统一标识**（形如 CVE-YYYY-NNNN），使不同工具与团队讨论的是同一个对象；**CVSS** 提供可比较的严重度评分，其基础向量刻画可利用性（攻击向量、复杂度、权限要求、用户交互）与影响（机密性、完整性、可用性）。**SBOM（软件物料清单）** 记录交付物内的组件与版本，是「漏洞爆出后 5 分钟内回答我是否受影响」的前提。优先级排序需在 CVSS 之上叠加环境因素：漏洞是否可达、资产是否暴露、是否已有在野利用（KEV 类情报）、攻击是否需要交互。修复策略则分升级、打补丁、配置缓解、虚拟补丁（WAF）与接受风险（需记录并复审）。

## 三、形式化与数学基础
基础优先级可表示为多因子乘积：
$$ P = \mathrm{CVSS}_{base} \times \mathrm{Reachability} \times \mathrm{Exposure} \times \mathrm{Exploit}_{maturity} $$
其中 $\mathrm{Reachability}\in[0,1]$ 表示漏洞代码路径被实际调用（或受输入可达）的程度，$\mathrm{Exposure}\in[0,1]$ 表示资产对外暴露程度，$\mathrm{Exploit}_{maturity}\in[0,1]$ 反映是否有公开利用。当可达性为 0 时优先级理论上为 0——这正是「扫出上千条但只需修十条」的数学依据，也是不能仅按 CVSS 排序的原因。

若把 CVSS 向量视为加权模型，其形式为
$$ \mathrm{CVSS} = f\big(\mathrm{AV}, \mathrm{AC}, \mathrm{PR}, \mathrm{UI}, \mathrm{Scope}, C, I, A\big) $$
环境评分在此基础上加入改良因子（环境向量），故**同一 CVE 在不同资产上的实际优先级应当不同**。修复收益可用风险降低量度量：
$$ \Delta \mathrm{Risk} = \mathrm{CVSS}\cdot \mathrm{Exposure}\cdot\big(1 - \mathrm{Mitigation}_{residual}\big) $$
批量修复时，问题等价于在成本约束下最大化的风险削减：
$$ \max \sum_{i} x_i \cdot \Delta \mathrm{Risk}_i \quad \text{s.t.} \quad \sum_i x_i \cdot C_i \le B,\ x_i \in \{0,1\} $$
这就是漏洞修复排期的背包模型——修复能力有限时，应优先解决「高风险 × 低成本 × 高复用」（如批量升级同一基础镜像）。

## 四、代码实现
依赖与镜像扫描（工具以官方文档为准）：
```bash
# 语言生态内依赖漏洞扫描
npm audit --json > sca_node.json
pip-audit --format json > sca_py.json

# 容器与文件系统层面的组件扫描（含系统包）
trivy fs --format json -o sca_fs.json .
trivy image --severity HIGH,CRITICAL myapp:latest

# 生成 SBOM，便于事后回答「是否受影响」
syft myapp:latest -o spdx-json > sbom.spdx.json
```

按可达性与暴露度做优先级排序（示意）：
```python
# 把扫描结果与资产暴露、可达性信息合并，产出修复队列
def prioritize(findings, asset_exposure, reachable, exploited):
    queue = []
    for f in findings:
        cvss = f["cvss"]
        exposure = asset_exposure.get(f["asset"], 0.3)     # 0..1
        reach = reachable.get((f["component"], f["cve"]), 0.5)
        kev = 1.0 if f["cve"] in exploited else 0.6
        score = cvss * exposure * reach * kev
        queue.append((round(score, 2), f["cve"], f["component"], f["asset"]))
    return sorted(queue, reverse=True)

# 输出前若干条即为「先修清单」，其余进入观察池并设定复审日期
for row in prioritize(findings, exposure, reachable, kev_set)[:10]:
    print(row)
```

在 CI 中设门禁并保留例外记录：
```bash
# 仅对新增/高优漏洞阻断构建，避免历史债务一次性堵死流水线
trivy image --exit-code 1 --severity CRITICAL --ignorefile .trivyignore myapp:$GIT_SHA
```

## 五、与其他技术对比
| 维度 | SCA | SAST | DAST | 模糊测试 | 运行时防护（RASP/WAF） |
| --- | --- | --- | --- | --- | --- |
| 对象 | 第三方依赖/组件 | 自研源码 | 运行中的服务 | 输入面 | 运行中的请求 |
| 发现的漏洞 | 已知 CVE | 代码缺陷 | 可利用缺陷 | 未知崩溃/漏洞 | 已知攻击特征 |
| 时机 | 构建/上线 | 编码/提交 | 测试/预发 | 持续 | 运行时 |
| 主要局限 | 可达性缺失易高估 | 误报多 | 覆盖受限 | 成本高、需判决（triage） | 不修根因 |
| 产出 | 组件×CVE 清单 | 缺陷列表 | 漏洞报告 | 崩溃样本 | 拦截日志 |
| 与 SBOM 关系 | 依赖 SBOM 提效 | 无关 | 无关 | 无关 | 无关 |

## 六、常见误区
1. **「只扫不修」或「只修不验」**——错。没有修复闭环与复测，扫描只是产出报表。
2. **「没有 CVE 就没有漏洞」**——错。0day 与未分配编号的问题不在库中；模糊测试与代码审计是必要补充。
3. **「忽略传递依赖」**——错。深依赖链中的组件同样会被加载与调用，SBOM 必须覆盖间接依赖并区分运行期/构建期。
4. **「按 CVSS 分数排序即可」**——错。必须叠加可达性与暴露度；否则会把大量不可达的高分漏洞排在真实风险前面。
5. **「升级就万事大吉」**——错。升级需评估兼容性与回归，且要复测确认漏洞真的被消除（有时只是版本号变化）。

## 七、与开源书·权威来源对应
- MITRE CVE：漏洞统一标识体系，是跨工具协作的基础。
- FIRST CVSS：严重度评分规范，含基础/时间/环境三组向量。
- OWASP A06:2021：把「易受攻击和过时的组件」列为独立风险类别，强调依赖治理。
- NIST SP 800-40：企业补丁与漏洞管理指南，覆盖流程与度量。
- NTIA SBOM 最小元素与 SPDX / CycloneDX 规范：物料清单的格式与内容要求。
- Bryant & O'Hallaron《Computer Systems: A Programmer's Perspective》：缓冲区溢出与整数问题等底层漏洞成因。
- Tanenbaum《Modern Operating Systems》：内核与系统调用边界，理解内核漏洞（如 fuzz 发现的内存破坏）的背景。

## 八、面试题
1. **CVE 与 CVSS 是什么关系？** 要点：CVE 是标识（是哪一条），CVSS 是严重度评分（有多严重）；两者互补，均不含环境可达性。
2. **SCA / SAST / DAST 分工？** 要点：SCA 管第三方依赖的已知漏洞，SAST 管自研代码缺陷，DAST 管运行态可利用性；组合使用并配合 fuzz 覆盖未知。
3. **如何排修复优先级？** 要点：CVSS × 可达性 × 暴露度 × 在野利用；可达性为 0 的高分漏洞可降级观察但需记录复审。
4. **SBOM 的价值？** 要点：快速回答「某组件爆出漏洞时我是否受影响、影响哪些交付物」，也是供应链合规与审计的基础。
5. **为什么扫描结果常常上千条？** 要点：CVE 数增长、传递依赖膨胀、缺少可达性与环境过滤；治理靠基线、豁免与增量门禁。

## 九、演进与趋势
软件供应链治理成为主线：SBOM 从「建议」走向强制，构件签名与来源证明（如 SLSA 类框架）用于证明制品可信，漏洞信息也从 CVE 向 VEX（说明某制品是否受影响）演进，以消除「有 CVE 就等于受影响」的误判。检测侧，eBPF 等运行时技术让「组件是否真的被调用」更容易被观测，从而把可达性从估计变成测量。修复侧，自动化升级机器人、回归测试选择与虚拟补丁共同压缩修复窗口。相关标准、评分细则与工具能力**以官方最新文档为准**。

## 十、小结
漏洞管理是「持续扫描 + 可达性排序 + 修复闭环」的工程：SCA 管依赖、SAST 管自研、DAST 管运行态、模糊测试补未知，SBOM 提供「是否受影响」的即时回答，CVE/CVSS 提供通用语言。优先级必须在 CVSS 之上叠加可达性、暴露度与在野利用，才能从上千条告警中筛出真正需要今天修的那几条。把扫描接进 CI 做增量门禁、把例外显式记录并定期复审，是这套机制可持续的关键。
