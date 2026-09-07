# STRIDE威胁建模模型

> 对应 Howard & LeBlanc (Microsoft) STRIDE / OWASP Threat Modeling。

## 一、背景与挑战
安全设计若事后补洞成本高。STRIDE 在架构阶段系统性枚举威胁，把"攻击者会怎么打"落到数据流每个节点。

## 二、核心原理
STRIDE 六类：Spoofing(伪装)、Tampering(篡改)、Repudiation(抵赖)、Information Disclosure(信息泄露)、Denial of Service(拒绝服务)、Elevation of Privilege(提权)。每类对应安全属性(认证、完整、不可否认、机密、可用、授权)。

## 三、形式化与数学基础
六类映射到 CIA+ 属性：
$$ S\to Auth,\ T\to Integ,\ R\to NonRep,\ I\to Conf,\ D\to Avail,\ E\to Author $$
威胁计数 $N = \sum_{c\in STRIDE} n_c$，按出现频率排优先级。

## 四、代码实现
```python
# 简易 STRIDE 检查清单核对每个数据流元素
STRIDE = ["Spoofing","Tampering","Repudiation","InfoDisclosure","DoS","EoP"]
flow_elements = ["web_ui","api","db"]
for e in flow_elements:
    for t in STRIDE:
        print(f"[{e}] 检查 {t} 的威胁与缓解")
```

## 五、与其他技术对比
STRIDE 偏设计阶段枚举；DREAD 偏风险打分；ATT&CK 偏攻击者战术。STRIDE 更像结构化的"找问题"框架。

## 六、常见误区
把 STRIDE 当漏洞扫描器——它产出威胁假设而非证据。只列不评优先级导致列表泛滥。

## 七、与开源书/权威来源对应
Howard & LeBlanc《Writing Secure Code》；OWASP Threat Modeling Cheat Sheet。

## 八、面试题
STRIDE 六类？各自破坏什么属性？何时用 STRIDE？

## 九、演进与趋势
STRIDE 与 DevSecOps 流水线结合，自动化 DFD 提取威胁。

## 十、小结
STRIDE 以六类威胁对架构逐元素枚举，把安全左移，是威胁建模基石方法。
