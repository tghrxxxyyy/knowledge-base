# TVM 编译栈

> 见「推理引擎TensorRT」与「编译优化与模型格式/模型格式对比」。

## 一、背景与挑战

不同硬件需手工优化内核，TVM 用自动调度生成高效代码。

## 二、核心原理

把模型降到 TVM IR，经调度原语（split/tiling/vectorize）搜索最优内核，编译到 CPU/GPU/专用加速器。

## 三、代码实现

```python
mod = relay.frontend.from_pytorch(model, shapes)
lib = relay.build(mod, target="cuda")
```

## 四、关键要点

- 自动调优（AutoTVM/Ansor）找最优 schedule。
- 跨硬件统一。

## 五、与其他对比

- TensorRT 偏 NVIDIA；TVM 更通用。

## 六、常见误区

- TVM 开箱最快——需调优才优。

## 七、与开源书对应

- TVM: https://github.com/apache/tvm
- llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- TVM 如何自动找最优调度？

## 九、演进

手工内核 → AutoTVM → Ansor 自动搜索。

## 十、小结

TVM 让模型「一次描述、处处编译」。
