# GGUF元数据结构与张量存储

> 对应 ggerganov/llama.cpp 的 gguf 元数据规范与张量布局文档。

## 一、背景与挑战

要让推理引擎正确还原模型，必须记录 dtype、shape、量化类型、对齐方式等。GGUF 用强类型 KV 元信息解决这一问题。

## 二、核心原理

元数据键值采用类型标签（uint/string/array/float32 等），张量信息表记录每个张量的 name、n_dims、shape、ggml_type、offset。数据区按对齐边界（如 32 字节）排列。

## 三、形式化与数学基础

张量定位：

$ \\text{addr}(T_i)=\\text{data\\_base}+\\text{align}(\\text{offset}_i) $

$ \\text{align}(x)=\\lceil x/A\\rceil\\cdot A,\\quad A=32 $

## 四、代码实现

```python
import json

def tensor_offset(meta, name):
    for t in meta["tensors"]:
        if t["name"] == name:
            return t["offset"], t["ggml_type"], t["shape"]
    raise KeyError(name)

# GGUF 还存 general.architecture / tokenizer.ggml 等 KV
print("元数据驱动张量定位, 无需硬编码 shape")
```

## 五、与其他技术对比

- safetensors 也含头，但 GGUF 额外有量化类型与推理所需全部元信息。
- PyTorch 的 .bin 需配套 config.json，GGUF 自包含。

## 六、常见误区

- 手动改 offset 导致对齐错误、加载崩溃。
- 忽略 ggml_type，误把量化权重当 FP32 解读。

## 七、与开源书/权威来源对应

- ggerganov/llama.cpp: https://github.com/ggerganov/llama.cpp
- huggingface/transformers: https://github.com/huggingface/transformers

## 八、面试题

- GGUF 如何保证张量对齐？
- ggml_type 起什么作用？
- 为什么 GGUF 能自包含推理所需信息？

## 九、演进与趋势

随着新量化类型增加，元数据 schema 持续扩展，保持向后兼容。

## 十、小结

GGUF 的元数据 + 张量信息表让模型文件自描述、可移植，是端侧部署的基础设施。
