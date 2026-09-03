# 弹性与 K8s HPA 对比

> 对应 HPA vs 自定义弹性（KEDA/自研）；与 指标驱动伸缩深入 衔接。

## 一、背景与挑战

原生 HPA 基于 CPU/内存不便适配推理；需扩展或自研控制器。

## 二、核心原理

HPA 支持 custom.metrics；KEDA 支持更丰富源（队列/Prometheus）；自研可感知 KV 占用与 SLO。LLM 常需后者。

## 三、数学形式

HPA 副本 $\lceil m/t\rceil$ 同公式；差异在指标 $m$ 来源与粒度。

## 四、代码实现

```python
# 用 kubernetes client 设置自定义指标 HPA（示意）
hpa.spec.metrics = [{"type": "Pods",
    "pods": {"metric": {"name": "queue_len"}, "target": {"type": "AverageValue", "averageValue": 8}}}]
```

## 五、与其他对比

- 与 推理服务可观测性深入（指标供给）配套；
- 与 弹性推理自动伸缩总览 是落地。

## 六、常见误区

- 以为 HPA 直接懂 KV 占用（需自定义）；
- 伸缩间隔默认 15s 太慢对突发。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- HPA 不够用？答：缺 LLM 领域指标（KV/TPOT），需 KEDA/自定义。

## 九、演进

HPA → KEDA → SLO 感知控制器。

## 十、小结

K8s 弹性需扩展指标源，方能适配 LLM 负载。
