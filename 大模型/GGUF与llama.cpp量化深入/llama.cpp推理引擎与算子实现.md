# llama.cpp推理引擎与算子实现

> 对应 ggerganov/llama.cpp 的 ggml 计算图与 CPU/GPU 后端实现。

## 一、背景与挑战

在 CPU、Apple Silicon、各种 GPU 上高效跑 LLM，需要轻量计算图与多后端 kernel。llama.cpp 用 ggml 这一张量库实现，无第三方依赖。

## 二、核心原理

模型前向被构建为 ggml 计算图，节点对应 matmul、rope、rmsnorm 等算子。按设备选择后端（CPU AVX/NEON、Metal、CUDA、Vulkan），量化权重在对应 kernel 内反量化计算。

## 三、形式化与数学基础

注意力计算仍为：

$ \\text{Attn}(Q,K,V)=\\text{softmax}\\left(\\frac{QK^\\top}{\\sqrt d}\\right)V $

只是 $ Q,K,V $ 来自量化权重的反量化 GEMM。

## 四、代码实现

```c
// 概念: llama.cpp 中反量化乘加 (节选思路)
// for each super-block: dequant q -> f, then acc += f * x
// 由 ggml_vec_dot_q4_K 等函数在不同后端实现
// 此处仅为说明, 实际为 C/C++ kernel
```

Python 侧调用：

```python
from llama_cpp import Llama
llm = Llama(model_path="model.Q4_K_M.gguf", n_ctx=4096)
print(llm("你好，介绍一下量化。")["choices"][0]["text"])
```

## 五、与其他技术对比

- 相比 vLLM：llama.cpp 更轻、跨端广，但吞吐通常较低。
- 相比 DeepSpeed：llama.cpp 面向单机/端侧而非多卡训练。

## 六、常见误区

- 以为 llama.cpp 只支持 CPU；其实多后端。
- n_ctx 过大导致 KV 缓存超出内存。

## 七、与开源书/权威来源对应

- ggerganov/llama.cpp: https://github.com/ggerganov/llama.cpp
- Dao-AILab/flash-attention: https://github.com/Dao-AILab/flash-attention

## 八、面试题

- ggml 计算图如何组织？
- llama.cpp 如何支持多后端？
- 量化权重在哪一步反量化？

## 九、演进与趋势

持续加入 CUDA Graph、更优 KV 缓存与 speculative decoding 以提升吞吐。

## 十、小结

llama.cpp 以自包含 ggml 计算图与多后端 kernel，把量化 LLM 带到各类设备。
