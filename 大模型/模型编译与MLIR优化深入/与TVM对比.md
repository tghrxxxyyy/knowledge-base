# 编译栈与 TVM 对比

> 对应 Chen et al., *TVM*, 2018；与 MLIR深入 对照。

## 一、背景与挑战

不同编译栈（TVM/XLA/Inductor）在覆盖与目标上差异，需选型。

## 二、核心原理

TVM 自带 Relay/Relax 高层 IR 与自动调度（autoTVM/Metaschedule）搜 kernel；Inductor 借 MLIR 生成 Triton；XLA 服务 JAX/TF。

## 三、数学形式

自动调优搜配置 $c^*=\arg\min_c \text{latency}(c)$；成本在搜索时间。

## 四、代码实现

```python
# TVM 调优示意
task = search_task(mod); lib = tune_and_build(task)
```

## 五、与其他对比

- TVM 跨硬件强但 LLM 生态弱于专引擎；
- 与 量化推理引擎深入（llama.cpp/TensorRT-LLM）重叠。

## 六、常见误区

- 搜参成本高被低估；
- 以为一套调优通吃所有硬件。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- TVM 与 Inductor 区别？答：TVM 自研 IR+自动调度跨硬件；Inductor 借 MLIR 生成 Triton 偏 PyTorch。

## 九、演进

手工 → TVM 自动调度 → MLIR 统一。

## 十、小结

编译栈选型看硬件覆盖与生态，自动调度是性能关键。
