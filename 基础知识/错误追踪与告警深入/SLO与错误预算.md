# SLO与错误预算

> 对应 Kim et al. 2016 (Accelerate / The DevOps Handbook)。

## 一、背景与挑战
追求 100% 可用既不经济也不可行，需要在可靠性与迭代速度间找到可量化的平衡点。

## 二、核心原理
SLO 是目标可靠性（如 99.9%），错误预算 = 1 - SLO 允许的失效额度。预算耗尽则冻结非必要变更，优先修复稳定性。

## 三、形式化与数学基础
设窗口内请求总数 N，失败数 F。实际可用 A = 1 - F/N。剩余预算 B = SLO - A。当 B <= 0，触发发布冻结策略。

## 四、代码实现
```python
slo = 0.999
window_requests = 1_000_000
allowed = int((1 - slo) * window_requests)   # 允许 1000 次失败
budget_left = allowed - actual_failures
if budget_left <= 0:
    freeze_noncritical_deploys()
```

## 五、与其他技术对比
相比单纯 SLI 监控，SLO 把可靠性变成可消耗的预算，连接了稳定性与交付节奏。

## 六、常见误区
- SLO 设得过高导致预算形同虚设，团队永远不敢发。
- 只盯月度聚合，忽略短时严重超标。

## 七、与开源书/权威来源对应
Accelerate/DevOps Handbook 把 SLO 与错误预算作为风险权衡的工程实践。

## 八、面试题
错误预算耗尽后该怎么做？SLO 与 SLI 的关系？

## 九、演进与趋势
多窗口多燃烧率告警（Multi-window Burn Rate）更灵敏地捕捉预算快速消耗。

## 十、小结
SLO 与错误预算把"可靠性"变成可管理的资源，平衡稳定与速度。
