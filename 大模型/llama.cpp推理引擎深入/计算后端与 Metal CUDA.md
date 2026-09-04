# 计算后端与 Metal CUDA

> 对应 ggerganov/llama.cpp; Dao 2022 FlashAttention; Karpathy/llama2.c。

## 一、背景与挑战
同一份 C++ 代码要在 Apple Silicon、NVIDIA、CPU 等多种硬件上高效运行，需抽象后端。

## 二、核心原理
llama.cpp 用后端抽象层：Metal（Apple GPU）、CUDA（NVIDIA）、Vulkan、BLAS（CPU）各实现 matmul/attention 内核，构建时按平台选用。

## 三、形式化与数学基础
线性层计算量：
$ \text{FLOPs} = 2 \cdot m \cdot n \cdot k $
后端负责高效实现该 GEMM 及注意力 softmax。

## 四、代码实现
```cpp
// 后端分派（示意）
#ifdef GGML_USE_METAL
    ggml_backend_metal_init();
#elif GGML_USE_CUDA
    ggml_backend_cuda_init();
#endif
```

## 五、与其他技术对比
PyTorch 靠统一 CUDA 栈；llama.cpp 显式多后端，无运行时依赖，利于嵌入。

## 六、常见误区
误区：Metal 后端很慢。对于端侧足够，且省电，适合离线场景。

## 七、与开源书/权威来源对应
ggml 后端架构见 ggerganov/llama.cpp。见 Dao 2022 FlashAttention。

## 八、面试题
问：llama.cpp 如何跨平台？
答：后端抽象 + 条件编译，各硬件提供专用内核。

## 九、演进与趋势
Vulkan 后端让其在更多 GPU 通用加速。

## 十、小结
多后端抽象是 llama.cpp 无处不在部署的关键。
