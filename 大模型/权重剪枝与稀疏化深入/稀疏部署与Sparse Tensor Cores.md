# 稀疏部署与Sparse Tensor Cores

> 对应 NVIDIA/TensorRT-LLM 的稀疏推理与 pytorch/pytorch 稀疏算子支持。

## 一、背景与挑战

即便得到稀疏模型，若推理框架不支持稀疏计算，仍走稠密路径，享受不到加速。部署需匹配硬件稀疏能力。

## 二、核心原理

NVIDIA Ampere+ 的 Sparse Tensor Core 对 2:4 结构化稀疏提供 2x 矩阵乘吞吐。部署时需用支持稀疏的 GEMM kernel（如 cuSPARSELt / TensorRT-LLM），并保持权重为压缩格式。

## 三、形式化与数学基础

稀疏 GEMM 输出：

$ Y=\\sum_{i\\in S_j} W_i X_i,\\quad S_j=\\{i: M_{ij}=1\\},\\ |S_j|=N $

零元素不进入乘加，节省约一半算力。

## 四、代码实现

```python
# 概念: 使用 TensorRT-LLM 的稀疏 GEMM (伪代码)
# builder 配置 --sparse 后, 权重以 2:4 压缩格式传入
# runtime 自动调用 Sparse Tensor Core
print("需硬件支持 + 框架稀疏 kernel, 否则退化为稠密")
```

## 五、与其他技术对比

- CPU 端 sparse 依赖 MKL/专用库，收益不如 GPU Sparse Core 明显。
- 与 INT8 量化叠加需注意 kernel 是否同时支持稀疏与低比特。

## 六、常见误区

- 以为有稀疏权重就自动 2x；必须 Sparse Core + 框架支持。
- 在非 NVIDIA 硬件期望同加速。

## 七、与开源书/权威来源对应

- NVIDIA/TensorRT-LLM: https://github.com/NVIDIA/TensorRT-LLM
- pytorch/pytorch: https://github.com/pytorch/pytorch
- microsoft/DeepSpeed: https://github.com/microsoft/DeepSpeed

## 八、面试题

- Sparse Tensor Core 加速前提？
- 部署稀疏模型需要哪些条件？
- 稀疏与量化能否同时硬件加速？

## 九、演进与趋势

更通用稀疏模式与编译期稀疏优化将降低部署门槛。

## 十、小结

稀疏部署依赖硬件 Sparse Core 与框架稀疏 kernel 的协同，缺一不可。
