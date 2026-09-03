# RTO与RPO设计

> 对应恢复目标（RTO、RPO）；DR 规划经典指标。RPO 衡量数据丢失上限。

## 一、背景与挑战

容灾投入与恢复目标需匹配业务：过严成本高，过松丢数据或久不可用。

## 二、核心原理

RTO 是恢复可用时间上限，RPO 是数据丢失时间上限；依业务定级并据此选架构。

## 三、数学形式

代价随目标收紧上升：$Cost = f(1/RTO, 1/RPO)$；需权衡。

## 四、代码实现

```python
assert target_rto <= SLA_RT0
assert target_rpo <= SLA_RPO
```

## 五、与其他对比

- 与 故障转移与Failover（达成手段）衔接。
- 与 备份与恢复（数据 RPO）共享。

## 六、常见误区

- RPO 设 0 致强同步性能崩。
- 目标定了不演练验证。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- RTO 与 RPO 区别？答：RTO 是恢复时间上限，RPO 是允许丢失的数据时间上限。

## 九、演进

无目标 → 粗略目标 → 分级量化并演练。

## 十、小结

RTO 与 RPO 把容灾需求量化，指导架构与成本取舍。
