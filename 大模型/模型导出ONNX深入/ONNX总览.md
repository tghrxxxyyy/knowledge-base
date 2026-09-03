# ONNX总览

> 对应 ONNX, *Open Neural Network Exchange*, 2017（Meta/Microsoft 联合规范）；与 编译部署深入 / 模型导出ONNX深入 衔接。

## 一、背景与挑战

框架彼此割裂（PyTorch/TF/自研），模型难以跨运行时部署与加速。

## 二、核心原理

ONNX 定义统一计算图 IR（算子+张量+opset 版本），作为中间表示让多训练框架对接多推理引擎。

## 三、数学形式

图 $G=(V,E)$，$\forall v\in V$ 有算子类型 $op\in\mathcal O$ 与版本 $opset$；引擎按 $opset$ 选实现。

## 四、代码实现

```python
import onnx
m = onnx.load("model.onnx")
onnx.checker.check_model(m)   # 校验图合法性
```

## 五、与其他对比

- 与 编译部署深入（ONNX 常作编译器前端）衔接。
- 与 推理服务部署（Runtime 加载 ONNX）上下游。

## 六、常见误区

- 认为 ONNX 万能，部分自定义算子无标准实现。
- 忽略 opset 版本导致运行时不兼容。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- ONNX 作用？答：用统一 IR 解耦训练框架与推理引擎，实现一次导出多处运行。

## 九、演进

框架私有格式 → ONNX 中间表示 → ONNX Runtime 统一执行。

## 十、小结

ONNX 是跨框架互操作基石，靠统一 IR 与 opset 保证兼容。
