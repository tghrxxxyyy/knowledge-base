# DREAD与CVSS风险评分

> 对应 Howard & LeBlanc《Writing Secure Code》中的 DREAD 模型、FIRST CVSS 规范（v3.1 与 v4.0）、NIST SP 800-30 风险评估指南，以及 OWASP Risk Rating Methodology。

## 一、背景与挑战
一次威胁建模会产出几十上百条威胁，资源有限必须排序。若只凭直觉，会出现两种失效：把高危但「感觉不严重」的问题排到后面，或把低危但讨论热烈的问题排到前面。量化评分的目的是把主观判断显式化、可比较、可追溯，以支撑优先级决策与跨团队沟通。

## 二、核心原理
DREAD 是五维主观评分，每维 1–10 分：
- Damage（破坏潜力）：攻陷后能造成多大损失。
- Reproducibility（可复现性）：攻击是否稳定可重复。
- Exploitability（可利用性）：所需技能、工具与前置条件。
- Affected Users（影响面）：受影响的用户或资产比例。
- Discoverability（可发现性）：攻击者发现该问题的难易。

注意方向一致性：Exploitability 与 Discoverability 的语义是「越容易则分越高」，评分时必须统一为「风险越高分越高」，否则会算反。

CVSS 由三组度量构成：
- 基础度量（Base）：与时间、环境无关的固有严重度，含利用途径、利用复杂度、所需权限、用户交互、影响（机密性/完整性/可用性）与范围（Scope）。
- 时序度量（Temporal）：随时间和情报变化，含利用代码成熟度、修复级别、报告置信度。
- 环境度量（Environmental）：针对具体部署的资产重要性与缓解措施调整。

CVSS v3.x 引入 Scope 区分是否跨安全域，基础分由 Impact Sub-Score 与 Exploitability Sub-Score 组合；v4.0 做了体系性重构，引入更细的度量组与更明确的可预测性表达。具体公式与度量项以 FIRST 官方最新规范为准。

## 三、形式化与数学基础
DREAD 简单均分与加权形式：

$$R = \frac{D + R_e + E + A + D_i}{5},\qquad R_w = \frac{\sum_k w_k x_k}{\sum_k w_k}$$

CVSS v3.x 的评分结构：先算影响子分（受 Scope 影响），再与可利用性子分组合：

$$\mathrm{ISS} = 1 - (1-C)(1-I)(1-A)$$

$$\mathrm{Impact} = \begin{cases} 6.42 \cdot \mathrm{ISS}, & \text{Scope 不变} \\ 7.52(\mathrm{ISS}-0.029) - 3.25(\mathrm{ISS}-0.02)^{15}, & \text{Scope 改变} \end{cases}$$

$$\mathrm{Exploitability} = 8.22 \cdot AV \cdot AC \cdot PR \cdot UI$$

$$\mathrm{BaseScore} = \begin{cases} 0, & \mathrm{Impact} \le 0 \\ \mathrm{Roundup}\big(\min(\mathrm{Impact} + \mathrm{Exploitability},\ 10)\big), & \text{Scope 不变} \\ \mathrm{Roundup}\big(\min(1.08 (\mathrm{Impact} + \mathrm{Exploitability}),\ 10)\big), & \text{Scope 改变} \end{cases}$$

业务风险需在技术分之外叠加资产价值、暴露面与现有缓解：

$$R_{biz} = f(\mathrm{CVSS},\ \text{资产价值},\ \text{暴露面},\ \text{缓解有效性})$$

## 四、代码实现
```python
# DREAD 加权评分（统一为「分越高风险越大」的方向）
WEIGHTS = {"damage": 1.2, "repro": 1.0, "exploit": 1.0, "affected": 1.3, "discover": 0.8}

def dread(damage, repro, exploit, affected, discover, weights=None):
    w = weights or WEIGHTS
    assert all(1 <= v <= 10 for v in (damage, repro, exploit, affected, discover))
    num = (w["damage"] * damage + w["repro"] * repro + w["exploit"] * exploit
           + w["affected"] * affected + w["discover"] * discover)
    return num / sum(w.values())

print("DREAD =", round(dread(9, 8, 7, 6, 5), 2))

# CVSS v3.x 基础分结构化计算（度量档位简化为示例值）
def roundup(x):
    i = int(x)
    return i + 1 if x > i else i

def cvss3_base(scope_changed, av, ac, pr, ui, c, i, a):
    iss = 1 - (1 - c) * (1 - i) * (1 - a)
    if not scope_changed:
        impact = 6.42 * iss
    else:
        impact = 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15
    if impact <= 0:
        return 0.0
    exploit = 8.22 * av * ac * pr * ui
    raw = (1.08 if scope_changed else 1.0) * (impact + exploit)
    return roundup(min(raw, 10))

print("CVSS base =", cvss3_base(False, 0.85, 0.77, 0.85, 0.85, 0.56, 0.56, 0.0))
```

## 五、与其他技术对比

| 维度 | DREAD | CVSS v3.1/v4.0 | OWASP 风险评级 | 纯专家判断 |
|---|---|---|---|---|
| 输入维度 | 五维主观 | 基础/时序/环境三组 | 威胁/影响双因素 | 无固定维度 |
| 含业务上下文 | 部分 | 需环境度量补充 | 强，含业务影响 | 隐含 |
| 可复现性 | 低 | 高，有规范公式 | 中 | 最低 |
| 跨组织可比 | 差 | 好 | 中 | 差 |
| 计算复杂度 | 低 | 中高，需查表 | 中 | 无 |
| 典型用途 | 早期快速排序 | 漏洞严重度通报 | 应用风险评估 | 兜底 |

## 六、常见误区
误区一：把 DREAD 五维简单均分当公理。业务中 Affected Users 与 Damage 常应加权更高，等权会系统性低估影响面大的问题。
误区二：认为 CVSS 高分等于业务高风险。基础分不含资产价值与现有缓解，必须结合环境度量或业务权重。
误区三：把 CVSS 基础分当最终分。忽略时序度量（利用代码是否公开）与环境度量会导致优先级失真。
误区四：把 DREAD 的 Exploitability 当作「越难越高」。该维度是「越好利用分越高」，方向搞反会得到相反排序。

## 七、与开源书·权威来源对应
- Howard & LeBlanc《Writing Secure Code》：DREAD 模型的原始出处与其在 STRIDE 之后的使用方式。
- FIRST CVSS 规范（v3.1 与 v4.0）：度量组、取值档位与评分公式的唯一权威来源，版本差异以官方最新规范为准。
- NIST SP 800-30《Guide for Conducting Risk Assessments》：定性与半定量风险评估方法论，强调风险与业务目标绑定。

## 八、面试题
1. DREAD 的五维是什么？最大局限是什么？
   要点：破坏、可复现、可利用、影响面、可发现；局限是主观且默认等权，跨组织不可比。
2. CVSS 的三组度量分别解决什么？
   要点：基础度量刻画内在严重度；时序度量反映随时间与情报的变化；环境度量适配具体部署。
3. 为什么不能只看 CVSS 分数排优先级？
   要点：基础分不含业务价值、资产重要性与现有缓解，需用环境度量或业务权重修正。
4. CVSS v3.x 中 Scope 的作用？
   要点：区分是否跨安全域，影响子分计算方式与最终组合公式，跨域时更严重。

## 九、演进与趋势
CVSS v4.0 对度量体系做了重构，引入更细的度量组与对「被利用后后果」的更明确表达，并增强对自动化消费的友好度；实际采用进度因生态兼容性而参差，以 FIRST 官方最新规范为准。风险评分正与威胁情报实时联动，在野利用与 PoC 公开会驱动时序度量动态变化。工程上评分越来越多被嵌入工单系统与 CI 门禁，带来阈值调优与误报治理的新问题。

## 十、小结
DREAD 与 CVSS 是互补的量化工具：DREAD 轻量、贴合业务、适合建模早期快速排序；CVSS 标准化、可复现、适合跨组织的漏洞严重度沟通。二者共有的边界是——它们描述技术严重度，真正的优先级必须再把资产价值、暴露面与现有缓解代入，用残余风险排序，并随时间与情报变化周期性复核。
