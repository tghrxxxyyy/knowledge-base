# vLLM 部署实战

> 对应 vLLM 官方文档与 llm-course「Deployment / Inference」(mlabonne)。

## 一、背景与挑战

把开源大模型落地为线上服务，原生 HuggingFace `generate` 在吞吐、显存利用、并发上都不满足生产要求。vLLM 凭借 **PagedAttention（高显存利用）、连续批处理、张量并行、以及 OpenAI 兼容 API**，成为当下最主流的推理服务框架。本篇聚焦从安装到可调用的完整链路与关键参数。

## 二、核心原理

vLLM 的吞吐优势来自三部分协同：分页 KV Cache 让显存可精细复用；连续批处理按 token 步动态进出请求；张量并行把大模型切到多卡。对外暴露 `/v1/chat/completions`、`/v1/completions`、`/v1/models` 等 OpenAI 兼容端点，使既有 OpenAI 客户端零改动接入。

## 三、形式化与数学基础

部署需满足显存约束。设单卡显存 $M_{\text{gpu}}$，模型权重占 $M_w$，KV 预算比例由 `--gpu-memory-utilization` 控制为 $u$，则可用于 KV 的显存：

$$M_{\text{kv}} = u \cdot M_{\text{gpu}} - M_w - M_{\text{overhead}}.$$

单请求峰值 KV 为 $M_{\text{req}} = 2 \cdot n_{\text{layers}} \cdot S \cdot n_{\text{heads}} \cdot d_{\text{head}} \cdot s_{\text{bytes}}$（$S$ 为最大序列长）。在并发上限内需 $\sum M_{\text{req}} \le M_{\text{kv}}$。张量并行度 $P$ 应使 $M_w/P \le M_{\text{gpu}}$。

## 四、代码实现

启动服务（单机单卡示例）：

```bash
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-2-7b-chat-hf \
  --tensor-parallel-size 1 \
  --gpu-memory-utilization 0.9 \
  --max-model-len 4096 \
  --port 8000
```

多卡张量并行：

```bash
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-2-70b-chat-hf \
  --tensor-parallel-size 4
```

用 OpenAI 客户端调用：

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8000/v1", api_key="EMPTY")
resp = client.chat.completions.create(
    model="meta-llama/Llama-2-7b-chat-hf",
    messages=[{"role": "user", "content": "你好"}],
    max_tokens=256, temperature=0.7)
print(resp.choices[0].message.content)
```

## 五、与其他部署方式对比

| 方式 | 吞吐 | 易用 | 显存利用 |
|------|------|------|---------|
| HF pipeline / generate | 低 | 高 | 低 |
| vLLM | 高 | 高 | 高 |
| TRT-LLM | 最高(NVIDIA) | 中 | 高 |
| llama.cpp | 中(CPU/GPU) | 高 | 中 |

## 六、常见误区

- **把 `--gpu-memory-utilization` 设到 0.99**：留余量避免与 CUDA 上下文、激活值争抢导致 OOM。
- **忽略 `--max-model-len`**：超过会报错或被迫截断，需与 KV 预算匹配。
- **以为量化无损**：GPTQ/AWQ 省显存但质量略降，应测验证后使用。
- **不监控指标**：生产应观察 TTFT、TPOT、p99 延迟与 GPU 利用率，仅靠「能返回」判断不够。
- **多 LoRA 混用未设 `max_lora`**：同卡加载多个适配器需预留显存与路由配置，否则报错。

## 七、与开源书·权威来源对应

- vLLM 文档：https://docs.vllm.ai
- vLLM 仓库：https://github.com/vllm-project/vllm
- llm-course「Deployment」(mlabonne)：https://github.com/mlabonne/llm-course
- Kwon et al., *vLLM: ... PagedAttention*, 2023。

## 八、面试题

- vLLM 相比原生 HF generate 的核心优势是什么？
- 何时需要张量并行？如何估算 `--tensor-parallel-size`？
- 显存不足时应优先调哪个参数？

## 九、演进与趋势

vLLM 持续集成：前缀缓存（prefix caching）复用系统提示、投机解码、量化（GPTQ/AWQ/FP8）、多 LoRA 共存、以及兼容更多硬件（AMD/Intel/CPU）。与 Triton、Ray Serve 结合可构建生产级网关。SGLang、LMDeploy 也在同一赛道竞争。

## 十、小结

vLLM 通过 PagedAttention + 连续批处理 + 张量并行 + OpenAI 兼容 API，把开源模型变成高吞吐、易接入的线上服务；部署关键是按显存预算合理设置 `--tensor-parallel-size`、`--gpu-memory-utilization`、`--max-model-len`，并按需叠加量化与投机解码。
