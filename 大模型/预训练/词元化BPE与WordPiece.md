# 词元化：BPE 与 WordPiece

> 对应 llm-course「Tokenizers」与 d2l-zh「自然语言处理：预训练」；算法见 Sennrich et al. (2016, BPE)、Schuster & Nakajima (2012, WordPiece)、Kudo (2018, Unigram)、Kudo & Richardson (2018, SentencePiece)。

## 一、背景与挑战

模型无法直接吃文本，必须先映射到离散 token id。若以「词」为单位，词表会爆炸且无法处理未登录词（OOV）；若以「字/字节」为单位，序列过长、语义密度低。子词（subword）方法在二者间折中：用可拼接的子词单元覆盖任意词，同时控制词表规模。

核心挑战：
- **压缩率**：同一文本 token 数越少越好（省钱、扩上下文）。
- **OOV 处理**：罕见词/新词应能拆成已知子词。
- **跨语言一致性**：多语共享词表时子词粒度要均衡。

## 二、核心原理

- **BPE（Byte-Pair Encoding）**：从字符/字节出发，反复合并语料中最高频的相邻符号对，构建子词词表。GPT-2/LLaMA 采用。
- **WordPiece**：类似 BPE，但合并依据「合并后语言模型似然增益」而非频率。BERT 采用。
- **Unigram**：从大词表出发，基于语言模型概率逐步删除「删除损失最小」的子词，保留概率高的单元。SentencePiece 常用。
- **SentencePiece**：把空格也当作普通字符（`▁`），无需预分词，天然支持多语言与字节回退。

## 三、形式化与数学基础

BPE 合并准则：对相邻符号对 $(a,b)$，选共现频次最高者合并：

$$
(a^*,b^*)=\arg\max_{(a,b)}\text{count}(a,b),\quad \text{vocab}\leftarrow\text{vocab}\cup\{ab\}
$$

WordPiece 改用对数似然增益：

$$
\text{gain}(a,b)=\frac{\text{count}(ab)}{\text{count}(a)\cdot\text{count}(b)}
$$

增益越大说明 $a,b$ 越「成词」，越值得合并。Unigram 在给定词表上最小化：

$$
\mathcal{L}=-\sum_{x}\log P(x),\quad P(x)=\prod_{u\in \text{seg}(x)} p(u)
$$

通过删除低概率子词来精简词表。

## 四、代码实现

使用 HuggingFace/SentencePiece 训练与推理：

```python
from transformers import AutoTokenizer
tok = AutoTokenizer.from_pretrained("meta-llama/Llama-2-7b-hf")
ids = tok("大模型让 NLP 更简单", add_special_tokens=False)
print(ids, tok.convert_ids_to_tokens(ids))

# 训练自己的 SentencePiece（多语场景）
# spm.SentencePieceTrainer.train(input="corpus.txt", model_prefix="spm",
#                                vocab_size=32000, character_coverage=0.999)
```

## 五、与其他技术对比

| 算法 | 代表 | 合并/剪枝依据 | 空格处理 |
|------|------|--------------|----------|
| BPE | GPT/LLaMA | 共现频率 | 需预分词 |
| WordPiece | BERT | 似然增益 | 需预分词 |
| Unigram | mT5/SentencePiece | 语言模型概率 | `▁` 符号 |
| 字符/字节 | 一些模型 | 无 | 字节级 |

## 六、常见误区

- **不同 tokenizer 的 token 数可比**「字数」：中文压缩率远低于英文，数量级不可直接比。
- **推理时用与训练不一致的 tokenizer**：分布偏移，模型「读不懂」自己的输入。
- **词表越大越好**：过大增加 embedding 参数与显存，边际收益递减。
- **忽视特殊 token 与边界**：未正确处理 BOS/EOS/UNK 会导致序列错位。

## 七、与开源书·权威来源对应

- Sennrich et al., *Neural Machine Translation of Rare Words with Subword Units*, 2016.
- Schuster & Nakajima, *Japanese and Korean Voice Search*, 2012（WordPiece）.
- Kudo, *Subword Regularization (Unigram)*, 2018.
- Kudo & Richardson, *SentencePiece*, 2018.
- llm-course「Tokenizers」：https://github.com/mlabonne/llm-course#llm-fundamentals

## 八、面试题

- BPE 与 WordPiece 的合并准则有何不同？
- 为何中文场景下 token 数通常远多于英文单词数？
- SentencePiece 用 `▁` 表示空格有什么好处？
- Unigram 为何从「大词表」开始做删除而非合并？

## 九、演进与趋势

- **字节级 BPE**：以字节为最小单元，彻底消除 OOV（如 GPT-2 的 byte-level）。
- **与模型联合优化**：有研究让 tokenizer 随训练自适应调整。
- **多语均衡**：针对低资源语言提升字符覆盖、降低子词碎片。
- **长上下文下的压缩**：更高压缩率 = 同样窗口装更多文本。

## 十、小结

子词分词是大模型输入管线的第一步，直接决定词表、压缩率与跨语言能力。BPE 按频率、WordPiece 按似然增益、Unigram 按概率剪枝、SentencePiece 统一多语处理。工程上务必保证「训练/推理用同一 tokenizer」。具体实现与参数以官方最新文档为准。
