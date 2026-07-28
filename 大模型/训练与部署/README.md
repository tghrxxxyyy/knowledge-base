# 训练与部署（Training & Serving）

> 本模块聚焦「大模型从预训练到上线」的工程全链路：**底层原理（Transformer/注意力/KV Cache）→ 微调（SFT/PEFT/LoRA/QLoRA）→ 对齐（RLHF/DPO）→ 推理部署（vLLM/量化/蒸馏）→ 多模态 → 安全与评测**。
>
> 它与本仓库的「上下文工程」「RAG」「记忆」「智能体」形成闭环：那些讲的是**如何用现成模型**，本模块讲的是**如何造模型、改模型、把模型高效跑起来**。

## 学习路径（建议顺序）

```
底层原理(02)  →  微调(03)  →  对齐(04)  →  部署推理(05)
                                               ↓
                                        多模态(06)  →  安全与评测(07)
```

1. 先懂 **02 Transformer 与注意力机制**：KV Cache、RoPE、GQA/MLA、MoE 是所有后续话题的底座。
2. 再做 **03 微调**：决定要不要训、用全参还是 LoRA/QLoRA、显存怎么算。
3. 然后 **04 对齐**：RLHF vs DPO 怎么选、对齐税是什么。
4. 接着 **05 部署**：vLLM 的 PagedAttention、量化（AWQ/GPTQ/FP8）、吞吐与成本。
5. **06 多模态**：CLIP/LLaVA/Qwen2-VL 的架构范式。
6. 最后 **07 安全与评测**：OWASP LLM Top 10、MMLU/OpenCompass/HELM。

## 目录

| 文件 | 内容要点 |
| --- | --- |
| [01 概述与技术全景](01-概述与技术全景.md) | 大模型生命周期、何时微调 vs 提示词 vs RAG、技术选型地图、算力成本概览 |
| [02 Transformer与注意力机制原理](02-Transformer与注意力机制原理.md) | MHA→MQA→GQA→MLA、KV Cache、RoPE、FlashAttention、MoE、长上下文、Sliding Window、Mamba |
| [03 微调技术](03-微调技术.md) | SFT 数据构建、全参微调与显存估算、LoRA/QLoRA/Adapter/Prefix/Prompt Tuning、选型决策 |
| [04 对齐技术](04-对齐技术.md) | 奖励模型、RLHF(PPO)、DPO、Constitutional AI(RLAIF)、IPO/KTO/ORPO/GRPO、对齐税 |
| [05 推理优化与部署工程](05-推理优化与部署工程.md) | vLLM PagedAttention、SGLang/TGI、量化(GPTQ/AWQ/GGUF/FP8)、蒸馏、连续批处理、成本优化 |
| [06 多模态大模型](06-多模态大模型.md) | CLIP、LLaVA、BLIP-2 Q-Former、LLaMA-3.2 Vision、Qwen2-VL、InternVL、原生多模态 |
| [07 安全对齐、红队与评测基准](07-安全对齐、红队与评测基准.md) | OWASP LLM Top 10(2025)、提示注入/越狱/数据投毒与防御、MMLU/HELM/MT-Bench、OpenCompass/lm-eval-harness |

## 核心速览

- **决定是否要训模型**：优先用「提示词工程 + RAG + 上下文工程」解决；只有当任务高度专属、知识冷启动、或需要固化风格/格式时才微调；对齐主要用于安全与偏好。
- **微调首选 LoRA/QLoRA**：2025 年 95% 场景用 LoRA 或 QLoRA；单 8B 模型 LoRA FP16 约 15GB、QLoRA 4bit 约 8GB，消费级显卡即可。
- **部署首选 vLLM**：PagedAttention + 连续批处理带来 2–24× 吞吐提升；量化默认 AWQ(INT4 GPU) / FP8(Hopper)。
- **安全头号风险是提示注入（LLM01）**：当前模型技术无法根除，只能「限制爆炸半径」——最小权限、来源溯源、高危动作人工确认。

## 参考来源（均为公开一手资料）

- **微调/对齐**：Hugging Face PEFT / TRL、LoRA(Hu et al. 2021, arXiv:2106.09685)、QLoRA(Dettmers et al. 2023, arXiv:2305.14314)、DPO(Rafailov et al. 2023, arXiv:2305.18290)、Constitutional AI(Bai et al. 2022, arXiv:2212.08073)
- **部署/推理**：vLLM(Kwon et al. SOSP 2023)、SGLang RadixAttention、Hugging Face TGI、TensorRT-LLM
- **量化**：GPTQ、AWQ、GGUF(llama.cpp)、FP8；bitsandbytes(NF4)
- **多模态**：CLIP(Radford et al. 2021)、LLaVA(Liu et al. 2023, NeurIPS)、BLIP-2(Li et al. 2023)、Qwen2-VL、InternVL
- **安全/评测**：OWASP LLM Top 10 (2025, genai.owasp.org)、MITRE ATLAS、NIST AI RMF、MMLU、HELM(Stanford)、OpenCompass、lm-eval-harness(EleutherAI)、Chatbot Arena
- **开源框架/工具**：Axolotl、Unsloth、LLaMA-Factory、DeepSpeed、 LMDeploy
