# 告警与SLO治理

> 对应 SLO、SLI、错误预算（Google SRE）；Prometheus Alertmanager。SRE 书定义错误预算。

## 一、背景与挑战

无告警则故障靠用户报；告警过多则狼来了，需基于 SLO 的精准告警。

## 二、核心原理

定 SLI（如成功率、p99），设 SLO 目标与错误预算；超阈值或烧预算过快则告警。

## 三、数学形式

错误预算 $B = 1 - SLO$；消耗率 $burn = \frac{1-SLI_{win}}{1-SLO}$，快烧即告警。

## 四、代码实现

```python
alert if p99_latency > 2s for 5m
alert if error_budget_burn_rate > 14.4
```

## 五、与其他对比

- 与 指标监控体系（SLI 来源）衔接。
- 与 灰度评估指标（上线门槛）共享。

## 六、常见误区

- SLO 过严致频繁误告。
- 只告告警不告用户影响。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 错误预算作用？答：量化可接受失误，预算快烧触发告警，平衡稳定与迭代。

## 九、演进

无 → 静态阈值 → SLO 与错误预算。

## 十、小结

告警基于 SLO 与错误预算，既保稳定又不过度打扰。
