# GGUF与llama.cpp

> 对应 GGUF 格式（llama.cpp 第二代）；ggml 张量库。

## 一、背景与挑战

旧 GGML 不支持元数据扩展；GGUF 用键值头+对齐张量，便于多后端加载。

## 二、核心原理

GGUF 含元数据结构（模型名/上下文/量化类型）、对齐张量块；llama.cpp 用 ggml 在 CPU/Apple Metal/CUDA 统一执行。

## 三、数学形式

文件 $= \text{header}(kv) \oplus \bigoplus_i \text{align}(\text{tensor}_i)$；对齐到 32 字节边界提 IO。

## 四、代码实现

```python
# 转换：HF safetensors -> GGUF
python convert_hf_to_gguf.py model --outfile m.Q4_K.gguf
```

## 五、与其他对比

- 与 ONNX/TensorRT（GPU 专用）不同，GGUF 跨端通用。
- 与 低比特推理内核深入 共用量化类型（Q4_K 等）。

## 六、常见误区

- 不同量化类型（Q4_0/Q4_K）精度差异大，混淆。
- GGUF 版本不兼容旧引擎。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- GGUF 相对 GGML 改进？答：键值元数据可扩展、张量对齐、多后端友好。

## 九、演进

PyTorch → GGML → GGUF → 多量化档。

## 十、小结

GGUF+llama.cpp 是端侧推理事实标准，跨硬件易部署。
