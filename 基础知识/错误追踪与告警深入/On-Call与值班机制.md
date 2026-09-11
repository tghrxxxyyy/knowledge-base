# On-Call与值班机制

> 对应 Beyer 2016《Site Reliability Engineering》(Google)、Kim et al. 2016《DevOps Handbook》与 Allspaw 2012《Blameless PostMortems》。

## 一、背景与挑战

系统 7×24 小时运行，故障可能发生在任何时刻。若没有明确的值班（on-call）与升级（escalation）机制，最常见的两种失败是：没人响应（告警发了却无人认领）、响应混乱（多人重复处理或互相等待）。

On-Call 机制要回答三个问题：谁在什么时候负责、多久内必须响应、无人响应时如何升级。它既是技术安排，也是组织文化——尤其在复盘环节，是否「无责（blameless）」直接决定团队会不会隐瞒问题。

## 二、核心原理

一个健全的 on-call 机制包括：

- **轮班表（rotation）**：明确主值班与备值班，避免单点失联；跨时区团队采用跟随太阳的交接。
- **响应时限（ACK/SLA）**：按级别定义确认时限，如 P0 5 分钟 ACK、P1 30 分钟；
- **升级路径（escalation）**：未在规定时间内 ACK 或未解决时，自动通知上级或二线专家，保证必有响应；
- **可操作告警**：值班收到的每条告警都应有 runbook，避免临场摸索；
- **无责复盘（postmortem）**：故障后分析系统与流程的缺陷，而非追究个人；
- **负荷管理**：限制单次值班的告警量与夜间打扰，防止 burnout。

核心原则是：**升级不是惩罚，而是保证响应的机制**；**复盘的目的不是找责任人，而是找系统改进点**。

## 三、形式化与数学基础

设告警级别 $L$ 对应确认时限 $t(L)$，严重度越高时限越短。定义升级函数：若在 $t(L)$ 内未收到 ACK，则通知下一级：

$$
\text{escalate}(a, \Delta t) = \begin{cases} \text{notify}(a, \text{primary}), & \Delta t \le t(L) \\ \text{notify}(a, \text{secondary}), & \Delta t > t(L) \end{cases}
$$

这一机制保证「必有响应」：只要升级链非空且各级可达，告警最终会落到有人身上。

衡量值班效能的关键指标是平均确认时间与平均恢复时间：

$$
\text{MTTA} = \frac{1}{|A|}\sum_{a \in A} (t_{\text{ack}}(a) - t_{\text{fire}}(a)),\qquad
\text{MTTR} = \frac{1}{|A|}\sum_{a \in A} (t_{\text{resolve}}(a) - t_{\text{fire}}(a))
$$

值班质量的目标是同时压低 MTTA（快速认领）与 MTTR（快速恢复）。可用性也可由此近似：

$$
A \approx \frac{\text{MTBF}}{\text{MTBF} + \text{MTTR}}
$$

即缩短 MTTR 是提升可用性最直接的杠杆之一，而 on-call 机制正是缩短 MTTR 的组织保障。

## 四、代码实现

```yaml
# Alertmanager 值班路由与升级配置
route:
  receiver: primary-oncall
  group_by: ["alertname", "service"]
  repeat_interval: 5m          # 未 ACK 每 5 分钟重复提醒
  routes:
    - match:
        severity: P0
      receiver: p0-pager       # P0 走电话/短信
      continue: true

receivers:
  - name: primary-oncall
    pagerduty_configs:
      - service_key: "<key>"
        # 15 分钟未响应则升级到二线
        # 具体字段以 PagerDuty 官方文档为准
  - name: p0-pager
    webhook_configs:
      - url: "https://pager.internal/notify"

# 升级策略示意（伪配置）
# escalation_policy:
#   - level: 1, target: primary-oncall,  ack_within: 5m
#   - level: 2, target: secondary-oncall, ack_within: 10m
#   - level: 3, target: engineering-lead, ack_within: 15m
```

## 五、与其他技术对比

| 机制 | 解决的问题 | 关键度量 | 主要风险 |
| --- | --- | --- | --- |
| 轮班表 | 明确谁负责 | 覆盖率、交接质量 | 单人失联断档 |
| ACK 时限 | 保证被认领 | MTTA | 时限过严导致形式化 |
| 升级路径 | 避免无人响应 | 升级率 | 过度升级打扰他人 |
| Runbook/ChatOps | 降低处置门槛 | 一线自解决率 | 文档陈旧失效 |
| 无责复盘 | 持续改进 | 行动项完成率 | 变成追责致隐瞒 |
| 负荷管理 | 防止 burnout | 值班打扰次数 | 与告警质量耦合 |

## 六、常见误区

- **值班无备份**：单人休假或失联即出现响应真空，必须设主备。
- **复盘变成追责**：一旦追究个人，信息会被隐瞒，系统性根因再也查不出。
- **只升级不闭环**：升级后若无跟进与复盘，同类故障会反复发生。
- **告警量失控**：值班夜夜被打扰，人很快就对告警免疫，机制形同虚设。
- **把 on-call 当惩罚**：应被视为工程职责与成长机会，并以负荷上限保护。
- **忽略交接**：跨时区值班若交接不清，故障上下文丢失、重复排查。

## 七、与开源书·权威来源对应

Beyer 2016《Site Reliability Engineering》(Google) 系统讨论 on-call、升级策略、无责复盘与值班负荷管理；Kim et al. 2016《The DevOps Handbook》强调共享责任与从故障中学习；Allspaw 2012《Blameless PostMortems》奠定了无责复盘的理论基础。具体轮班与时限设计以各组织官方最新实践为准。

## 八、面试题

- **问：如何设计升级路径避免漏响应？** 答：为每级设定 ACK 时限，超时自动通知下一级，并保证升级链非空、联系方式可达。
- **问：复盘为什么必须无责？** 答：只有不追究个人，参与者才会如实披露细节，才能找到系统性根因与改进点。
- **问：如何衡量 on-call 健康度？** 答：看 MTTA、MTTR、每人每班告警数、夜间打扰次数与升级率。
- **问：一线如何快速处置常规故障？** 答：提供可执行的 runbook 与 ChatOps 命令，把常见故障标准化。

## 九、演进与趋势

On-Call 正朝「少打扰、快恢复」演进：自动化 runbook 与 ChatOps 让一线按指引自助处置；告警质量治理与根因归并减少夜间噪声；故障演练（GameDay）与混沌工程提前暴露薄弱环节。组织层面，值班负荷被纳入工程健康指标，过载会触发系统改进而非要求个人硬扛。

## 十、小结

On-Call 机制把「谁响应、何时升级、如何复盘」制度化，是稳定性的组织保障。其有效性取决于三点：升级链保证必有响应、runbook 保证可处置、无责复盘保证持续改进。制度之外，控制值班负荷与保护工程师注意力，同样是机制长期可持续的前提。
