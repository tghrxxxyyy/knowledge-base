# 故障转移与Failover

> 对应故障检测与切换（health check、failover）；K8s 跨区故障转移。负载均衡器做健康检查。

## 一、背景与挑战

某区域不可用时需快速把流量切到健康区域，切换慢则体验中断。

## 二、核心原理

健康探测持续检查区域状态，异常即把权重从故障区迁到健康区；结合熔断防抖动。

## 三、数学形式

切换延迟 $T_{failover}$ 应小于 $RTO$；探测间隔 $I$ 决定检测速度。

## 四、代码实现

```python
if not health(region):
    lb.set_weight(region, 0)
    lb.set_weight(backup, 100)
```

## 五、与其他对比

- 与 容灾总览（目标）衔接。
- 与 自动回滚机制（单区恢复）对照层级。

## 六、常见误区

- 探测间隔过长致检测慢。
- 切换抖动（flapping）反复横跳。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- Failover 要点？答：健康探测、秒级迁权重、防抖动与脑裂。

## 九、演进

手动 → 健康探测自动 → 多指标智能切换。

## 十、小结

故障转移把单区故障影响限制在检测与切换窗口内。
