# DORA指标与交付效能

> 对应 Kim et al. 2016（Accelerate / The DevOps Handbook）、DORA 四年期态研发效能量化研究。

## 一、背景与挑战

「团队效率高不高」常被主观感受主导：某人提交多、某组加班多，就被认为「高效」。但这类印象既不可比较，也无法指导改进。核心挑战：

- 缺乏客观标准：用代码行数、工时被当成效能，易被博弈。
- 忽略稳定性：只追速度不顾失败率，高频却脆弱。
- 不可分档：无法判断自己是低/中/高/精英效能。
- 因果不清：哪些技术能力真正驱动效能提升？

DORA（DevOps Research and Assessment）用四个客观指标把「效能」变成可度量、可比较、可改进的 Engineering 主题。

## 二、核心原理

DORA 用四个关键指标衡量软件交付与运维效能：

1. 部署频率（DF, Deployment Frequency）：代码部署到生产的频次。
2. 变更前置时间（LT, Lead Time for Changes）：从提交到成功生产运行的时间。
3. 变更失败率（CFR, Change Failure Rate）：部署导致失败/回滚的比例。
4. 服务恢复时间（MTTR, Time to Restore Service）：故障到恢复的中位时长。

高效能团队四项均显著更优：按需每日多次部署、LT 小于一小时、CFR 0–15%、MTTR 小于一小时。这四项兼顾「速度」与「稳定性」，是结果指标而非过程指标。

（落地补充：）
- DORA 应作改进诊断而非奖惩 KPI，避免诱发造假。
- 接入实时仪表盘，按团队展示档位与趋势。
- 聚焦哪些技术能力（自动化测试、按需环境、监控）在拖后腿。
- 据此排定改进项，而非横向排名施压。
- 稳定性与速度须联合观察，单看频率会掩盖脆弱。

## 三、形式化与数学基础

指标集合 $M = \{DF, LT, CFR, MTTR\}$。效能档位由各自分位决定。以精英组经验区间：

$$ DF \ge \text{每日多次},\quad LT < 1\text{h},\quad CFR\in[0,0.15],\quad MTTR < 1\text{h} $$

前置时间（lead time）与周期时间（cycle time）区别：前者从「请求/提交」算起，后者从「开始开发」算起，即：

$$ LT = t_{\text{deploy}} - t_{\text{commit}},\quad CT = t_{\text{deploy}} - t_{\text{start\_dev}} $$

稳定性与速度须联合观察，单看频率会掩盖脆弱。

## 四、代码实现

```python
# 从部署与事件系统聚合 DORA 四项指标
def compute_dora(deploys, prs, incidents, window=7):
    df = len([d for d in deploys if in_window(d, window)])      # 部署频率
    lt = median((d.merged_at - d.first_commit).seconds for d in prs)  # 前置时间
    cfr = failed_deploys(deploys) / max(len(deploys), 1)        # 变更失败率
    mttr = median((i.resolved_at - i.opened_at).seconds for i in incidents)  # 恢复时间
    return {"DF": df, "LT(h)": lt/3600, "CFR": cfr, "MTTR(h)": mttr/3600}

metrics = compute_dora(deploys, prs, incidents)
print(metrics)  # 对照档位判断是否高绩效
```

## 五、与其他技术对比

| 维度 | 代码行数等虚荣指标 | DORA 四项 |
| --- | --- | --- |
| 关注 | 过程/产量 | 价值流动 + 稳定性 |
| 可博弈 | 高 | 低（需真实运行） |
| 性质 | 虚荣指标 | 结果指标 |
| 指导改进 | 弱 | 强（指向能力与实践） |

## 六、常见误区

- 「用个人提交数代替团队效能」：忽略了协作与稳定。
- 「只看频率不顾失败率」：高频但脆弱，不是高效能。
- 「追求零失败率牺牲速度」：健康区间 CFR 0–15%，过度谨慎也低效。
- 「把 DORA 当 KPI 强考核」：会诱发造假，应作改进诊断。

## 七、与开源书·权威来源对应

- Kim et al., *Accelerate*（2016/2018）：通过多年实证研究建立 DORA 指标体系与效能档位。
- The DevOps Handbook：能力（持续交付、按需环境、监控）驱动高绩效。
- 参见「基础知识/团队工程效能深入/度量陷阱与虚荣指标」「研发流程度量与Flow」。

## 八、面试题

- 为什么 DORA 选这四个指标？它们如何兼顾速度与稳定？
- 前置时间（lead time）与周期时间（cycle time）有何区别？
- 变更失败率是不是越低越好？为什么？

## 九、演进与趋势

从「四项指标」到「细化为可靠性/软件交付效能更多维度」；趋势是与 SLO、可靠性工程（SRE）结合，把 DORA 接入实时仪表盘，并纳入平台工程的自服务观测。

## 十、小结

DORA 用四项客观指标把「效能」从感性讨论变为可度量、可比较、可改进的工程主题。兼顾速度与稳定性的结果指标，是诊断交付能力、对齐改进方向的共同语言。
