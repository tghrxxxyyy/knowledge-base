# ONNX Runtime优化

> 对应 Microsoft, *ONNX Runtime*, 2019（高性能推理引擎）；与 编译部署深入 衔接。

## 一、背景与挑战

拿到 ONNX 图不等于快，需运行时层优化与硬件加速。

## 二、核心原理

ORT 做图优化（常量折叠、布局、融合）、算子选型（CPU/GPU/EP）、执行计划并行，并通过 Execution Provider 调用 TensorRT/CUDA/OpenVINO。

## 三、数学形式

端到端延迟 $L = L_{graph\_opt} + \sum_k t_k(\text{EP}_k)$；选 EP 使 $\sum t_k$ 最小。

## 四、代码实现

```python
so = ort.SessionOptions()
so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
sess = ort.InferenceSession("m.onnx", so, providers=["CUDAExecutionProvider"])
```

## 五、与其他对比

- 与 算子融合深入（ORT 内融合）重合。
- 与 推理服务部署（Triton 可载 ORT）协同。

## 六、常见误区

- 未指定 EP 默认走 CPU 极慢。
- 图优化级别过低漏掉关键融合。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- ORT 如何加速？答：图优化+多 EP 算子选型+执行并行，并支持 TensorRT/OpenVINO 卸载。

## 九、演进

纯 CPU 推理 → 多 EP → 量化+图优化一体。

## 十、小结

ONNX Runtime 用图优化与 EP 把 ONNX 图转成高效执行。
