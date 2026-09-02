# vLLM 量化部署

> 见「推理优化/vLLM部署实战」与「模型服务化进阶」。

## 一、背景与挑战

高并发服务需高吞吐与低显存。vLLM 通过 PagedAttention 与多种量化后端支持生产部署。

## 二、核心原理

vLLM 集成 AWQ/GPTQ/FP8 等量化，启动时加载量化权重，配合 continuous batching 提升吞吐。

## 三、代码实现

```python
from vllm import LLM
llm = LLM(model="model", quantization="awq")
out = llm.generate("你好", sampling_params=...)
```

## 四、关键要点

- 量化权重 + PagedAttention 显存复用，单卡可服务更多并发。
- 支持张量并行跨多卡。

## 五、与其他对比

- 纯 llama.cpp 轻量；vLLM 偏服务端高并发。

## 六、常见误区

- 量化后吞吐必然降——4-bit 减少显存带宽反而可能提速。

## 七、与开源书对应

- vLLM: https://github.com/vllm-project/vllm
- llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- vLLM 如何结合量化与 PagedAttention 降本增效？

## 九、演进

HuggingFace 原生 → vLLM（吞吐） → 量化+投机解码。

## 十、小结

vLLM + 量化是开源生产部署的高性价比组合。
