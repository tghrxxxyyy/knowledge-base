# PyTorch导出流程

> 对应 PyTorch, *torch.onnx.export / dynamo exporter*, 2024；与 模型导出ONNX深入 衔接。

## 一、背景与挑战

PyTorch 动态图需特化为静态 ONNX 图，旧版 tracing 易漏控制流。

## 二、核心原理

`torch.onnx.export` 以一份样例输入 tracing 执行并记录算子；新版 `dynamo=True` 捕获 FX 图保留控制流与更高保真度。

## 三、数学形式

导出即映射 $\Phi:\text{TorchFX}\to\text{ONNX}(G)$；需保证 $\forall x,\ \text{ONNX}(G)(x)\approx \text{Torch}(x)$。

## 四、代码实现

```python
torch.onnx.export(
    model, (dummy,), "m.onnx",
    input_names=["x"], output_names=["y"],
    dynamo=True,
)
```

## 五、与其他对比

- 与 ONNX总览（导出的产物）对应。
- 与 编译部署深入（导出后编译）衔接。

## 六、常见误区

- tracing 下 if/loop 只走一条分支，控制流丢失。
- 样例输入 shape 与实际不符导致固定形状。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- tracing 与 dynamo 导出区别？答：tracing 只记录一次执行路径丢控制流，dynamo 捕获 FX 图更完整。

## 九、演进

tracing export → scripting → dynamo exporter。

## 十、小结

导出流程是 PyTorch→ONNX 关键，dynamo 显著提升保真度。
