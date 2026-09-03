# 限流与SLA

> 对应 Google, *Site Reliability Engineering: SLOs*（服务等级目标）；与 网关限流深入 衔接。

## 一、背景与挑战

限流既要保护系统，又不能误伤致 SLA 违约，需量化目标。

## 二、核心原理

定义 SLO（如 99% 请求 < 800ms、拒绝率 < 1%），据此设限流阈值与降级策略，并监控违约。

## 三、数学形式

SLO 满足度 $S=1-\frac{\text{violations}}{N}\ge 0.99$；错误预算 $\text{budget}=1-SLO$。

## 四、代码实现

```python
slo_ok = (p99_lat < 800) and (reject_rate < 0.01)
if not slo_ok: adjust_limit(down=True)
```

## 五、与其他对比

- 与 服务框架深入（后端 SLA 指标）闭环。
- 与 可观测性（监控 SLO）相关。

## 六、常见误区

- 限流阈值凭经验不随负载动态调整。
- 只看可用性忽略延迟 SLO。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- 限流如何不违约 SLA？答：以 SLO 反推限流阈值，监控错误预算，超限即降级或放宽。

## 九、演进

静态阈值 → 错误预算驱动 → 自适应限流。

## 十、小结

限流需以 SLO 为准绳，在保护与可用间动态平衡。
