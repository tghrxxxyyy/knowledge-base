# 优先级与SLA保障

> 对应分级服务（tiered SLA）；KServe 超时与并发。KServe 支持并发与目标利用率。

## 一、背景与挑战

不同业务或用户有不同延迟与可用性要求，需按 SLA 分层保障。

## 二、核心原理

高优请求插队或独占资源，低优可排队或降级；SLA 定义延迟上限与排队上限。

## 三、数学形式

SLA 满足率 $P(L_q+L_{inf} \le T_{sla}) \ge S_{target}$；高优优先满足。

## 四、代码实现

```python
if req.tier == "gold":
    pq.put((0, req))     # 高优置顶
else:
    pq.put((1, req))
```

## 五、与其他对比

- 与 队列调度策略（优先级）共享。
- 与 多租户隔离与配额深入（分级）衔接。

## 六、常见误区

- 高优过多致低优饿死。
- SLA 设过严致容量浪费。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- 如何保 SLA？答：按层分配优先级与资源，高优插队、低优降级，监控满足率。

## 九、演进

无分级 → 金银铜 → 弹性优先级与抢占。

## 十、小结

优先级与 SLA 把排队从公平转向业务价值保障。
