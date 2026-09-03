# 与 llama.cpp 量化对比

> 对应 llama.cpp GGML/GGUF 量化实践。

## 一、背景与挑战

不同引擎量化格式（GPTQ/AWQ/GGUF）生态与硬件支持不同；llama.cpp 主打 CPU/边缘。

## 二、核心原理

llama.cpp 用 GGUF 存多种 q4/q5/k 量化（按块量化+重要性矩阵），纯 C/CUDA 内核，覆盖 CPU/GPU/边缘；与 GPU 引擎（TensorRT-LLM）路线互补。

## 三、数学形式

块量化：$\hat W_{block}=q(W_{block},s_{block})$；重要性矩阵补关键权重到更高比特。

## 四、代码实现

```python
# 用 llama.cpp python 绑定量化（示意）
from llama_cpp import llama_quantize
llama_quantize("model.f16", "model.q4_K.gguf", "q4_K")
```

## 五、与其他对比

- 比 GPU 引擎更偏跨端/低资源；
- 与 GPTQ/AWQ深入（GPU 格式）对照。

## 六、常见误区

- 以为 q4_K 等同 GPTQ 4bit（格式/保真不同）；
- 跨引擎混用格式不兼容。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- llama.cpp 优势？答：跨端纯 C 内核+GGUF 多档量化，适合 CPU/边缘部署。

## 九、演进

fp16 → q8 → q4_K/k 系列。

## 十、小结

llama.cpp 以 GGUF 多档量化覆盖边缘，与 GPU 引擎互补。
