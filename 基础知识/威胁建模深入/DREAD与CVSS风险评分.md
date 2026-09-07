# DREAD与CVSS风险评分

> 对应 Howard & LeBlanc DREAD / FIRST CVSS v3.1 规范。

## 一、背景与挑战
评估大量威胁需量化比较。DREAD 给每个威胁打五维分；CVSS 提供标准化漏洞严重度，便于跨团队沟通。

## 二、核心原理
DREAD：Damage(破坏)、Reproducibility(复现)、Exploitability(利用难度)、Affected users(影响面)、Discoverability(可发现性)，各 1-10 分，平均得风险。CVSS 由基础/时序/环境三组度量算 0-10 分。

## 三、形式化与数学基础
DREAD 均分：
$$ R = \frac{D+R+E+A+D'}{5} $$
CVSS 基础分(简化)：
$$ Score = Roundup(10 \times ISS \times AV\times AC\times \dots) $$

## 四、代码实现
```python
# DREAD 简单加权评分
def dread(d,r,e,a,disc):
    return (d+r+e+a+disc)/5.0
risk = dread(d=9,r=8,e=7,a=6,disc=5)
print("风险分", risk)   # 越高越优先处理
```

## 五、与其他技术对比
DREAD 主观但贴合业务；CVSS 标准化但偏技术严重度，不含业务上下文。常结合使用。

## 六、常见误区
DREAD 各维权重相等未必合理。CVSS 高分不等于业务高风险(需环境度量)。

## 七、与开源书/权威来源对应
Howard & LeBlanc《Writing Secure Code》；FIRST CVSS v3.1 规范文档。

## 八、面试题
DREAD 五维？CVSS 三组分？为何不能只看 CVSS？

## 九、演进与趋势
CVSS v4 增加可预测性与自动化；风险评分与威胁情报实时联动。

## 十、小结
DREAD/CVSS 把威胁量化，支撑优先级决策，但需结合业务与环境度量。
