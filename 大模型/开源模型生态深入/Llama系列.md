# Llama 系列

> 对应 Touvron et al.《LLaMA》、《Llama 2》与 Dubey et al.《The Llama 3 Herd of Models》（版本与规模以官方最新文档为准）。

## 一、背景与挑战

在 Llama 之前，"有能力的大模型"几乎等价于"闭源 API"。研究者和中小企业拿不到权重，无法做结构级实验，整个下游生态（微调、量化、蒸馏、Agent）缺乏统一可复现的基座。Llama 以相对克制的参数规模配合远超当时惯例的数据量，证明"小而训练充分"能打得过"大而训练不足"。

挑战随之而来：权重开放后社区极快衍生出指令版、量化版、长上下文版，版本林立导致复现困难；许可并非标准开源许可，商用有附加条件；不同代际的 tokenizer、上下文长度与 chat template 差异明显；"Llama 衍生"涵盖从改 prompt 到全量继续预训练的巨大差异。

## 二、核心原理

Llama 是标准 Decoder-only Transformer，但系统采用了当时的最佳实践组合。**Pre-norm + RMSNorm**：$\mathrm{RMSNorm}(x) = \frac{x}{\sqrt{\frac{1}{d}\sum_i x_i^2 + \epsilon}} \odot g$，去掉偏置，数值更稳定。**SwiGLU 激活**：$\mathrm{FFN}(x) = (\mathrm{Swish}(xW_1) \odot xW_2) W_3$，同等参数下表现更好。**RoPE 位置编码**通过复数旋转注入相对位置，外推性质良好。**GQA**（Llama 2 起在较大尺寸引入）降低长上下文缓存。

数据侧是范式转变：Llama 一代的关键洞察来自缩放律——固定算力下，与其堆参数，不如在更多 token 上训更小的模型。Llama 3 进一步显著扩大词表（降低非英语 token 碎片化）、增加数据量与后训练质量，并系统处理多语与工具使用。

## 三、形式化与数学基础

缩放律给出算力最优分配。设算力 $C \approx 6ND$，最小化 $L(N,D) = E + A/N^\alpha + B/D^\beta$ 可得

$$
N^\ast \propto C^{a}, \qquad D^\ast \propto C^{b}, \qquad a + b = 1
$$

指数由 $\alpha, \beta$ 决定（数值以原始论文为准），结论是参数量与数据量应同步放大，而当时主流模型普遍"参数偏大、数据偏少"。

单层注意力的计算量约为

$$
\mathrm{FLOPs}_{\mathrm{attn}} \approx 4 S^2 d + 4 S d^2
$$

$S^2$ 项来自注意力矩阵，$S d^2$ 来自投影，这解释了上下文翻倍时延迟超线性增长。GQA 下 KV 缓存为 $M_{\mathrm{kv}} = 2 L H_{kv} d_h S B \, b_{kv}/8$，其中 $H_{kv} = H_q / g$。

扩大词表的收益可用平均 token 数刻画：非英语文本在词表 $V$ 下的平均 token 数 $T(V)$ 随 $V$ 增大而下降，多语任务的

$$
\Delta\mathrm{Cost} \approx 1 - \frac{T(V_{\mathrm{large}})}{T(V_{\mathrm{small}})}
$$

即成本与上下文占用同时下降，代价是 embedding 与输出层参数增加。

## 四、代码实现

```python
# 加载 Llama-3.1-8B-Instruct；需先在 HF 接受许可
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_ID = "meta-llama/Llama-3.1-8B-Instruct"
tok = AutoTokenizer.from_pretrained(MODEL_ID)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID, torch_dtype=torch.bfloat16, device_map="auto",
    attn_implementation="sdpa")

# Llama 3 使用专用结束符，不传会导致生成不停止
terminators = [tok.eos_token_id, tok.convert_tokens_to_ids("<|eot_id|>")]

messages = [
    {"role": "system", "content": "你是严谨的技术助手，回答控制在三句话内。"},
    {"role": "user", "content": "Pre-norm 与 Post-norm 稳定性有何区别？"},
]
prompt = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
batch = tok(prompt, return_tensors="pt").to(model.device)

with torch.inference_mode():
    out = model.generate(**batch, max_new_tokens=512, eos_token_id=terminators,
                         do_sample=True, temperature=0.6, top_p=0.9)
print(tok.decode(out[0][batch["input_ids"].shape[-1]:], skip_special_tokens=True))

# 部署前的 KV 缓存容量估算
def kv_cache_gb(layers, kv_heads, head_dim, seq_len, batch, dtype_bytes=2):
    return 2 * layers * kv_heads * head_dim * seq_len * batch * dtype_bytes / 1024**3
```

## 五、与其他技术对比

| 维度 | Llama 1 | Llama 2 | Llama 3 / 3.1 |
|------|---------|---------|---------------|
| 归一化 | Pre-norm RMSNorm | 同左 | 同左 |
| 激活 / 位置编码 | SwiGLU / RoPE | 同左 | 同左（长上下文扩展） |
| 注意力 | MHA | 大尺寸引入 GQA | 普遍 GQA |
| 词表 | 较小 | 中等 | 显著扩大 |
| 上下文 | 较短 | 翻倍级提升 | 大幅延长 |
| 后训练 | 无官方 chat | Llama-2-Chat（RLHF） | 更系统的 SFT + 对齐 |

| 维度 | Llama | Qwen | Mistral |
|------|-------|------|---------|
| 生态广度 | 最广，衍生最多 | 国内生态强 | 轻量部署友好 |
| 中文原生能力 | 中，需增量训练 | 强 | 弱 |

## 六、常见误区

- **"Llama 是开源软件"**：它开放权重但用自定义许可，含商用条件与命名要求。
- **认为 3 的 8B 与 2 的 7B 只差 1B**：词表、tokenizer、数据规模与后训练都是换代改动。
- **忽略特殊结束符**：不传 `<|eot_id|>` 会导致不停止或输出多余角色头。
- **用 Llama 2 模板跑 Llama 3**：模板格式不同，会引入系统性退化。
- **认为衍生模型等于原版**：社区微调可能改变对齐与安全性，评测须针对具体权重。
- **只看参数量判断中文能力**：词表覆盖才是决定因素之一。

## 七、与开源书·权威来源对应

- Touvron et al. 2023《LLaMA》：小模型 + 大数据范式的原始论文。
- Touvron et al. 2023《Llama 2》：GQA 应用、RLHF 后训练与安全对齐细节。
- Dubey et al.《The Llama 3 Herd of Models》：Llama 3 的预训练、词表扩展与后训练说明。
- Hoffmann et al. 2022（Chinchilla）与 Kaplan et al. 2020：缩放律两篇奠基工作。
- Zhang & Sennrich 2019（RMSNorm）、Shazeer 2020（SwiGLU）、Su et al. 2021（RoPE）、Ainslie et al. 2023（GQA）：各组件的原始出处。
- Ouyang et al. 2022（InstructGPT）：Llama-2-Chat 后训练遵循的范式。

## 八、面试题

1. Llama 一代最重要的洞察是什么？与当时"堆参数"的惯例有何不同？
2. RMSNorm 与 LayerNorm 的区别？为什么 Pre-norm 更稳定？
3. RoPE 如何实现相对位置编码？为什么有利于长度外推？
4. 扩大词表的收益与代价是什么？为什么对多语特别重要？

## 九、演进与趋势

谱系从"证明小而精可行"到"提供可商用 chat 模型"，再到"系统性预训练 + 后训练 + 长上下文 + 多语"的完整体系；社区侧衍生出指令微调、量化、长上下文外推、中文增强与 Agent 特化分支。趋势上：开放权重与宽松许可的张力持续存在，许可本身成为选型变量；后训练重要性超过继续堆规模；长上下文与工具使用成为标配；衍生模型质量越来越依赖评测与安全对齐。

## 十、小结

Llama 的历史意义在于把大模型从"少数公司的 API"变成"整个社区可实验的工程对象"。技术价值在于把 RMSNorm、SwiGLU、RoPE、GQA 与数据-centric 的缩放律实践组合成可复现的标准配方。理解它应抓住"参数-数据最优分配"这条主线，以及每代在词表、注意力与后训练上的取舍；落地时核对许可与版本规格，并用统一评测框架复现数字。
