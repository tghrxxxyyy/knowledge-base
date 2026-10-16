# 字节级 BPE

> 对应 Radford et al., *Language Models are Unsupervised Multitask Learners* (GPT-2, 2019)；Sennrich et al. 原始 BPE (ACL 2016) 与字节级变体；tiktoken / HuggingFace `GPT2Tokenizer` 实现；与「词元化深入/中文分词特殊处理」「词表与嵌入规模」互为姊妹篇。彻底消除 OOV 的工程选择。

## 一、背景与挑战

经典 BPE（或 WordPiece、Unigram）建立在**字符/子词字母表**上。若训练语料覆盖不足，遇到：

- 罕见 Unicode 码点、emoji、小语种；
- 拼写变体、新造词、代码里的冷门标识符；

仍可能出现**未登录词（OOV）**：要么整词映射到 `[UNK]`（信息全丢），要么强制拆到最细字母仍失败。多语言场景下，为每个语言维护字母表与分词器会爆炸，且产品文案/用户输入随时可能「长出」训练时不存在的符号。

字节级 BPE（Byte-level BPE）的动机：把建模单元降到 **UTF-8 字节（256 个基本符号）**——任何文本在编码层面都是字节串，字母表闭合，**从定义上保证零 OOV**。词表固定从 256 起步，再在语料上学合并规则，得到「字节级子词」。

代价同样清晰：中文在 UTF-8 下一字 3 字节，若合并表没学到整字/整词，一个汉字可能吃 2～3 个 token，序列变长、注意力与计费上升。因此字节级 BPE 总是与**语料配比、合并预算、中文友好优化**绑定讨论——它是「安全底座」，不是「自动最优」。

## 二、核心原理

### 2.1 与经典 BPE 的差异

| 维度 | 字符/词级 BPE | 字节级 BPE |
| --- | --- | --- |
| 字母表 | 语言相关字符集 | 固定 256 字节 |
| OOV | 可能（冷门码点） | **无** |
| 中文序列长度 | 依赖词典质量 | 常偏长，靠合并缓解 |
| 词表稳定性 | 随语料语言变 | 跨语言一致 |
| 代表 | 早期 NMT、BERT WordPiece | GPT-2/3、RoBERTa、GPT-4 cl100k 系 |

实现上，GPT-2 风格还会把字节映射到「可打印占位符」再做 BPE（避免控制字符干扰），解码时映射回字节。HuggingFace 的 `bytes_to_unicode` 即此逻辑。

### 2.2 训练与推理流程

1. 文本 → UTF-8 字节序列；
2. 每个字节作为初始符号（经字节→占位字符映射）；
3. 用大规模语料统计相邻对频率，迭代合并高频对；
4. 得到 merge 表；编码时按优先级贪心合并；
5. 特殊 token（`<|endoftext|>`、`[PAD]` 等）作为 **added_tokens** 整段保留，不参与字节拆分。

### 2.3 中文等多字节语言的现状

字节级保证「能编」，不保证「编得省」。工程对策：

- 训练语料提高中文占比，让合并表吸收高频汉字/词；
- 词表扩容（cl100k/o200k 含大量汉字组合）；
- 与 SentencePiece 的 unigram/字词混合方案对比选型（见「中文分词特殊处理」）。

## 三、形式化与数学基础

设 UTF-8 编码函数 $E: \mathcal{S} \to \{0,1\}^{8*}$，则对任意字符串 $s$：

$$ s \xrightarrow{E} b_{1:L} \in \{0,\dots,255\}^L $$

BPE 合并规则集合 $\mathcal{M}$ 作用于符号序列，最优合并近似即压缩：

$$ \min_{\text{token seq}} |\tau| \quad \text{s.t.}\quad \text{decode}(\tau)=s $$

贪心按 $\mathcal{M}$ 优先级合并，复杂度 $\mathcal{O}(L)$ 级（每字符一次查表推进）。**压缩率** $\text{CR}=L_{\text{chars}}/|\tau|$（字符/token）；字节级下 $L$ 先是字节数再变 token 数，中文 CR 常低于英文。

无 OOV 证明直白：字母表含全部 256 字节，任何 $s$ 至少可回退为单字节 token 序列。

## 四、代码实现

```python
# tiktoken（OpenAI 官方字节级 BPE）
import tiktoken
enc = tiktoken.get_encoding("cl100k_base")  # GPT-3.5/4 常用词表
ids = enc.encode("Hello 世界")
print(ids, [enc.decode([i]) for i in ids])
print(len(ids) / max(1, len("Hello 世界")))  # 观察压缩比

# HuggingFace GPT-2
from transformers import GPT2TokenizerFast
tok = GPT2TokenizerFast.from_pretrained("gpt2")
print(tok.encode("Hello 世界"))
print(tok.convert_ids_to_tokens(tok.encode("Hello 世界")))
```

```python
# 自定义 added_tokens：特殊符号不拆字节
from transformers import AutoTokenizer
tok = AutoTokenizer.from_pretrained("gpt2")
tok.add_special_tokens({"additional_special_tokens": ["<|tool|>"]})
ids = tok.encode("<|tool|> start")
# <|tool|> 应为单个 id，其后文本再按字节级 BPE 展开
```

排障：中文异常变长 → dump `convert_ids_to_tokens` 看是否碎成 3 字节 token；`decode` 乱码 → 检查是否绕过 tokenizer 自己拼 Unicode；与旧模型混用词表 → **禁止**混 decode/encode。

## 五、与其他技术对比

| 方案 | OOV | 中文效率 | 词表 | 代表 |
| --- | --- | --- | --- | --- |
| 字节级 BPE | 无 | 中 | 稳定 | GPT-2/4 |
| 字符 BPE | 低 | 中 | 中 | 部分 NMT |
| 词级+字回退 | 低 | 高 | 依赖词典 | 传统中文 NLP |
| 字词混合 BPE | 极低 | 高 | 高 | Qwen/ChatGLM |
| SentencePiece unigram | 低 | 中高 | 可采样 | T5、LLaMA(SPM) |

与 **WordPiece**：BERT 系用似然启发合并，非纯频率；仍可能 `[UNK]`（实现上几乎用字符级回退避免）。与 **Unigram**：可概率采样子词，正则化更强。

## 六、常见误区

1. **字节级 = 一汉字一 token**——错；未合并时一字可达 3 token，取决于词表。
2. **换字节级词表没有代价**——等于换 tokenizer，embedding 与解码层都要对齐，不能混用。
3. **只对自然语言有意义**——代码、路径、base64 同样受益于零 OOV；代码语料会学出标识符碎片。
4. **`[UNK]` 永远不会出现**——若实现仍保留 UNK 映射或 added_token 失败，仍可能有；标准字节级路径应无。
5. **词表越大中文越好**——增量合并预算要跟语料与 softmax 成本权衡。

## 七、与开源书·权威来源对应

- Sennrich et al., ACL 2016（BPE）。
- Radford et al., GPT-2 报告与代码中的字节编码。
- tiktoken 文档；HF `GPT2Tokenizer` / `LlamaTokenizerFast` 对照。
- 「词元化深入」板块：中文分词、词表与嵌入、特殊 Token。

## 八、面试题

**1. 字节级 BPE 如何保证无 OOV？**  
要点：字母表即 256 个 UTF-8 字节，任何文本都有单字节回退表示；合并只提升压缩率，不引入「无法编码」。

**2. 为什么中文在字节级 BPE 下可能更贵？**  
要点：UTF-8 汉字占 3 字节；词表若未合并出整字/词，token 数膨胀，序列长度与注意力成本上升。

**3. added_tokens 与普通 BPE token 有何区别？**  
要点：added_tokens（特殊符号、工具调用标记等）作为整体 id 保留，不参与字节拆分与合并，保证协议片段稳定。

**4. GPT-2 与 cl100k 词表有何工程差异？**  
要点：后者词表更大、多语言与代码合并更充分、中文等压缩更好；两者 id 空间不兼容，模型权重与词表必须配套。

**5. 如何评估 tokenizer 好坏？**  
要点：CR（压缩率）、延迟、下游 PPL/任务、长尾与混排错误率；用真实业务语料回归，不只看英文基准。

## 九、演进与趋势

- **更大更均衡词表**：o200k、多语言混合合并，服务多语与代码。
- **无分词探索**：ByT5/字符级字节模型在翻译与鲁棒性上有结果，但大模型主干仍以子词为主。
- **与检索/Agent 协议对齐**：特殊 token 承载工具调用、JSON 模式，词表设计向「系统协议」扩展。
- **端侧词表裁剪**：按领域剪低频合并，降 softmax 与 embedding 显存。

## 十、小结

字节级 BPE 用「字母表 = 全部字节」换来**定义级零 OOV** 与跨语言词表稳定，是 GPT 时代的默认选择。理解时抓住：**安全底座（永不 UNK）≠ 压缩最优（中文仍可能碎）**；工程上必须与语料配比、词表扩容、特殊 token 协议一起看。评测永远用你的业务文本量 CR，而不是英文演示句。
