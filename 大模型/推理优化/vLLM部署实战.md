# vLLM 部署实战

> 对应 vLLM 文档与 llm-course「Deployment」。

## 一、核心概念

vLLM 是现代 LLM 推理服务的事实标准，核心特性：PagedAttention(高显存利用)、连续批处理、张量并行、OpenAI 兼容 API。部署步骤：

1. 安装 `vllm`；
2. 启动 `vllm serve <model> --tensor-parallel-size N`；
3. 用 OpenAI 客户端调用 `/v1/completions` 或 `/v1/chat/completions`。

## 二、代码实现

```bash
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-2-7b-chat-hf \
  --tensor-parallel-size 1 --gpu-memory-utilization 0.9
```

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8000/v1", api_key="EMPTY")
resp = client.chat.completions.create(model="meta-llama/Llama-2-7b-chat-hf",
    messages=[{"role":"user","content":"你好"}])
```

## 三、关键要点

- `--gpu-memory-utilization` 控制显存占用上限。
- 量化(GPTQ/AWQ)可与 vLLM 配合进一步省显存。

## 四、与开源书的对应

- vLLM: https://github.com/vllm-project/vllm
- llm-course「Deployment」。

## 七、面试题

- vLLM 相比原生 HuggingFace generate 的核心优势？
- 何时需要张量并行？
