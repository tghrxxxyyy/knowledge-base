# 特殊 Token 与对话模板

> 对应 HuggingFace transformers Chat Template 文档与 chat_template Jinja 规范、OpenAI Chat Completions API 角色约定、Raschka *Build a Large Language Model (From Scratch)* 词表与预训练章节、Meta LLaMA 2/3 官方 prompt 格式说明；参见本库「词元化深入」其余篇章与「从零实现 GPT / 指令数据集」。

## 一、背景与挑战

分词器（tokenizer）把文本切成词元（token），除普通子词外，还预留一批**特殊 token**，用来表达序列边界、批处理填充、未知字符、对话角色与多模态占位。这些 token 通常不对应自然语言子串，而是在训练语料里以整块 id 被模型“背下来”，因此它们的 id、嵌入与出现位置共同构成模型的**结构语法**。

工程上真正的痛点有三层：

1. **结构语义隐式且脆弱**。BOS/EOS、角色标记并不携带语义内容，却决定了模型把后续文本当“用户话”还是“助手话”。一旦错位，损失下降正常、生成却胡言乱语，排查极难。
2. **SFT 与推理模板不一致**。指令微调时若用 A 套模板、部署推理时用 B 套，模型学到的条件分布被“换皮”，表现为拒答、复读 system 提示、多轮崩坏。
3. **特殊 token 与子词 id 冲突**。自定义加工具调用标记却未扩表、未在 additional_special_tokens 声明，会被 BPE 拆成普通片段，失去“原子标记”能力，甚至污染正常文本的编码。

因此，把特殊 token 与 chat template 当成**协议**而非“提示词装饰”，是微调与上线的基本纪律。

## 二、核心原理

### 2.1 常见特殊 token 分类

| 类别 | 典型 token | 作用 |
|------|------------|------|
| 序列边界 | BOS（如 LLaMA 的 `<s>`）、EOS（`</s>` 或 GPT-2 的 `endoftext`） | 标记序列起止；EOS 触发解码停止 |
| 批处理填充 | pad | 对齐 batch 内变长序列，通常在 attention mask 中屏蔽 |
| 未知词 | unk | 词表外字符兜底（现代 BPE 多可避免） |
| 对话角色 | ChatML 的 `im_start`/`im_end`、Llama 3 的尖括号角色 | 区分 system/user/assistant 轮次 |
| 工具调用 | `tool_call`、`tool_result`、JSON 代码围栏约定 | 结构化函数调用与返回 |
| 多模态占位 | `image`、`img_patch`、`<image>` | 在文本序列中插入图像 token 位置 |

### 2.2 Chat Template 的结构

主流 chat template 把一轮对话渲染成类似如下的纯文本（再交给 BPE）：

```text
<|system|>
You are a helpful assistant.<|end|>
<|user|>
帮我查天气<|end|>
<|assistant|>
好的，我需要知道城市。<|end|>
```

要点：

- **角色边界是原子 token**，不是普通字符拼出来的；模型在预训练/SFT 阶段已见过这种排列。
- **system 在最前**，承载行为约束；user/assistant 交替；最后一轮 assistant 若尚未回答，推理时停在 assistant 标记之后让模型续写。
- **assistant 的 loss mask**：SFT 通常只对 assistant 回复算损失，user/system 输入部分 mask 掉，避免模型学会“扮演用户”。

### 2.3 加模板对齐（SFT ↔ 推理）

黄金规则：**同一套 chat_template 字符串、同一套 special token ids，训练与推理必须一致**。做法通常是：

1. 以 tokenizer 的 `chat_template`（Jinja）为唯一真源（single source of truth）。
2. 构造指令数据集时 `apply_chat_template(messages, tokenize=False)` 渲染成文本再编码。
3. 部署时 vLLM/TGI/SGLang 直接读同一 tokenizer_config，自动套用。

### 2.4 错误模板的典型症状

| 症状 | 根因 |
|------|------|
| 模型复读 system 提示或 user 原文 | 缺少角色标记，模型分不清输入输出边界 |
| 拒答/“作为 AI 助手”腔调异常 | system 被塞进 user 内容，行为指令失效 |
| 多轮后角色错乱 | 缺少轮次结束标记，或 user/assistant id 对调 |
| 工具调用不触发 | 未加 tool 相关 special token，或训练时未见过调用格式 |
| 图像输入被当乱码 | 多模态占位 id 未对齐视觉编码器的投影维度 |

## 三、形式化与数学基础

设词表为 $\mathcal{V}$，特殊 token 集合为 $\mathcal{S} \subset \mathcal{V}$，且对任意特殊 token $s\in\mathcal{S}$，BPE 合并规则保证 $s$ 被编码为**单个 id**（原子性）。

对话消息序列 $M = [(r_1, x_1), \ldots, (r_n, x_n)]$，其中 $r_i \in \{\text{system},\text{user},\text{assistant},\text{tool}\}$。chat template 是一个确定性渲染函数：

$$
\text{render}(M) = \bigoplus_{i=1}^{n} \big( \langle r_i \rangle \oplus x_i \oplus \langle \text{end} \rangle \big)
$$

其中 $\oplus$ 为 token 序列拼接。模型实际条件为：

$$
p(x_{\text{asst}} \mid \text{render}(M_{\text{ctx}})) = \prod_{t} p_\theta(x_t \mid \text{prefix})
$$

SFT 损失通常只对 assistant 段的有效位置求和：

$$
\mathcal{L} = -\sum_{t \in \mathcal{T}_{\text{asst}}} \log p_\theta(x_t \mid \text{prefix}_{<t})
$$

若训练用 $\text{render}_A$、推理用 $\text{render}_B$，则推理时的条件分布与训练分布存在系统性偏差（train-serve skew），这是“模板错一行、能力掉一半”的数学根源。

## 四、代码实现

```python
from transformers import AutoTokenizer

# 1) 加载并检查 chat template（以真实模型 tokenizer_config 为准）
tok = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-7B-Instruct")
assert tok.chat_template is not None, "该模型未定义 chat_template，需手动补全"

messages = [
    {"role": "system", "content": "你是简洁的后端助手。"},
    {"role": "user", "content": "解释一下什么是幂等性"},
    {"role": "assistant", "content": "幂等性指同一操作执行一次与执行多次效果相同。"},
    {"role": "user", "content": "举个 HTTP 的例子"},
]

# 2) 训练侧：用与推理相同的模板渲染，再 tokenize
text = tok.apply_chat_template(
    messages,
    tokenize=False,
    add_generation_prompt=True,  # 在末尾追加 assistant 起始标记
)
input_ids = tok(text, return_tensors="pt").input_ids

# 3) 若需自定义/固化模板（写回 tokenizer_config.json）
custom = (
    "{% for message in messages %}"
    "<|{{ message['role'] }}|>\n{{ message['content'] }}<|end|>\n"
    "{% endfor %}"
    "{% if add_generation_prompt %}<|assistant|>\n{% endif %}"
)
tok.chat_template = custom

# 4) 扩展特殊 token（工具调用示例）——必须与词表扩容同步
new_tokens = ["<|tool_call|>", "<|tool_result|>"]
tok.add_special_tokens({"additional_special_tokens": new_tokens})
# 注意：之后需 resize_token_embeddings(model) 并继续训练新增 embedding
```

生产踩坑：

- `add_special_tokens` 后忘记 `resize_token_embeddings`，会直接 shape mismatch 或静默复用旧 embedding。
- 只在部分微调任务里加新 token、其余任务没加，导致同一部署里两种编码路径。
- 用非官方 chat 模板微调后，vLLM 启动时仍读 tokenizer_config 里的旧模板，需显式覆盖。

## 五、与其他技术对比

| 维度 | 特殊 Token + Chat Template | 纯文本 Prompt 手拼 | 指令数据集裸拼接 |
|------|---------------------------|--------------------|------------------|
| 结构保证 | 强（原子 token 边界） | 弱（依赖模型泛化） | 中（有分隔符但非原子） |
| SFT/推理一致性 | 由 tokenizer 配置统一 | 依赖人工代码 | 常不一致 |
| 工具/多模态扩展 | 专用占位 id | 易混入正文 | 难对齐 |
| 调试难度 | 模板错位难查 | 格式漂移易发现 | 损失正常、行为异常 |
| 典型场景 | 指令微调、Agent、API 服务 | 预训练续写、简单补全 | 早期 dataset 拼接 |

与「从零实现 GPT」中“预训练用 BOS/EOS + 下一 token 预测”的关系：预训练阶段只需要边界 token；对齐阶段才引入角色 token。二者词表共享时，需保证预训练语料中不把角色 token 当普通文本乱用。

## 六、常见误区

1. **误以为 chat template 是“可选优化”**。对指令模型，它是模型 API 的一部分；换模板等于换接口契约。
2. **训练/推理各写一套字符串拼接**。只要引号、换行、end 标记差一个字符，就可能触发分布偏移。
3. **自定义 special token 未声明为 additional_special_tokens**。会被 BPE 拆散，无法作为结构标记使用。
4. **SFT 对全部 token 算 loss**。把 user 输入也算进损失，模型会学着“输出用户问题”，表现为复读。
5. **忽视 add_generation_prompt 的差异**。训练样本末尾有 assistant 起始标记、推理忘记加（或反过来），首 token 分布就偏。
6. **多模态占位与文本词表 id 空间冲突**。图像占位通常占用一段连续 id，需与 vision tower 的投影长度对齐，不能随机塞。

## 七、与开源书·权威来源对应

- HuggingFace Tokenizers / Chat Template 文档：huggingface.co/docs（搜索 chat templating）
- OpenAI Chat Completions 文档中的 role 约定（system/user/assistant/tool）
- Meta LLaMA 2 / LLaMA 3 官方 prompt 格式（GitHub: meta-llama/llama-models 或 llama-recipes）
- rasbt/LLMs-from-scratch：github.com/rasbt/LLMs-from-scratch（tokenizer 与 instruction 数据章节）
- mlabonne/llm-course：github.com/mlabonne/llm-course（SFT 与数据格式小节）
- 本库相关：「词元化深入」其余篇、「从零实现 GPT / 指令数据集」

## 八、面试题

**问题 1：为什么 SFT 与推理必须使用同一 chat template？**  
要点：模板决定条件分布的输入格式；不一致会造成 train-serve skew，损失看似正常但生成行为漂移；正确做法是模板以 tokenizer 配置为唯一真源，训练渲染与推理服务共用。

**问题 2：BOS/EOS/pad 各自何时用？pad 会不会影响模型？**  
要点：BOS 标记序列开始（部分模型用于激活位置），EOS 标记结束并作为 stop，pad 仅在 batch 对齐时使用且必须被 attention mask 与 loss mask 屏蔽；若 pad 未屏蔽，会污染注意力分布并拉低指标。

**问题 3：如何给模型新增一个工具调用特殊 token？**  
要点：`add_special_tokens` 注册、`resize_token_embeddings` 扩容、准备含该 token 的训练数据、统一 chat_template、验证推理引擎能识别新 id；上线前做编码 round-trip 测试。

**问题 4：SFT 损失为什么通常只算 assistant 段？**  
要点：输入侧（system/user）不是模型要生成的目标；全算会教会模型复述用户问题、破坏对话结构；实现上用 loss_mask 标记 assistant 的有效 span。

**问题 5：多模态模型里的 `<image>` 占位与普通文本 token 有何不同？**  
要点：占位 id 在嵌入层被视觉特征替换/拼接，要求 id 空间与 vision projector 对齐；错位会导致图文错配或 OOB。

**问题 6：线上发现模型突然爱复读 system 提示，排查顺序？**  
要点：先 diff 实际发送的 token ids 与训练样本；检查模板是否被升级覆盖；检查是否丢失 end/role 标记；确认推理引擎的 chat 处理开关（如 raw prompt vs chat）。

## 九、演进与趋势

1. **从手工分隔符到 Jinja chat_template**：早期用 `USER:` / `ASSISTANT:` 纯文本约定，易漂移；现在以 tokenizer 内嵌模板为契约。
2. **角色体系扩展**：system/user/assistant → 增加 tool、function、developer（OpenAI 新命名）、multi-modal placeholder。
3. **工具调用协议化**：从“让模型自由输出 JSON”到受限 grammar（GBNF/JSON schema）+ 专用 special token 双轨。
4. **多轮/多智能体模板**：并行 tool call、嵌套 agent 消息、cache-aware 前缀模板（长 system 可缓存）。
5. **与推理引擎深度绑定**：vLLM/SGLang/TGI 原生读取 chat_template，并在 serving 层做前缀匹配与 KV 复用。

## 十、小结

特殊 token 与 chat template 是模型的“语法层”：BOS/EOS 管边界，pad/unk 管批处理兜底，角色与工具标记管对话结构，多模态占位管跨模态对齐。工程上必须坚持**模板单一真源、训练推理同构、特殊 token 原子且扩表一致**；错位的症状往往不是崩溃而是“看起来能用但行为诡异”，需要用 token 级 diff 和固定回归集来守住契约。把模板当协议来管，是指令模型从实验室走向生产的第一道门槛。
