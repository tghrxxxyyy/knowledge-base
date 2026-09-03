# 延迟SLA与调度

> 对应 Google, *SRE: Service Level Objectives*；与 优先级调度深入 / 网关限流深入 衔接。

## 一、背景与挑战

不同用户/任务有不同延迟 SLA，调度须尽量满足各自目标。

## 二、核心原理

按 SLA 紧急度（剩余时间预算）提升优先级，临近违约者优先执行；用老化防止长期等待。

## 三、数学形式

动态优先级 $p_i(t)=p_{base,i}+\alpha(\text{SLA}_i-t_{wait,i})$；违约风险高者 $p$ 升。

## 四、代码实现

```python
for r in queue:
    r.dyn_prio = r.base + alpha*(r.sla - (now - r.arrival))
run(sorted(queue, key=lambda r: -r.dyn_prio))
```

## 五、与其他对比

- 与 网关限流深入（SLA 阈值设定）闭环。
- 与 可观测性（监控 SLA）呼应。

## 六、常见误区

- 静态 SLA 不分场景致资源错配。
- 老化系数过大致优先级失真。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- 如何用调度保 SLA？答：按剩余 SLA 预算动态升优先级并加老化，临近违约者先执行。

## 九、演进

固定优先级 → SLA 感知 → 预测式调度。

## 十、小结

延迟 SLA 驱动动态优先级，是调度从“公平”走向“目标导向”的关键。
