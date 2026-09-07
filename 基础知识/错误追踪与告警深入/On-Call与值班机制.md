# On-Call与值班机制

> 对应 Kim et al. 2016 (Accelerate / The DevOps Handbook)。

## 一、背景与挑战
系统随时可能故障，缺乏明确的值班与升级机制会导致"没人响应"或"响应混乱"，延长故障时长。

## 二、核心原理
建立轮班表、明确响应时限（如 P0 5 分钟 ACK）、升级路径（一线 -> 二线专家）、事后无责复盘（Postmortem），形成闭环。

## 三、形式化与数学基础
设告警级别 L 对应 ACK 时限 t(L)：L 越高 t 越短。升级函数 escalate(a, dt) 在未 ACK 超过 t 时通知上级，保证必有响应。

## 四、代码实现
```yaml
# 值班与升级示例
routes:
  - match: { severity: P0 }
    receiver: primary-oncall
    repeat_interval: 5m      # 5 分钟未响应持续提醒
    escalate_after: 15m      # 升级到二线
```

## 五、与其他技术对比
相比无组织响应，机制化 on-call 缩短 MTTA；但过度频繁打扰会降低效率，需与告警质量配合。

## 六、常见误区
- 值班无备份，单人失联即断档。
- 复盘变成追责，导致隐瞒问题。

## 七、与开源书/权威来源对应
The DevOps Handbook 强调无责复盘与共享责任的文化基础。

## 八、面试题
如何设计升级路径避免漏响应？复盘为什么必须无责？

## 九、演进与趋势
自动化 runbook 与 ChatOps 让一线能按指引快速处置常规故障。

## 十、小结
On-Call 机制把"谁响应、何时升、如何复盘"制度化，是稳定性的组织保障。
