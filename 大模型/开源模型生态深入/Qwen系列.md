# Qwen 系列

> 对应 Qwen 官方技术报告（Qwen / Qwen2 / Qwen2.5，版本与规格以官方最新文档为准）与 Vaswani et al. 2017《Attention Is All You Need》。

## 一、背景与挑战

中文场景长期尴尬：以英文语料为主的开放权重模型在中文理解、知识、写作上明显偏弱，而国内业务绝大多数请求是中文。直接用英文模型凑合会带来事实性错误、语序生硬、拒答率异常；重新预训练则成本高昂。

Qwen 的意义在于从预训练阶段就把中文与多语作为一等公民，并覆盖从 0.5B 到数百亿参数的完整尺寸梯度，同时开放 Base 与 Instruct 版本。挑战随之而来：尺寸多导致选型困难；长上下文版本显存画像不同；不同代际的 tokenizer 与 chat template 有差异；量化后的中文退化需单独验证。

## 二、核心原理

底座是标准 Decoder-only Transformer，关键改进有四点。一是 **Tokenizer 针对多语优化**：基于 BPE 的大词表对中文压缩率显著高于英文中心的词表，同样文本消耗更少 token。二是 **GQA** 降低 KV 缓存，使长上下文部署可行。三是 **RoPE 配合长上下文扩展**，支持远超训练长度的窗口。四是训练数据侧大量清洗与多语配比，后训练阶段强化指令跟随、工具调用与长文本。

后训练通常经历 SFT 与偏好对齐（DPO 一类方法），并针对函数调用、JSON 输出、Agent 场景做数据增强。这是它"听话"的原因——不是架构魔法，而是后训练数据与目标函数的选择。具体算法组合以官方技术报告为准。

## 三、形式化与数学基础

自回归目标仍是最大化序列似然：$\mathcal{L} = -\sum_t \log P_\theta(x_t \mid x_{<t})$。中文的关键差异在**分词粒度**：设字符数 $C$、token 数 $T$，压缩率 $\rho = C/T$，则

$$
\mathrm{Cost} \propto \frac{C}{\rho}, \qquad \mathrm{EffectiveContext} = \rho \cdot S_{\max}
$$

$\rho$ 越大，同样上下文窗口容纳越多中文字符，按 token 计费的成本越低。词表设计因此对中文不是细节而是核心指标。

GQA 的缓存压缩：查询头数 $H_q$、KV 头数 $H_{kv}$，分组比 $g = H_q / H_{kv}$，缓存为

$$
M_{\mathrm{kv}} = 2 L H_{kv} d_h \cdot S \cdot B \cdot \frac{b_{kv}}{8}
$$

相比 MHA 缩小为 $1/g$。偏好对齐阶段，DPO 的隐式奖励为 $r(x,y) = \beta \log \frac{\pi_\theta(y|x)}{\pi_{\mathrm{ref}}(y|x)}$，Qwen 一类 instruct 模型的后训练正是这类目标的工程化落地。

## 四、代码实现

```python
# 加载 Qwen2.5-Instruct 并走官方 chat template
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_ID = "Qwen/Qwen2.5-7B-Instruct"
tok = AutoTokenizer.from_pretrained(MODEL_ID)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID,
    torch_dtype=torch.bfloat16,
    device_map="auto",
    attn_implementation="flash_attention_2",   # 不支持时退回 "sdpa"
)

messages = [
    {"role": "system", "content": "你是中文技术写作助手，回答务必简洁。"},
    {"role": "user", "content": "解释为什么中文场景要关注 token 压缩率。"},
]
prompt = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
batch = tok(prompt, return_tensors="pt").to(model.device)

with torch.inference_mode():
    out = model.generate(**batch, max_new_tokens=512, do_sample=False,
                         repetition_penalty=1.05)

print(tok.decode(out[0][batch["input_ids"].shape[-1]:], skip_special_tokens=True))

# 中文压缩率自检：同一段中文在不同 tokenizer 下的字符/token 比
def compression_rate(tokenizer, text):
    ids = tokenizer(text, add_special_tokens=False)["input_ids"]
    return len(text) / max(len(ids), 1)
```

## 五、与其他技术对比

| 维度 | Qwen 系列 | Llama 系列 | DeepSeek 系列 | Mistral 系列 |
|------|-----------|------------|---------------|--------------|
| 中文能力 | 强，预训练即覆盖 | 中，需增量训练 | 强 | 偏英文/欧语 |
| 多语覆盖 | 广 | 广 | 中英为主 | 欧语为主 |
| 尺寸梯度 | 极小到超大全覆盖 | 较全 | 较全 | 以中小为主 |
| 工具调用 | 后训练专门增强 | 依赖社区微调 | 依赖版本 | 依赖版本 |
| 生态适配 | 国内部署方案友好 | 国际生态最广 | 推理/蒸馏活跃 | 轻量部署友好 |
| 许可 | 需按具体模型核对 | 自定义社区许可 | 需按模型核对 | 需按模型核对 |

## 六、常见误区

- **"Qwen 只适合中文"**：它同样具备较强的多语与代码能力，只是中文优势最明显。
- **复用英文 prompt 模板**：不用官方 chat template 会显著削弱指令跟随。
- **认为小尺寸等于弱能力**：蒸馏与强后训练可让小模型在特定任务接近更大模型。
- **长上下文免费**：上下文越长，KV 缓存与注意力开销越大，延迟明显上升。
- **量化后不重测中文**：低比特对中文与数学的退化往往大于英文闲聊。

## 七、与开源书·权威来源对应

- Qwen / Qwen2 / Qwen2.5 Technical Report：架构、数据配比与评测的一手来源，规格以官方最新文档为准。
- Vaswani et al. 2017《Attention Is All You Need》：Qwen 所基于的 Transformer 原始论文。
- Ainslie et al. 2023《GQA》：分组查询注意力，解释 KV 缓存优化。
- Su et al. 2021《RoFormer / RoPE》：旋转位置编码，长上下文能力的数学基础。
- Rafailov et al. 2023《DPO》与 Ouyang et al. 2022（InstructGPT）：instruct 模型常用的对齐范式。
- Gao et al.《lm-evaluation-harness》：跨系列比较时应使用统一评测框架。

## 八、面试题

1. 为什么中文场景的 tokenizer 压缩率直接影响推理成本？给出关系式。
2. GQA 相比 MHA 节省多少 KV 缓存？分组比如何计算？
3. 为什么必须使用 `apply_chat_template`？不用的后果是什么？
4. 如何评估一个中文模型在你的业务上是否真的更好？设计评测流程。

## 九、演进与趋势

路线大致是"初代 → 1.5（统一架构与开源节奏）→ 2（能力补齐）→ 2.5（数据跃升、长上下文与工具调用）"，并扩展到 MoE、多模态、数学与代码专用分支。趋势上：通用基座之外分化出 Coder / Math / VL 等垂直系列；长上下文与 Agent 能力成为后训练重点；蒸馏把能力压到端侧规模；部署工具链趋于开箱即用。

## 十、小结

Qwen 的竞争力在于面向中文与多语的 tokenizer 与数据设计、完整尺寸梯度、以及强调指令跟随与工具调用的后训练。理解它要把"中文优势"还原成可度量指标——压缩率、有效上下文长度、对齐目标，而不是停在印象层面。选型时应按具体版本核对许可与上下文规格，并在自有数据上复测。
