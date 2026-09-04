# TensorRT-LLM 架构概览

> 对应 NVIDIA/TensorRT-LLM; Dao 2022 FlashAttention; Ainslie 2023 GQA。

## 一、背景与挑战
PyTorch 原生推理有解释开销与未融合算子，难以榨干 GPU。TensorRT-LLM 把模型编译为高度优化的 CUDA 引擎。

## 二、核心原理
用 Python API 描述模型，经构建期图优化、算子融合、量化生成 TensorRT 引擎；运行时以 Triton 或直接 C++/Python 服务，支持 in-flight batching。

## 三、形式化与数学基础
注意力计算（与标准一致）：
$ \text{Attn}(Q,K,V)=\text{softmax}(QK^\top/\sqrt{d})V $
TensorRT-LLM 用 FlashAttention 实现以省显存带宽。

## 四、代码实现
```python
import tensorrt_llm
model = tensorrt_llm.LLM("meta-llama/Llama-3-8B")
# 构建引擎后直接生成
output = model.generate(prompts, max_new_tokens=128)
```

## 五、与其他技术对比
相比 vLLM（Python 调度 + CUDA 核），TRT-LLM 编译期优化更深、延迟更低，但构建与迭代更重。

## 六、常见误区
误区：TRT-LLM 开箱即最快。需正确配置量化与 batching，否则未必胜出。

## 七、与开源书/权威来源对应
NVIDIA TensorRT-LLM 官方仓库。见 NVIDIA/TensorRT-LLM、Dao 2022 FlashAttention。

## 八、面试题
问：TRT-LLM 与 vLLM 取舍？
答：极致低延迟选 TRT-LLM；快速迭代与生态选 vLLM。

## 九、演进与趋势
与 TensorRT-LLM backend for Triton 深度集成，支持分离式部署。

## 十、小结
TRT-LLM 以编译优化换取极致推理性能，是 NVIDIA 栈的推理首选。
