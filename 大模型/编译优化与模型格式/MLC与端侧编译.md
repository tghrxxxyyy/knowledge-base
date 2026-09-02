# MLC 与端侧编译

> 见「端侧与边缘大模型」与「编译优化与模型格式/模型格式对比」。

## 一、背景与挑战

浏览器/手机/嵌入式跑 LLM 需轻量运行时与编译优化。

## 二、核心原理

MLC LLM 用 TVM 编译模型到 WebGPU/Vulkan/本地后端，统一部署到多平台，支持量化权重。

## 三、代码实现

```bash
mlc_llm chat --model llama-7b-q4 --device webgpu
```

## 四、关键要点

- 一份模型编译多端。
- 依赖设备 GPU 能力。

## 五、与其他对比

- llama.cpp 手写内核；MLC 用 TVM 编译。

## 六、常见误区

- 浏览器跑 LLM 不可能——WebGPU 已可行。

## 七、与开源书对应

- MLC LLM: https://github.com/mlc-ai/mlc-llm
- llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- MLC 如何做到多端统一？

## 九、演进

原生应用 → WebGPU → 编译统一。

## 十、小结

MLC 让 LLM 走进浏览器与边缘。
