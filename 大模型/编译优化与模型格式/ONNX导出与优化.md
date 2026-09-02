# ONNX 导出与优化

> 见「编译优化与模型格式/模型格式对比」与「推理引擎TensorRT」。

## 一、背景与挑战

跨推理引擎（ONNX Runtime/TensorRT）需统一 IR 并优化。

## 二、核心原理

把 PyTorch 模型导出为 ONNX 计算图，再做图优化（常量折叠、算子融合、量化）提升推理效率。

## 三、代码实现

```python
torch.onnx.export(model, dummy, "m.onnx", dynamic_axes={"x":0})
```

## 四、关键要点

- 动态轴支持变长。
- 部分算子不支持需自定义。

## 五、与其他对比

- ONNX 通用；TensorRT 针对 NVIDIA 更深优化。

## 六、常见误区

- 导出即加速——需后续图优化。

## 七、与开源书对应

- ONNX: https://github.com/onnx/onnx
- llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- ONNX 导出常见坑？

## 九、演进

框架原生 → ONNX → 优化+量化。

## 十、小结

ONNX 是跨引擎部署的通用语言。
