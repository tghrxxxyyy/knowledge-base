# GGUF 与 llama.cpp 部署

> 见「端侧与边缘大模型/边缘端大模型部署与量化实战」。

## 一、背景与挑战

在 CPU/消费级 GPU/手机上跑 LLM 需要轻量运行时与开放格式。llama.cpp + GGUF 是社区主流。

## 二、核心原理

GGUF 是单文件模型格式，内含张量、分词器、超参，支持多种量化类型（Q4_K/Q5_K 等）。llama.cpp 用 C/C++ 实现，零依赖、跨平台。

## 三、关键要点

- 转换：PyTorch → GGUF（convert.py）。
- 量化档位：Q4_K_M 在体积与质量间平衡。

## 四、代码实现

```bash
./llama-cli -m model.Q4_K_M.gguf -p "你好" -n 256
```

## 五、与其他对比

| 运行时 | 语言 | 场景 |
|--------|------|------|
| llama.cpp | C++ | 端侧/CPU |
| vLLM | Python | 服务端高吞吐 |
| TensorRT-LLM | C++ | NVIDIA 极致加速 |

## 六、常见误区

- 以为 GGUF 只能 CPU——其实支持 GPU 卸载（offload）。

## 七、与开源书对应

- llama.cpp: https://github.com/ggerganov/llama.cpp
- llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- GGUF 相比旧 GGML 改进了什么（可扩展性、元数据）？

## 九、演进

GGML → GGUF（标准化） → 多后端（Metal/CUDA/Vulkan）。

## 十、小结

llama.cpp + GGUF 让 LLM 真正跑进笔记本与手机。
