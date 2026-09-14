# STRIDE威胁建模模型

> 对应 Howard & LeBlanc《Writing Secure Code》与 Microsoft SDL 中 STRIDE 的原始定义、Shostack《Threat Modeling: Designing for Security》，以及 OWASP Threat Modeling Cheat Sheet。

## 一、背景与挑战
安全设计若事后补洞，成本高且往往只能打补丁而非改结构。STRIDE 的价值在于把「攻击者会怎么打」变成一条可执行的枚举流程：对数据流图上的每个元素，逐类检查六种威胁，把抽象的「要注意安全」落成具体的威胁假设与缓解措施。它的定位是**结构化的找问题框架**，不是漏洞扫描器。

## 二、核心原理
| 缩写 | 威胁 | 破坏的属性 | 典型例子 |
|------|------|-----------|---------|
| S | Spoofing 伪装 | 认证 Authenticity | 伪造令牌、重放登录 |
| T | Tampering 篡改 | 完整性 Integrity | 改请求参数、改数据库记录 |
| R | Repudiation 抵赖 | 不可否认性 Non-repudiation | 无审计的业务操作、日志可删 |
| I | Information Disclosure 信息泄露 | 机密性 Confidentiality | 报错回显、越权读接口 |
| D | Denial of Service 拒绝服务 | 可用性 Availability | 资源耗尽、放大攻击 |
| E | Elevation of Privilege 权限提升 | 授权 Authorization | 越权调用、注入后执行 |

STRIDE 是**逐元素**而非逐系统应用的。不同元素类型有其高频威胁分布：
- 外部实体：主要是 Spoofing 与 Repudiation。
- 进程：六类几乎都可能，重点在 Tampering、EoP、DoS。
- 数据存储：Tampering、Information Disclosure、Repudiation。
- 数据流：Tampering、Information Disclosure、DoS。

与信任边界结合时，跨边界流要优先检查全部六类，因为边界处的输入可能被完全控制。优先级方面，STRIDE 只负责枚举，需再用 DREAD 或 CVSS 排序，或用攻击树补充路径视角。

## 三、形式化与数学基础
六类威胁与安全属性的映射：

$$S \to \mathrm{Auth},\quad T \to \mathrm{Integ},\quad R \to \mathrm{NonRep},\quad I \to \mathrm{Conf},\quad D \to \mathrm{Avail},\quad E \to \mathrm{Author}$$

设 DFD 元素集合 $E$，第 $c$ 类威胁在元素 $e$ 上的候选数为 $n_c(e)$，威胁总数：

$$N = \sum_{e \in E} \sum_{c \in \mathrm{STRIDE}} n_c(e)$$

覆盖率度量：设元素应检查类别集合 $C(e)$（由元素类型决定）、已记录结论集合 $C'(e)$：

$$\mathrm{Coverage} = \frac{\sum_e |C'(e)|}{\sum_e |C(e)|}$$

把 Coverage 推到 1 可避免「只看了 Spoofing 与 EoP」这类系统性遗漏。缓解有效性用残余风险表达：

$$R_{resid}(t) = R_0(t) \cdot \prod_{m \in M_t} (1 - e_m)$$

连乘形式说明边际递减，这解释了为什么「一个针对性强的控制」通常优于「堆多个弱控制」。

## 四、代码实现
```python
# 按 DFD 元素类型选择应检查的 STRIDE 类别，逐条记录威胁假设
ELEMENT_THREATS = {
    "external_entity": ["Spoofing", "Repudiation"],
    "process": ["Spoofing", "Tampering", "Repudiation",
                "InfoDisclosure", "DoS", "ElevationOfPrivilege"],
    "data_store": ["Tampering", "Repudiation", "InfoDisclosure"],
    "data_flow": ["Tampering", "InfoDisclosure", "DoS"],
}
DFD = [
    {"name": "浏览器", "kind": "external_entity"},
    {"name": "订单API", "kind": "process", "crosses_boundary": True},
    {"name": "订单库", "kind": "data_store"},
    {"name": "API->库", "kind": "data_flow", "crosses_boundary": True},
]
MITIGATION = {
    "Spoofing": "强认证、双向证书、防重放令牌",
    "Tampering": "签名/MAC、参数化查询、结构校验",
    "Repudiation": "不可篡改审计日志、操作签名",
    "InfoDisclosure": "最小返回字段、字段级加密、错误脱敏",
    "DoS": "限流、配额、超时与体积上限",
    "ElevationOfPrivilege": "每次访问授权、最小权限、白名单",
}

def enumerate_threats(dfd):
    return [{"element": e["name"], "stride": c,
             "priority": "high" if e.get("crosses_boundary") else "normal",
             "mitigation": MITIGATION[c]}
            for e in dfd for c in ELEMENT_THREATS[e["kind"]]]

for f in enumerate_threats(DFD):
    print(f"[{f['priority']}] {f['element']} | {f['stride']} | {f['mitigation']}")
```

## 五、与其他技术对比

| 维度 | STRIDE | DREAD | ATT&CK | 攻击树 |
|---|---|---|---|---|
| 定位 | 结构化枚举威胁 | 风险打分 | 攻击者战术技术库 | 目标分解与路径 |
| 阶段 | 设计期为主 | 设计/评估期 | 运营与检测 | 设计/评估期 |
| 输出 | 威胁清单与缓解 | 每威胁一个分值 | TTP 映射 | AND/OR 逻辑树 |
| 是否排序 | 否，需外部方法 | 是 | 弱 | 是，可量化 |
| 视角 | 资产与数据流 | 严重度 | 攻击者行为 | 攻击者目标 |
| 主要局限 | 只枚举不排序、依赖完备性 | 主观权重 | 偏已知 TTP | 概率主观、易爆炸 |

## 六、常见误区
误区一：把 STRIDE 当漏洞扫描器。它产出威胁假设与缓解决策，需后续用测试或审计验证。
误区二：只列不评优先级。不做排序会产生上千条目，团队无法行动，模型最终被弃用。
误区三：只对进程做 STRIDE。外部实体、数据存储、数据流各有高频类别，只查进程会系统性遗漏。
误区四：认为威胁与元素的对应是等概率的。不同元素类型有显著不同的威胁分布，这是提效的先验知识。

## 七、与开源书·权威来源对应
- Howard & LeBlanc《Writing Secure Code》：STRIDE 的原始定义与与 DFD 结合的使用方式，是分类学的权威来源。
- Microsoft SDL 官方指南：把 STRIDE 作为设计阶段门禁的工程化落地方式，具体流程以官方最新文档为准。
- OWASP Threat Modeling Cheat Sheet：面向应用团队的枚举清单与检查表。
- Shostack《Threat Modeling: Designing for Security》：四问框架，说明 STRIDE 在整个建模流程中的位置与局限。

## 八、面试题
1. STRIDE 六类分别破坏什么安全属性？
   要点：伪装破坏认证、篡改破坏完整性、抵赖破坏不可否认性、信息泄露破坏机密性、拒绝服务破坏可用性、提权破坏授权。
2. STRIDE 为什么强调逐元素枚举而不是逐系统？
   要点：不同 DFD 元素的高频威胁类别不同，逐元素能显著降低漏报并提高效率。
3. STRIDE 与 DREAD、CVSS 的关系？
   要点：STRIDE 负责枚举威胁假设，DREAD/CVSS 负责量化排序，二者串联使用。
4. 什么时候适合用 STRIDE？
   要点：架构成型或变更时，用于系统性枚举设计层威胁并驱动安全需求；不适合直接找实现漏洞。

## 九、演进与趋势
STRIDE 正在与 DevSecOps 流水线结合：把 DFD 与威胁条目做成代码或配置，随架构变更增量更新，并在 MR 阶段提示未覆盖的元素与类别。自动化 DFD 提取（从 IaC、服务网格配置、代码注解）降低了维护成本，使覆盖率检查可以像测试一样自动运行。云原生语境下，其应用对象从单个系统扩展到每一次跨服务调用与身份边界。具体工具与实践以官方最新文档为准。

## 十、小结
STRIDE 是把安全左移的具体抓手：用六类威胁对数据流图逐元素枚举，产出带缓解措施的威胁假设清单，再用 DREAD/CVSS 排序、用攻击树补路径视角。它的三条工程纪律是——逐元素而非逐系统、按元素类型选择重点类别、必须排序否则无法行动。理解它的边界（产出假设而非证据、依赖枚举完备性）比记住六个缩写更重要。
