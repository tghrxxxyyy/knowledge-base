# Triton 部署

> 见「推理引擎TensorRT」与「推理服务深入/推理服务架构」。

## 一、背景与挑战

多框架（TF/PyTorch/ONNX/TensorRT）统一推理服务需通用服务器。

## 二、核心原理

Triton 支持多后端、动态批、模型集成（ensemble）、并发实例与指标暴露，企业级推理服务器。

## 三、代码实现

```bash
tritonserver --model-repository=./models --http-port=8000
```

## 四、关键要点

- 模型配置（config.pbtxt）定义 IO/批。
- 支持 GPU/CPU 混合。

## 五、与其他对比

- vLLM 专注 LLM；Triton 通用多模型。

## 六、常见误区

- Triton 只跑 TF——支持多后端。

## 七、与开源书对应

- Triton: https://github.com/triton-inference-server
- llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- Triton 相比专用 LLM 服务优势？

## 九、演进

单框架 → 多后端统一 → 云原生。

## 十、小结

Triton 是通用推理服务底座。
