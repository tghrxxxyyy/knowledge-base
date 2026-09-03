# 与vLLM和TensorRT-LLM对应

> 对应 vLLM 与 NVIDIA TensorRT-LLM 的批处理实现差异。

## 一、背景与挑战

两主流引擎调度策略不同，影响易用性与峰值性能。

## 二、核心原理

vLLM 以 Python 调度 + 分页 + 迭代级批，易扩展；TensorRT-LLM 借 in-flight batching 在 kernel 内管理多序列，常配合 Triton 部署，峰值更高但定制重。

## 三、数学形式

两者均最小化每步空槽：目标 $\max_t b_t$，差异在调度执行位置（宿主 vs 设备）。

## 四、代码实现

```python
# TRT-LLM 经 Triton 暴露 ensemble
# vLLM: AsyncLLMEngine 异步调度
```

## 五、与其他对比

- 与 分页注意力与PagedAttention深入（vLLM 特有）区分。
- 与 推理CUDA图优化深入（TRT-LLM 常用）互补。

## 六、常见误区

- 认为 in-flight batching 与连续批处理本质不同（思想一致）。
- 高估某一引擎在所有负载下优势。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- vLLM 与 TRT-LLM 调度区别？答：前者宿主 Python 迭代级批，后者设备内 in-flight，峰值更高。

## 九、演进

单序列 → 连续批 → 设备内 in-flight。

## 十、小结

两引擎殊途同归做迭代级批，取舍在易用性与峰值性能。
