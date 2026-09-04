# OpenTelemetry 在 LLM 链路

> 对应 vllm-project/vllm 与 huggingface/transformers。

## 一、背景与挑战
已有可观测生态基于 OpenTelemetry，LLM 链路需无缝接入而非重新造轮子。

## 二、核心原理
用 OTel SDK 创建 tracer，在推理前后埋点，导出到统一后端做查询与告警。

## 三、形式化与数学基础
采样率影响开销：
$ \text{cost} \approx n \cdot c_{span} \cdot r_{sample} $

## 四、代码实现
```python
from opentelemetry import trace
tracer = trace.get_tracer('llm')
with tracer.start_as_current_span('generate') as sp:
    sp.set_attribute('tokens', 128)
```

## 五、与其他技术对比
OTel 可移植、生态成熟，比私有埋点更可持续。

## 六、常见误区
全量采样压垮后端；未脱敏敏感属性。

## 七、与开源书/权威来源对应
vllm-project/vllm 兼容 OTel；huggingface/transformers 可挂 hook。

## 八、面试题
LLM 链路哪些属性必须脱敏？

## 九、演进与趋势
语义约定让跨厂商追踪可比。

## 十、小结
复用 OTel 是把 LLM 观测纳入现有体系的捷径。
